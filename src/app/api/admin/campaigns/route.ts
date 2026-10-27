import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

// GET: Mengambil daftar campaign milik organisasi sesi saat ini (Tenant Isolation)
export const GET = withAdminAuth(async (_req, session) => {
  const campaigns = await prisma.campaign.findMany({
    where: {
      organizationId: session.user.organizationId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return NextResponse.json({
    data: campaigns,
  });
});

// POST: Membuat campaign baru (Status DRAFT)
export const POST = withAdminAuth(async (req, session) => {
  try {
    const body = await req.json();

    if (!body.title || !body.story || !body.basis) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Judul, cerita, dan dasar penggalangan wajib diisi.' },
        { status: 422 }
      );
    }

    if (body.basis === 'BERIZIN' && !body.permitNumber) {
      return NextResponse.json(
        { error: 'Unprocessable Entity', message: 'Nomor izin wajib diisi untuk dasar penggalangan BERIZIN.' },
        { status: 422 }
      );
    }

    const slug = body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const campaign = await prisma.campaign.create({
      data: {
        organizationId: session.user.organizationId,
        slug,
        title: body.title,
        story: body.story,
        targetAmount: body.targetAmount ? BigInt(body.targetAmount) : null,
        basis: body.basis,
        permitNumber: body.permitNumber || null,
        permitDate: body.permitDate ? new Date(body.permitDate) : null,
        status: 'DRAFT',
      },
    });

    return NextResponse.json(
      {
        message: 'Campaign berhasil dibuat',
        data: {
          ...campaign,
          targetAmount: campaign.targetAmount?.toString(),
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Terjadi kesalahan server';
    return NextResponse.json({ error: 'Internal Server Error', message: errorMsg }, { status: 500 });
  }
});
