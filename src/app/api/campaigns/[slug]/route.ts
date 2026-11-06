import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import { calculateLedgerBalance } from '@/lib/ledger/balance';

export async function GET(
  req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor'); // seq cursor pagination
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 50); // Maksimal 50 per halaman (US-1)

    // 1. Ambil data campaign
    const campaign = await prisma.campaign.findUnique({
      where: { slug },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Not Found', message: 'Campaign tidak ditemukan.' }, { status: 404 });
    }

    // 2. Jika status DRAFT, hanya pemilik (pengurus organisasi) yang boleh melihat (US-1: non-pengurus -> 404)
    if (campaign.status === 'DRAFT') {
      const session = await getServerSession();
      if (!session || session.user.organizationId !== campaign.organizationId) {
        return NextResponse.json({ error: 'Not Found', message: 'Campaign tidak ditemukan.' }, { status: 404 });
      }
    }

    // 3. Ambil proyeksi minimal untuk kalkulasi saldo cepat (Tahap C: Backend Optimization)
    const balanceEntries = await prisma.ledgerEntry.findMany({
      where: { campaignId: campaign.id },
      select: {
        id: true,
        seq: true,
        type: true,
        amount: true,
        fee: true,
        reversesEntryId: true,
        hash: true,
      },
      orderBy: { seq: 'asc' },
    });

    const totalCount = balanceEntries.length;
    const latestEntry = totalCount > 0 ? balanceEntries[totalCount - 1] : null;
    const etag = latestEntry ? `"${latestEntry.hash}"` : '"empty-ledger"';

    // Dukungan ETag untuk menghemat bandwidth (304 Not Modified)
    if (req.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30',
        },
      });
    }

    const financial = calculateLedgerBalance(balanceEntries);

    // 4. Cursor Pagination untuk daftar buku kas (50 entri per halaman, seq menurun)
    const paginatedRaw = await prisma.ledgerEntry.findMany({
      where: {
        campaignId: campaign.id,
        ...(cursor ? { seq: { lt: Number(cursor) } } : {}),
      },
      orderBy: { seq: 'desc' },
      take: limit + 1, // Ambil 1 ekstra untuk deteksi nextCursor
    });

    const hasMore = paginatedRaw.length > limit;
    const entriesToReturn = hasMore ? paginatedRaw.slice(0, limit) : paginatedRaw;
    const nextCursor = hasMore ? entriesToReturn[entriesToReturn.length - 1].seq : null;

    // 5. Sanitasi data publik (PRD US-1 & Bagian 10):
    // Jika isAnonymous = true, nama asli TIDAK PERNAH ada di respons API publik.
    // Email pengurus juga tidak pernah diekspos di respons publik.
    const sanitizedEntries = entriesToReturn.map((e) => {
      const isReversed = financial.reversedEntryIds.has(e.id);
      return {
        id: e.id,
        seq: e.seq,
        type: e.type,
        source: e.source,
        amount: e.amount.toString(),
        fee: e.fee.toString(),
        feeSource: e.feeSource,
        paymentType: e.paymentType,
        donationId: e.donationId,
        occurredAt: e.occurredAt.toISOString(),
        donorName: e.isAnonymous ? 'Anonim' : (e.donorName ?? 'Hamba Allah'),
        isAnonymous: e.isAnonymous,
        message: e.message,
        description: e.description,
        proofUrl: e.proofUrl,
        proofSha256: e.proofSha256,
        isReversed,
        reversesEntryId: e.reversesEntryId,
        hash: e.hash,
        prevHash: e.prevHash,
      };
    });

    return NextResponse.json({
      data: {
        id: campaign.id,
        slug: campaign.slug,
        title: campaign.title,
        story: campaign.story,
        basis: campaign.basis,
        permitNumber: campaign.permitNumber,
        permitDate: campaign.permitDate?.toISOString() ?? null,
        status: campaign.status,
        targetAmount: campaign.targetAmount?.toString() ?? null,
        organizationName: campaign.organization.name,
        financial: {
          totalMasuk: financial.totalMasukBersih.toString(),
          totalKeluar: financial.totalKeluar.toString(),
          saldo: financial.saldo.toString(),
          totalEntries: totalCount,
        },
        pagination: {
          limit,
          hasMore,
          nextCursor,
        },
        entries: sanitizedEntries,
      },
    },
    {
      headers: {
        ETag: etag,
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30',
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Terjadi kesalahan server';
    return NextResponse.json({ error: 'Internal Server Error', message: errorMsg }, { status: 500 });
  }
}
