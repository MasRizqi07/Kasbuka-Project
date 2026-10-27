import { NextResponse } from 'next/server';
import { getServerSession, type AdminSession } from './auth';

export type AuthenticatedRouteHandler = (
  req: Request,
  session: AdminSession,
  context?: unknown
) => Promise<NextResponse> | NextResponse;

/**
 * Wrapper terpusat untuk rute API Admin (/api/admin/*)
 * Menegakkan:
 * 1. Verifikasi sesi aktif server-side (menghasilkan 401 jika tanpa sesi)
 * 2. Tenant isolation dengan menyuntikkan session (termasuk user.organizationId)
 * 3. Identitas pelaku diambil dari sesi, bukan dari request body
 */
export function withAdminAuth(handler: AuthenticatedRouteHandler) {
  return async (req: Request, context?: unknown) => {
    const session = await getServerSession();

    if (!session || !session.user || session.user.role !== 'ORG_ADMIN') {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Sesi pengurus diperlukan untuk mengakses endpoint ini.',
        },
        { status: 401 }
      );
    }

    return handler(req, session, context);
  };
}
