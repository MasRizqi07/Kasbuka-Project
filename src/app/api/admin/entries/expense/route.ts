import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { LedgerService } from '@/lib/ledger/service';
import { calculateLedgerBalance } from '@/lib/ledger/balance';

export const POST = withAdminAuth(async (req, session) => {
  try {
    const body = await req.json();
    const { campaignId, amount, description, occurredAt, proofUrl, proofSha256 } = body;

    if (!campaignId || !amount || !description) {
      return NextResponse.json(
        { error: 'Unprocessable Entity', message: 'campaignId, amount, dan description wajib diisi.' },
        { status: 422 }
      );
    }

    // 1. Verifikasi kepemilikan organisasi (Tenant Isolation - US-3: respon 403 jika org lain)
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

    // 2. Wajib ada foto bukti untuk OUT (US-3)
    if (!proofUrl || !proofSha256) {
      return NextResponse.json(
        { error: 'Unprocessable Entity', message: 'Foto bukti nota wajib dilampirkan untuk mencatat pengeluaran.' },
        { status: 422 }
      );
    }

    const amountBigInt = BigInt(amount);
    if (amountBigInt <= 0n) {
      return NextResponse.json(
        { error: 'Unprocessable Entity', message: 'Nominal pengeluaran harus lebih besar dari 0.' },
        { status: 422 }
      );
    }

    // 3. Periksa saldo saat ini (US-3: jika melebihi saldo, tolak 422 dengan menyebut saldo tersedia)
    const existingEntries = await prisma.ledgerEntry.findMany({
      where: { campaignId },
      orderBy: { seq: 'asc' },
    });

    const finance = calculateLedgerBalance(
      existingEntries.map((e) => ({
        id: e.id,
        seq: e.seq,
        type: e.type,
        amount: e.amount,
        fee: e.fee,
        reversesEntryId: e.reversesEntryId,
      }))
    );

    if (amountBigInt > finance.saldo) {
      const formattedSaldo = finance.saldo.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return NextResponse.json(
        {
          error: 'Unprocessable Entity',
          message: `Nominal pengeluaran melebihi saldo tersedia (Saldo tersedia saat ini: Rp ${formattedSaldo}).`,
          availableBalance: finance.saldo.toString(),
        },
        { status: 422 }
      );
    }

    // 4. Catat pengeluaran ke ledger secara transaksional
    const entry = await LedgerService.appendEntry({
      campaignId,
      type: 'OUT',
      source: 'MANUAL',
      amount: amountBigInt,
      fee: 0n,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      description,
      proofUrl,
      proofSha256,
      createdById: session.user.id,
    });

    return NextResponse.json(
      {
        message: 'Pengeluaran berhasil dicatat ke buku kas',
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
