'use client';
import React, { useState } from 'react';

interface Props {
  slug: string;
  lastHash: string;
  lastEntryDate: string;
  totalEntries: number;
}

export const HashAnchor: React.FC<Props> = ({ slug, lastHash, lastEntryDate, totalEntries }) => {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<{ isValid: boolean; totalEntries: number; lastHash?: string; brokenAtSeq?: number } | null>(null);

  const copy = () => {
    navigator.clipboard?.writeText(lastHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const verify = async () => {
    setLoading(true);
    try {
      const data = await fetch(`/api/campaigns/${slug}/integrity`).then((r) => r.json());
      setRes(data.data ?? { isValid: false, totalEntries });
    } catch {
      setRes({ isValid: false, totalEntries });
    } finally {
      setLoading(false);
    }
  };

  const dateStr = lastEntryDate ? new Date(lastEntryDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div style={{ background: 'var(--putih)', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px', padding: '14px 18px', margin: '20px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tinta-redup)' }}>JANGKAR HASH: </span>
          <code style={{ background: 'var(--kertas)', border: '1px solid var(--garis)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, color: 'var(--tinta)' }}>
            {lastHash ? `${lastHash.slice(0, 12)}…` : '—'}
          </code>
          <span style={{ fontSize: '13px', color: 'var(--tinta-redup)', marginLeft: '8px' }}>({dateStr})</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={copy} className="btn btn-sm btn-outline-garis" style={{ padding: '4px 10px', fontSize: '13px' }}>
            {copied ? 'Tersalin ✓' : 'Salin'}
          </button>
          <button type="button" onClick={verify} disabled={loading} className="btn btn-sm" style={{ background: 'var(--tinta)', color: '#fff', padding: '4px 12px', fontSize: '13px' }}>
            {loading ? 'Memeriksa…' : 'Periksa keutuhan buku'}
          </button>
        </div>
      </div>
      {res && (
        <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '6px', background: res.isValid ? 'var(--blok)' : '#FDF0ED', border: res.isValid ? '1px solid var(--garis)' : '1px solid var(--keluar)', fontSize: '13.5px', color: 'var(--tinta)' }}>
          <strong>{res.isValid ? 'Rantai valid ✓' : `Rantai putus di entri #${res.brokenAtSeq}`}</strong>
          {res.isValid && <span> ({res.totalEntries} entri, hash {res.lastHash?.slice(0, 12)}…).</span>}
          <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--tinta-redup)' }}>
            Simpan atau bagikan hash terakhir ini di grup. Kalau suatu hari berbeda, catatan sudah berubah.
          </p>
        </div>
      )}
    </div>
  );
};
