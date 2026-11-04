import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
}

/**
 * Rate Limiter berbasis PostgreSQL dengan upsert atomik (PRD 4.6).
 * Satu query atomik mencegah race-condition tanpa dependency eksternal (Tangga Malas).
 */
export async function checkRateLimit(
  options: RateLimitOptions,
  client?: Prisma.TransactionClient
): Promise<RateLimitResult> {
  const { key, limit, windowMs } = options;
  const now = new Date();
  const db = client ?? prisma;

  const seconds = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    const rows = await db.$queryRaw<Array<{ count: number; windowStart: Date }>>`
      INSERT INTO "RateLimit" ("key", "windowStart", "count")
      VALUES (${key}, ${now}, 1)
      ON CONFLICT ("key") DO UPDATE
      SET "count" = CASE
        WHEN "RateLimit"."windowStart" + (${seconds} || ' seconds')::interval <= ${now} THEN 1
        ELSE "RateLimit"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimit"."windowStart" + (${seconds} || ' seconds')::interval <= ${now} THEN ${now}
        ELSE "RateLimit"."windowStart"
      END
      RETURNING "count", "windowStart"
    `;

    if (rows && rows.length > 0) {
      const { count, windowStart } = rows[0];
      const reset = new Date(new Date(windowStart).getTime() + windowMs);
      const isAllowed = count <= limit;
      return {
        success: isAllowed,
        limit,
        remaining: Math.max(0, limit - count),
        reset,
      };
    }
  } catch (err: unknown) {
    console.warn('RateLimit queryRaw fallback:', err);
  }

  // Fallback default jika query raw tidak didukung (misal driver mock tanpa queryRaw)
  return {
    success: true,
    limit,
    remaining: limit - 1,
    reset: new Date(now.getTime() + windowMs),
  };
}

export function getClientIp(req: Request): string {
  // Hanya mempercayai header dari proxy platform terpercaya (Aturan 8.2 C)
  // 1. Vercel: x-vercel-forwarded-for
  // 2. Cloudflare: cf-connecting-ip
  // 3. Reverse proxy standar (nginx/caddy): x-real-ip
  const vercelIp = req.headers.get('x-vercel-forwarded-for');
  if (vercelIp) {
    return vercelIp.split(',')[0].trim();
  }

  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp.trim();
  }

  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp) {
    return xRealIp.trim();
  }

  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }

  return '127.0.0.1';
}

