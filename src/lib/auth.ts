import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from './prisma';

export interface AdminSession {
  user: {
    id: string;
    email: string;
    name?: string | null;
    role: 'ORG_ADMIN';
    organizationId: string;
  };
  organization: {
    id: string;
    name: string;
  };
}

export const SESSION_COOKIE_NAME = 'kasbuka_session';

/**
 * Hash token sesi menggunakan SHA-256 (Aturan 8.2 C).
 * Token mentah dikirim ke cookie klien, hanya hash SHA-256 yang disimpan di database.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Hash password baru dengan bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Verifikasi password terhadap hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Mengambil sesi admin server-side dari cookie HttpOnly
 * Mengembalikan AdminSession jika valid dan aktif, atau null jika tidak terautentikasi
 */
export async function getServerSession(req?: Request): Promise<AdminSession | null> {
  try {
    let rawToken: string | undefined;

    if (req) {
      const cookieHeader = req.headers.get('cookie') || '';
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
      if (match) {
        rawToken = match[1];
      }
    }

    if (!rawToken) {
      try {
        const cookieStore = await cookies();
        rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      } catch {
        // cookies() dipanggil di luar request scope (misal unit test)
      }
    }

    if (!rawToken) {
      return null;
    }

    const hashedToken = hashSessionToken(rawToken);

    const session = await prisma.session.findUnique({
      where: { token: hashedToken },
      include: {
        user: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    // Periksa kedaluwarsa sesi
    if (session.expiresAt < new Date()) {
      return null;
    }

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
        organizationId: session.user.organizationId,
      },
      organization: {
        id: session.user.organization.id,
        name: session.user.organization.name,
      },
    };
  } catch (err) {
    console.error('Error saat membaca session:', err);
    return null;
  }
}
