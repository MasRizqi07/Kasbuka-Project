import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLedgerIntegrity } from '@/lib/ledger/verifier';

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;

    const campaign = await prisma.campaign.findUnique({
      where: { slug },
      include: {
        ledgerEntries: {
          orderBy: { seq: 'asc' },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Not Found', message: 'Campaign tidak ditemukan.' }, { status: 404 });
    }

    const verification = verifyLedgerIntegrity(
      campaign.ledgerEntries.map((e) => ({
        id: e.id,
        campaignId: e.campaignId,
        seq: e.seq,
        type: e.type,
        source: e.source,
        amount: e.amount,
        fee: e.fee,
        occurredAt: e.occurredAt.toISOString(),
        donorName: e.donorName,
        isAnonymous: e.isAnonymous,
        message: e.message,
        description: e.description,
        proofUrl: e.proofUrl,
        proofSha256: e.proofSha256,
        reversesEntryId: e.reversesEntryId,
        prevHash: e.prevHash,
        hash: e.hash,
      }))
    );

    return NextResponse.json({
      data: {
        campaignSlug: campaign.slug,
        campaignTitle: campaign.title,
        ...verification,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Terjadi kesalahan internal';
    return NextResponse.json({ error: 'Internal Server Error', message: errorMsg }, { status: 500 });
  }
}
