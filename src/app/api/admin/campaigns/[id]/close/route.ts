import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export const PATCH = withAdminAuth(async (_req, session, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const campaign = await prisma.campaign.findFirst({
    where: {
      id,
      organizationId: session.user.organizationId,
    },
  });

  if (!campaign) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Campaign tidak ditemukan atau bukan milik organisasi Anda.' },
      { status: 403 }
    );
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: { status: 'CLOSED' },
  });

  return NextResponse.json({
    message: 'Campaign berhasil ditutup (CLOSED). Donasi baru ditolak, catatan tetap terbaca publik.',
    data: updated,
  });
});
