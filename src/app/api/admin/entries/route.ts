import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { calculateLedgerBalance } from '@/lib/ledger/balance';

// GET: Mengambil entri buku kas dan ringkasan saldo milik campaign organisasi sesi
export const GET = withAdminAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get('campaignId');

  if (!campaignId) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Parameter campaignId diperlukan.' },
      { status: 400 }
    );
  }

  // Verifikasi tenant isolation: pastikan campaign milik organisasi sesi
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      organizationId: session.user.organizationId,
    },
  });

  if (!campaign) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Anda tidak memiliki hak akses ke campaign ini.' },
      { status: 403 }
    );
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: { campaignId },
    orderBy: { seq: 'desc' },
  });

  const financial = calculateLedgerBalance(
    entries.map((e) => ({
      id: e.id,
      seq: e.seq,
      type: e.type,
      amount: e.amount,
      fee: e.fee,
      reversesEntryId: e.reversesEntryId,
    }))
  );

  const serialized = entries.map((e) => ({
    ...e,
    amount: e.amount.toString(),
    fee: e.fee.toString(),
    occurredAt: e.occurredAt.toISOString(),
    isReversed: financial.reversedEntryIds.has(e.id),
    reversedBySeq: financial.reversedBySeq.get(e.id) ?? null,
  }));

  return NextResponse.json({
    data: serialized,
    financial: {
      totalMasuk: financial.totalMasukBersih.toString(),
      totalKeluar: financial.totalKeluar.toString(),
      saldo: financial.saldo.toString(),
      totalEntries: entries.length,
    },
  });
});
