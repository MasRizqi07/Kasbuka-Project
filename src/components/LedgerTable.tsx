'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { formatRupiahDisplay } from './SaldoEquation';
import { ProofModal } from './ProofModal';

function subscribeViewport(callback: () => void): () => void {
  const mq = window.matchMedia('(max-width: 640px)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getMobileSnapshot(): boolean {
  return window.matchMedia('(max-width: 640px)').matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export interface LedgerItem {
  id: string;
  seq: number;
  type: 'IN' | 'OUT' | 'REVERSAL';
  source: 'MIDTRANS' | 'MANUAL';
  amount: string;
  fee: string;
  occurredAt: string;
  donorName?: string | null;
  isAnonymous: boolean;
  message?: string | null;
  description?: string | null;
  proofUrl?: string | null;
  proofSha256?: string | null;
  isReversed?: boolean;
  reversedBySeq?: number | null;
  reversesEntryId?: string | null;
  hash: string;
  prevHash: string;
}

interface LedgerTableProps {
  entries: LedgerItem[];
  onViewProof?: (seq: number, title: string, desc: string, url?: string | null) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  renderEntryAction?: (entry: LedgerItem) => React.ReactNode;
}

export const LedgerTable: React.FC<LedgerTableProps> = ({
  entries,
  onViewProof,
  hasMore,
  onLoadMore,
  renderEntryAction,
}) => {
  const isMobileViewport = useSyncExternalStore(subscribeViewport, getMobileSnapshot, getServerSnapshot);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [selectedProof, setSelectedProof] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    proofUrl?: string | null;
  }>({ isOpen: false, title: '', description: '' });

  const handleViewProof = (seq: number, title: string, desc: string, url?: string | null) => {
    if (onViewProof) {
      onViewProof(seq, title, desc, url);
    } else {
      setSelectedProof({
        isOpen: true,
        title,
        description: desc,
        proofUrl: url,
      });
    }
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1500);
  };

  const formatDateShort = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
      return `${d.getDate()} ${months[d.getMonth()]}`;
    } catch {
      return '—';
    }
  };

  return (
    <section
      style={{
        margin: '32px 0',
        background: 'var(--putih)',
        border: '1px solid var(--garis)',
        borderRadius: 'var(--radius-tabel)',
      }}
      aria-labelledby="ledgerHeading"
    >
      <div
        style={{
          padding: '16px 20px',
          background: 'var(--blok)',
          borderBottom: '1.5px solid var(--garis-tegas)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <h2 id="ledgerHeading" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--tinta)' }}>
          Buku Kas Penggalangan
        </h2>
        <span style={{ fontSize: '13.5px', color: 'var(--tinta-redup)' }}>
          {entries.length} entri dimuat
        </span>
      </div>

      {/* Tampilan Desktop & Mobile: Render eksklusif agar tidak ada DOM ganda tersembunyi */}
      {entries.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--tinta-redup)',
            fontSize: '15.5px',
            lineHeight: 1.5,
          }}
        >
          Buku kas masih kosong. Entri pertama muncul setelah ada uang masuk.
        </div>
      ) : isMobileViewport ? (
        /* Tampilan Mobile: Baris Bergaris Dua Tingkat (Design.md 5, 6.3, 11) */
        <ol
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
          aria-label="Daftar Entri Buku Kas"
        >
          {entries.map((entry, idx) => {
            const isReversed = entry.isReversed;
            const dateText = formatDateShort(entry.occurredAt);

            let nominalDisplay = '—';
            let isMasuk = false;

            if (entry.type === 'IN') {
              nominalDisplay = `+ ${formatRupiahDisplay(entry.amount)}`;
              isMasuk = true;
            } else if (entry.type === 'OUT') {
              nominalDisplay = `− ${formatRupiahDisplay(entry.amount)}`;
            } else if (entry.type === 'REVERSAL') {
              nominalDisplay = 'Koreksi';
            }

            return (
              <li
                key={entry.id}
                id={`mobile-row-${entry.seq}`}
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--garis)',
                  backgroundColor: idx % 2 === 1 ? 'rgba(230, 238, 232, 0.45)' : 'var(--putih)',
                }}
                aria-label={`Entri #${entry.seq}: ${nominalDisplay}, ${entry.description || entry.donorName || ''}`}
              >
                {/* Tingkat 1: #seq + keterangan di kiri, nominal di kanan */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, color: 'var(--tinta-redup)', marginRight: '6px' }}>
                      #{entry.seq}
                    </span>
                    <strong style={{ color: 'var(--tinta)', textDecoration: isReversed ? 'line-through' : 'none', wordBreak: 'break-word' }}>
                      {entry.description || (entry.type === 'IN' ? `Donasi dari ${entry.donorName}` : 'Pengeluaran')}
                    </strong>
                  </div>
                  <div
                    className="tabular-angka"
                    style={{
                      fontWeight: 700,
                      fontSize: '15.5px',
                      whiteSpace: 'nowrap',
                      color: isReversed ? 'var(--tinta-redup)' : isMasuk ? 'var(--masuk)' : 'var(--keluar)',
                      textDecoration: isReversed ? 'line-through' : 'none',
                      textAlign: 'right',
                    }}
                  >
                    {nominalDisplay}
                  </div>
                </div>

                {/* Doa / Pesan jika ada */}
                {entry.message && (
                  <div
                    style={{
                      fontFamily: 'var(--font-tangan)',
                      fontSize: '16.5px',
                      color: 'var(--tinta)',
                      marginTop: '6px',
                      marginBottom: '6px',
                      paddingLeft: '12px',
                      borderLeft: '2px solid var(--garis-tegas)',
                      lineHeight: 1.45,
                    }}
                  >
                    &ldquo;{entry.message}&rdquo;
                  </div>
                )}

                {/* Tingkat 2: tanggal, pill status, lihat bukti, aksi, dan salin hash */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', color: 'var(--tinta-redup)' }}>{dateText}</span>
                    {isReversed ? (
                      <span className="status-pill pill-reversal" style={{ fontSize: '12.5px', height: '22px' }}>
                        {entry.reversedBySeq ? `Dibatalkan oleh #${entry.reversedBySeq}` : 'Dibatalkan'}
                      </span>
                    ) : entry.source === 'MIDTRANS' ? (
                      <span className="status-pill pill-midtrans" style={{ fontSize: '12.5px', height: '22px' }}>
                        Dibayar lewat Midtrans
                      </span>
                    ) : (
                      <span className="status-pill pill-pengurus" style={{ fontSize: '12.5px', height: '22px' }}>
                        Dicatat pengurus
                      </span>
                    )}

                    {entry.proofUrl && (
                      <button
                        type="button"
                        onClick={() => handleViewProof(entry.seq, `Bukti Nota #${entry.seq}`, entry.description || '', entry.proofUrl)}
                        style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--tinta)', textDecoration: 'underline', cursor: 'pointer', padding: '4px 0', minHeight: '44px' }}
                      >
                        Lihat bukti
                      </button>
                    )}

                    {renderEntryAction && renderEntryAction(entry)}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyHash(entry.hash)}
                    style={{
                      fontSize: '12.5px',
                      color: 'var(--tinta-redup)',
                      padding: '4px 8px',
                      background: 'var(--kertas)',
                      border: '1px solid var(--garis)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                    title={`Salin hash: ${entry.hash}`}
                  >
                    {copiedHash === entry.hash ? 'Tersalin!' : `${entry.hash.substring(0, 8)}… 📋`}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        /* Tampilan Desktop: Tabel 6 Kolom (Design.md 5) */
        <div className="hide-on-mobile" style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14.5px', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--kertas)', borderBottom: '1.5px solid var(--garis-tegas)' }}>
                <th style={{ width: '60px', padding: '12px 16px', color: 'var(--tinta-redup)', borderRight: '2px solid var(--garis-tegas)' }}>No</th>
                <th style={{ width: '105px', padding: '12px 16px', color: 'var(--tinta-redup)' }}>Tanggal</th>
                <th style={{ padding: '12px 16px', color: 'var(--tinta-redup)' }}>Keterangan</th>
                <th style={{ width: '130px', padding: '12px 16px', color: 'var(--tinta-redup)', textAlign: 'right' }}>Masuk</th>
                <th style={{ width: '130px', padding: '12px 16px', color: 'var(--tinta-redup)', textAlign: 'right' }}>Keluar</th>
                <th style={{ width: '140px', padding: '12px 16px', color: 'var(--tinta-redup)', textAlign: 'right' }}>Hash</th>
                {renderEntryAction && (
                  <th style={{ width: '110px', padding: '12px 16px', color: 'var(--tinta-redup)', textAlign: 'right' }}>Aksi</th>
                )}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => {
                const isReversed = entry.isReversed;
                const dateText = formatDateShort(entry.occurredAt);

                let masukCol = '—';
                let keluarCol = '—';

                if (entry.type === 'IN') {
                  masukCol = `+ ${formatRupiahDisplay(entry.amount).replace('Rp ', '')}`;
                } else if (entry.type === 'OUT') {
                  keluarCol = `− ${formatRupiahDisplay(entry.amount).replace('Rp ', '')}`;
                } else if (entry.type === 'REVERSAL') {
                  keluarCol = 'Koreksi';
                }

                return (
                  <tr
                    key={entry.id}
                    id={`desktop-row-${entry.seq}`}
                    style={{
                      borderBottom: '1px solid var(--garis)',
                      backgroundColor: idx % 2 === 1 ? 'rgba(230, 238, 232, 0.45)' : 'var(--putih)',
                      transition: 'background-color 0.1s ease',
                    }}
                  >
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--tinta-redup)', borderRight: '2px solid var(--garis-tegas)', whiteSpace: 'nowrap' }}>
                      #{entry.seq}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--tinta-redup)', whiteSpace: 'nowrap' }}>
                      {dateText}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--tinta)', textDecoration: isReversed ? 'line-through' : 'none' }}>
                        {entry.description || (entry.type === 'IN' ? `Donasi dari ${entry.donorName}` : 'Pengeluaran')}
                      </div>

                      {entry.message && (
                        <div
                          style={{
                            fontFamily: 'var(--font-tangan)',
                            fontSize: '18px',
                            color: 'var(--tinta)',
                            marginTop: '6px',
                            paddingLeft: '16px',
                            borderLeft: '2px solid var(--garis-tegas)',
                            lineHeight: 1.45,
                          }}
                        >
                          &ldquo;{entry.message}&rdquo;
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                        {isReversed ? (
                          <span className="status-pill pill-reversal">
                            {entry.reversedBySeq ? `Dibatalkan oleh #${entry.reversedBySeq}` : 'Dibatalkan'}
                          </span>
                        ) : entry.source === 'MIDTRANS' ? (
                          <span className="status-pill pill-midtrans">Dibayar lewat Midtrans</span>
                        ) : (
                          <span className="status-pill pill-pengurus">Dicatat pengurus</span>
                        )}

                        {entry.proofUrl && (
                          <button
                            type="button"
                            onClick={() => handleViewProof(entry.seq, `Bukti Nota #${entry.seq}`, entry.description || '', entry.proofUrl)}
                            style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tinta)', textDecoration: 'underline', cursor: 'pointer' }}
                          >
                            Lihat bukti
                          </button>
                        )}
                      </div>
                    </td>
                    <td
                      className="tabular-angka"
                      style={{
                        padding: '14px 16px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: isReversed ? 'var(--tinta-redup)' : 'var(--masuk)',
                        textDecoration: isReversed ? 'line-through' : 'none',
                      }}
                    >
                      {masukCol}
                    </td>
                    <td
                      className="tabular-angka"
                      style={{
                        padding: '14px 16px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: isReversed ? 'var(--tinta-redup)' : 'var(--keluar)',
                        textDecoration: isReversed ? 'line-through' : 'none',
                      }}
                    >
                      {keluarCol}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleCopyHash(entry.hash)}
                        style={{
                          fontSize: '12.5px',
                          color: 'var(--tinta-redup)',
                          padding: '2px 6px',
                          background: 'var(--kertas)',
                          border: '1px solid var(--garis)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                        title={`Salin hash: ${entry.hash}`}
                      >
                        {copiedHash === entry.hash ? 'Tersalin!' : `${entry.hash.substring(0, 8)}… 📋`}
                      </button>
                    </td>
                    {renderEntryAction && (
                      <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {renderEntryAction(entry)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Kontrol Muat Lebih Banyak (Cursor Pagination - US-1) */}
      {hasMore && (
        <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid var(--garis)' }}>
          <button
            type="button"
            className="btn btn-sm btn-outline-garis"
            onClick={onLoadMore}
          >
            Muat lebih banyak
          </button>
        </div>
      )}
      {/* Modal Bukti Nota */}
      <ProofModal
        isOpen={selectedProof.isOpen}
        onClose={() => setSelectedProof((prev) => ({ ...prev, isOpen: false }))}
        title={selectedProof.title}
        description={selectedProof.description}
        proofUrl={selectedProof.proofUrl}
      />
    </section>
  );
};
