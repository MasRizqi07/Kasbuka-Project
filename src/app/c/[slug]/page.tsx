import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import { calculateLedgerBalance } from '@/lib/ledger/balance';
import { SaldoEquation } from '@/components/SaldoEquation';
import { LedgerTable, type LedgerItem } from '@/components/LedgerTable';

interface CampaignPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CampaignPageProps): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { slug },
  });

  if (!campaign) {
    return { title: 'Campaign Tidak Ditemukan — Kasbuka' };
  }

  return {
    title: `${campaign.title} — Kasbuka`,
    description: campaign.story.substring(0, 150) + '...',
  };
}

export default async function CampaignPublicPage({ params }: CampaignPageProps) {
  const { slug } = await params;

  // 1. Ambil campaign dari basis data
  const campaign = await prisma.campaign.findUnique({
    where: { slug },
    include: {
      organization: true,
      ledgerEntries: {
        orderBy: { seq: 'desc' },
      },
    },
  });

  if (!campaign) {
    notFound();
  }

  // 2. Jika campaign berstatus DRAFT, non-pengurus mendapat respons 404 (US-1)
  if (campaign.status === 'DRAFT') {
    const session = await getServerSession();
    if (!session || session.user.organizationId !== campaign.organizationId) {
      notFound();
    }
  }

  // 3. Kalkulasi saldo dari seluruh entri
  const financial = calculateLedgerBalance(
    campaign.ledgerEntries.map((e) => ({
      id: e.id,
      seq: e.seq,
      type: e.type,
      amount: e.amount,
      fee: e.fee,
      reversesEntryId: e.reversesEntryId,
    }))
  );

  // 4. Format entri publik (sanitasi nama donatur anonim - US-1)
  const formattedEntries: LedgerItem[] = campaign.ledgerEntries.map((e) => ({
    id: e.id,
    seq: e.seq,
    type: e.type,
    source: e.source,
    amount: e.amount.toString(),
    fee: e.fee.toString(),
    occurredAt: e.occurredAt.toISOString(),
    donorName: e.isAnonymous ? 'Anonim' : (e.donorName ?? 'Hamba Allah'),
    isAnonymous: e.isAnonymous,
    message: e.message,
    description: e.description,
    proofUrl: e.proofUrl,
    proofSha256: e.proofSha256,
    isReversed: financial.reversedEntryIds.has(e.id),
    reversesEntryId: e.reversesEntryId,
    hash: e.hash,
    prevHash: e.prevHash,
  }));

  const permitDateFormatted = campaign.permitDate
    ? new Date(campaign.permitDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <>
      {/* Header Kecil Sticky */}
      <header style={{ background: 'var(--kertas)', borderBottom: '1px solid var(--garis)', position: 'sticky', top: 0, zIndex: 500, padding: '14px 24px' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none', fontWeight: 800, fontSize: '20px', color: 'var(--tinta)' }}>
            <svg style={{ width: '20px', height: '20px' }} viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="1" y="1" width="20" height="20" rx="3" stroke="#1E2A78" strokeWidth="2" />
              <line x1="1" y1="8" x2="21" y2="8" stroke="#1E2A78" strokeWidth="1.5" />
              <line x1="1" y1="15" x2="21" y2="15" stroke="#1E2A78" strokeWidth="1.5" />
              <line x1="7" y1="1" x2="7" y2="7" stroke="#1E2A78" strokeWidth="2" />
              <line x1="7" y1="16" x2="7" y2="21" stroke="#1E2A78" strokeWidth="2" />
            </svg>
            <span>Kasbuka</span>
          </Link>

          <div>
            <Link href={`https://wa.me/?text=${encodeURIComponent(`Buku kas terbuka: ${campaign.title} - https://kasbuka.org/c/${campaign.slug}`)}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-garis">
              Bagikan
            </Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1040px', width: '100%', margin: '0 auto', padding: '32px 24px 80px 24px', flex: 1 }}>
        {/* Header Campaign */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
            {campaign.basis === 'BERIZIN' ? (
              <span className="status-pill pill-berizin">Berizin</span>
            ) : (
              <span className="status-pill pill-terbatas">Komunitas terbatas</span>
            )}
            <span className="status-pill pill-pengurus">Diperbarui {new Date().getDate()} Okt</span>
          </div>

          <h1 style={{ fontSize: '34px', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em', color: 'var(--tinta)', marginBottom: '16px' }}>
            {campaign.title}
          </h1>

          {/* Kotak Dasar Penggalangan (Design.md 6.9) */}
          <div
            style={{
              backgroundColor: 'var(--peringatan-latar)',
              borderLeft: '4px solid var(--tinta)',
              padding: '14px 18px',
              fontSize: '14.5px',
              lineHeight: 1.5,
              margin: '20px 0',
              color: 'var(--tinta)',
            }}
            role="region"
            aria-label="Dasar Penggalangan"
          >
            <strong>Dasar penggalangan</strong>
            {campaign.basis === 'BERIZIN' ? (
              <div>
                Penggalangan berizin. Izin No. {campaign.permitNumber || '—'}, {permitDateFormatted}. Kasbuka mencatat, tidak memeriksa keabsahan izin.
              </div>
            ) : (
              <div>
                Penggalangan terbatas untuk komunitas internal. Tidak dibuka untuk umum. Kasbuka murni mencatat laporan keuangan.
              </div>
            )}
          </div>
        </div>

        {/* Persamaan Saldo (Hero Halaman S2) */}
        <SaldoEquation
          totalMasuk={financial.totalMasukBersih}
          totalKeluar={financial.totalKeluar}
          saldo={financial.saldo}
          totalEntries={campaign.ledgerEntries.length}
          targetAmount={campaign.targetAmount}
        />

        {/* Cerita Campaign */}
        <article style={{ margin: '32px 0', maxWidth: '680px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '14px', color: 'var(--tinta)' }}>
            Cerita penggalangan
          </h2>
          <div style={{ fontSize: '16.5px', lineHeight: 1.6, color: '#242B59', whiteSpace: 'pre-line' }}>
            {campaign.story}
          </div>
          <p style={{ fontSize: '14px', color: 'var(--tinta-redup)', borderTop: '1px solid var(--garis)', paddingTop: '12px', marginTop: '20px' }}>
            Penerima dana: <strong>{campaign.organization.name}</strong>
          </p>
        </article>

        {/* Tabel Buku Kas */}
        <LedgerTable entries={formattedEntries} />
      </main>

      <footer style={{ borderTop: '1px solid var(--garis)', padding: '32px 24px', background: 'var(--kertas)', fontSize: '14px', color: 'var(--tinta-redup)' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <strong style={{ color: 'var(--tinta)' }}>Kasbuka</strong> — Buku kas penggalangan dana terbuka.
          </div>
          <div>
            <Link href="/">Beranda</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
