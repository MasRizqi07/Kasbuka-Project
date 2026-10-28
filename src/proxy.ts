import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const SESSION_COOKIE_NAME = 'kasbuka_session';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // 1. Proteksi rute API Admin (/api/admin/*)
  if (pathname.startsWith('/api/admin')) {
    if (!sessionToken) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Sesi pengurus diperlukan untuk mengakses endpoint ini.',
        },
        { status: 401 }
      );
    }
  }

  // 2. Proteksi rute Halaman Dasbor (/dashboard/*)
  if (pathname.startsWith('/dashboard')) {
    if (!sessionToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/admin/:path*',
    '/dashboard/:path*',
  ],
};
