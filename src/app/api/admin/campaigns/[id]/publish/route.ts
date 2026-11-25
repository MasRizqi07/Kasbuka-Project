import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { serializeCampaign } from '@/lib/campaigns';

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

  if (campaign.status === 'ACTIVE') {
    return NextResponse.json({
      message: 'Campaign sudah dalam status ACTIVE',
      data: serializeCampaign(campaign),
    });
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: { status: 'ACTIVE' },
  });

  return NextResponse.json({
    message: 'Campaign berhasil dipublikasikan dan kini berstatus ACTIVE.',
    data: serializeCampaign(updated),
  });
});
