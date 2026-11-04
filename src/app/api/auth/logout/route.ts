import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { hashSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function POST(req?: Request) {
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
        cookieStore.delete(SESSION_COOKIE_NAME);
      } catch {
        // cookies() outside request context (e.g. unit test)
      }
    }

    if (rawToken) {
      const hashedToken = hashSessionToken(rawToken);
      await prisma.session.deleteMany({
        where: { token: hashedToken },
      });
    }

    const response = NextResponse.json({ success: true, message: 'Berhasil keluar.' });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Gagal memproses logout.' }, { status: 500 });
  }
}
