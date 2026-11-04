import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { verifyPassword, hashSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const LoginSchema = z.object({
  email: z.string().email('Format email tidak valid.'),
  password: z.string().min(1, 'Password wajib diisi.'),
});

// Pre-computed valid bcrypt hash untuk memitigasi timing attack saat user tidak ditemukan (Aturan 8.2 C)
const DUMMY_BCRYPT_HASH = '$2a$10$wT8m9gU.6J8lT3wB4uM8ueV7gO3zM8m9gU.6J8lT3wB4uM8ueV7gO';

export async function POST(request: Request) {
  // 1. Rate Limiter per IP (PRD 4.6 & Aturan 8.2 C: batas 5 per menit per IP)
  const clientIp = getClientIp(request);
  const ipRateLimit = await checkRateLimit({
    key: `login:ip:${clientIp}`,
    limit: 5,
    windowMs: 60 * 1000,
  });

  if (!ipRateLimit.success) {
    return NextResponse.json(
      { error: 'Terlalu banyak percobaan login. Silakan coba 1 menit lagi.' },
      { status: 429 }
    );
  }

  // 2. Parse & Validasi Body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON tidak valid.' }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // Normalisasi email ke lowercase (Aturan 8.2 C)
  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;

  // 3. Rate Limiter per Email (kunci terpisah di tabel RateLimit)
  const emailRateLimit = await checkRateLimit({
    key: `login:email:${email}`,
    limit: 5,
    windowMs: 60 * 1000,
  });

  if (!emailRateLimit.success) {
    return NextResponse.json(
      { error: 'Terlalu banyak percobaan login untuk akun ini. Silakan coba 1 menit lagi.' },
      { status: 429 }
    );
  }

  // 4. Cari user
  const user = await prisma.user.findUnique({
    where: { email },
    include: { organization: true },
  });

  if (!user) {
    // Jalankan perbandingan dummy bcrypt agar waktu respons identik (timing-attack protection)
    await verifyPassword(password, DUMMY_BCRYPT_HASH);
    return NextResponse.json({ error: 'Email atau password salah.' }, { status: 401 });
  }

  // 5. Verifikasi password dengan bcrypt
  const isMatch = await verifyPassword(password, user.passwordHash);
  if (!isMatch) {
    return NextResponse.json({ error: 'Email atau password salah.' }, { status: 401 });
  }

  // 6. Buat session token di database (hanya hash SHA-256) & cookie HttpOnly (token mentah)
  const rawToken = randomUUID();
  const hashedToken = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 hari

  await prisma.session.create({
    data: {
      userId: user.id,
      token: hashedToken,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  return NextResponse.json({
    message: 'Login berhasil.',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    },
  });
}

