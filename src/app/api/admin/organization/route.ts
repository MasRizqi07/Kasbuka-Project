import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

// GET: Mengambil data profil organisasi milik admin yang sedang login
export const GET = withAdminAuth(async (_req, session) => {
  const org = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      users: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      },
    },
  });

  if (!org) {
    return NextResponse.json({ error: 'Not Found', message: 'Organisasi tidak ditemukan.' }, { status: 404 });
  }

  return NextResponse.json({ data: org });
});
