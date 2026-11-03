import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { LedgerService } from '@/lib/ledger/service';

export const POST = withAdminAuth(async (req, session) => {
  try {
    const body = await req.json();
    const { campaignId, targetEntryId, reason } = body;

    if (!campaignId || !targetEntryId || !reason) {
      return NextResponse.json(
        { error: 'Unprocessable Entity', message: 'campaignId, targetEntryId, dan reason wajib diisi.' },
        { status: 422 }
      );
    }

    // 1. Verifikasi hak akses organisasi (Tenant Isolation)
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        organizationId: session.user.organizationId,
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Anda tidak memiliki akses ke campaign ini.' },
        { status: 403 }
      );
    }

    // 2. Ambil target entry
    const targetEntry = await prisma.ledgerEntry.findFirst({
      where: {
        id: targetEntryId,
        campaignId,
      },
    });

    if (!targetEntry) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Entri yang ingin dibatalkan tidak ditemukan.' },
        { status: 404 }
      );
    }

    // 3. Tambahkan entri REVERSAL via LedgerService (append-only)
    const reversalEntry = await LedgerService.appendEntry({
      campaignId,
      type: 'REVERSAL',
      source: 'MANUAL',
      amount: targetEntry.amount,
      fee: 0n,
      reversesEntryId: targetEntry.id,
      description: `Koreksi pembatalan entri #${targetEntry.seq}: ${reason}`,
      createdById: session.user.id,
    });

    return NextResponse.json(
      {
        message: 'Koreksi pembatalan berhasil dicatat ke buku kas.',
        data: {
          id: reversalEntry.id,
          seq: reversalEntry.seq,
          type: reversalEntry.type,
          amount: reversalEntry.amount.toString(),
          reversesEntryId: reversalEntry.reversesEntryId,
          hash: reversalEntry.hash,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Gagal membuat koreksi pembatalan.';
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }
});

