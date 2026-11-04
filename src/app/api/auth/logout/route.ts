import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { hashSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (rawToken) {
      const hashedToken = hashSessionToken(rawToken);
      await prisma.session.deleteMany({
        where: { token: hashedToken },
      });
    }

    cookieStore.delete(SESSION_COOKIE_NAME);

    return NextResponse.json({ success: true, message: 'Berhasil keluar.' });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Gagal memproses logout.' }, { status: 500 });
  }
}
