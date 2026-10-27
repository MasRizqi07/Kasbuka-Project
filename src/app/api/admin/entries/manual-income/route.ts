import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { LedgerService } from '@/lib/ledger/service';

export const POST = withAdminAuth(async (req, session) => {
  try {
    const body = await req.json();
    const { campaignId, amount, donorName, isAnonymous, description, occurredAt } = body;

    if (!campaignId || !amount) {
      return NextResponse.json(
        { error: 'Unprocessable Entity', message: 'campaignId dan amount wajib diisi.' },
        { status: 422 }
      );
    }

    // 1. Verifikasi kepemilikan organisasi (Tenant Isolation)
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        organizationId: session.user.organizationId,
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Anda tidak memiliki hak akses untuk mencatat ke campaign ini.' },
        { status: 403 }
      );
    }

    const amountBigInt = BigInt(amount);
    if (amountBigInt <= 0n) {
      return NextResponse.json(
        { error: 'Unprocessable Entity', message: 'Nominal pemasukan harus lebih besar dari 0.' },
        { status: 422 }
      );
    }

    const anon = Boolean(isAnonymous);
    const finalDonor = anon ? 'Anonim' : (donorName?.trim() || 'Hamba Allah');

    // 2. Catat pemasukan manual (source=MANUAL)
    const entry = await LedgerService.appendEntry({
      campaignId,
      type: 'IN',
      source: 'MANUAL',
      amount: amountBigInt,
      fee: 0n,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      donorName: finalDonor,
      isAnonymous: anon,
      description: description?.trim() || `Sumbangan ${finalDonor}`,
      createdById: session.user.id,
    });

    return NextResponse.json(
      {
        message: 'Pemasukan manual berhasil dicatat ke buku kas (Sumber: Dicatat pengurus)',
        data: {
          ...entry,
          amount: entry.amount.toString(),
          fee: entry.fee.toString(),
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Terjadi kesalahan internal';
    return NextResponse.json({ error: 'Internal Server Error', message: errorMsg }, { status: 500 });
  }
});
