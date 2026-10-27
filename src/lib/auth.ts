import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
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
export async function getServerSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      return null;
    }

    const session = await prisma.session.findUnique({
      where: { token },
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
