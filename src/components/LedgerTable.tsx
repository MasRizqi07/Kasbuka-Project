'use client';

import React, { useState } from 'react';
import { formatRupiahDisplay } from './SaldoEquation';

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
  reversesEntryId?: string | null;
  hash: string;
  prevHash: string;
}

interface LedgerTableProps {
  entries: LedgerItem[];
  onViewProof?: (seq: number, title: string, desc: string, url?: string | null) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export const LedgerTable: React.FC<LedgerTableProps> = ({
  entries,
  onViewProof,
  hasMore,
  onLoadMore,
}) => {
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

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

      {/* Tampilan Desktop: Tabel 6 Kolom */}
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14.5px', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--kertas)', borderBottom: '1.5px solid var(--garis-tegas)' }}>
              <th style={{ width: '60px', padding: '12px 16px', color: 'var(--tinta-redup)', borderRight: '2px solid var(--garis-tegas)' }}>No</th>
              <th style={{ width: '105px', padding: '12px 16px', color: 'var(--tinta-redup)' }}>Tanggal</th>
              <th style={{ padding: '12px 16px', color: 'var(--tinta-redup)' }}>Keterangan</th>
              <th style={{ width: '130px', padding: '12px 16px', color: 'var(--tinta-redup)', textAlign: 'right' }}>Masuk</th>
              <th style={{ width: '130px', padding: '12px 16px', color: 'var(--tinta-redup)', textAlign: 'right' }}>Keluar</th>
              <th style={{ width: '140px', padding: '12px 16px', color: 'var(--tinta-redup)', textAlign: 'right' }}>Hash</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
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
                  style={{ borderBottom: '1px solid var(--garis)' }}
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
                        <span className="status-pill pill-reversal">Dibatalkan</span>
                      ) : entry.source === 'MIDTRANS' ? (
                        <span className="status-pill pill-midtrans">Dibayar lewat Midtrans</span>
                      ) : (
                        <span className="status-pill pill-pengurus">Dicatat pengurus</span>
                      )}

                      {entry.proofUrl && (
                        <button
                          type="button"
                          onClick={() => onViewProof?.(entry.seq, `Bukti Nota #${entry.seq}`, entry.description || '', entry.proofUrl)}
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
                        fontSize: '12px',
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
    </section>
  );
};
