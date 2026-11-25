import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { serializeCampaign } from '@/lib/campaigns';

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
    data: campaigns.map(serializeCampaign),
  });
});

// POST: Membuat campaign baru (Status DRAFT)
export const POST = withAdminAuth(async (req, session) => {
  try {
    const body = await req.json();

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const story = typeof body.story === 'string' ? body.story.trim() : '';
    const basis = body.basis;

    if (!title || !story || (basis !== 'BERIZIN' && basis !== 'TERBATAS')) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Judul, cerita, dan dasar penggalangan wajib diisi.' },
        { status: 422 }
      );
    }

    const permitNumber = typeof body.permitNumber === 'string' ? body.permitNumber.trim() : '';
    if (basis === 'BERIZIN' && !permitNumber) {
      return NextResponse.json(
        { error: 'Unprocessable Entity', message: 'Nomor izin wajib diisi untuk dasar penggalangan BERIZIN.' },
        { status: 422 }
      );
    }

    let parsedTarget: bigint | null = null;
    if (body.targetAmount !== undefined && body.targetAmount !== null && String(body.targetAmount).trim() !== '') {
      const cleanDigits = String(body.targetAmount).replace(/\./g, '').trim();
      if (!/^\d+$/.test(cleanDigits)) {
        return NextResponse.json(
          { error: 'Unprocessable Entity', message: 'Target nominal harus berupa bilangan bulat positif.' },
          { status: 422 }
        );
      }
      parsedTarget = BigInt(cleanDigits);
      if (parsedTarget <= 0n) {
        return NextResponse.json(
          { error: 'Unprocessable Entity', message: 'Target nominal harus lebih besar dari 0.' },
          { status: 422 }
        );
      }
    }

    let parsedPermitDate: Date | null = null;
    if (body.permitDate !== undefined && body.permitDate !== null && String(body.permitDate).trim() !== '') {
      const d = new Date(body.permitDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { error: 'Unprocessable Entity', message: 'Format tanggal izin tidak valid.' },
          { status: 422 }
        );
      }
      parsedPermitDate = d;
    }

    const rawSlug = typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : title;
    const slug = rawSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!slug) {
      return NextResponse.json(
        { error: 'Unprocessable Entity', message: 'Slug URL campaign tidak valid.' },
        { status: 422 }
      );
    }

    const campaign = await prisma.campaign.create({
      data: {
        organizationId: session.user.organizationId,
        slug,
        title,
        story,
        targetAmount: parsedTarget,
        basis,
        permitNumber: permitNumber || null,
        permitDate: parsedPermitDate,
        status: 'DRAFT',
      },
    });

    return NextResponse.json(
      {
        message: 'Campaign berhasil dibuat',
        data: serializeCampaign(campaign),
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const prismaErr = err as { code?: string };
    if (prismaErr?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Conflict', message: 'Slug URL campaign sudah dipakai. Gunakan slug atau judul lain.' },
        { status: 409 }
      );
    }
    const errorMsg = err instanceof Error ? err.message : 'Terjadi kesalahan server';
    return NextResponse.json({ error: 'Internal Server Error', message: errorMsg }, { status: 500 });
  }
});
