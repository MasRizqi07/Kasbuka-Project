'use client';

import React, { useState } from 'react';

interface HashAnchorProps {
  slug: string;
  lastHash: string;
  lastEntryDate: string; // ISO string or formatted date
  totalEntries: number;
}

export const HashAnchor: React.FC<HashAnchorProps> = ({
  slug,
  lastHash,
  lastEntryDate,
  totalEntries,
}) => {
  const [copied, setCopied] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    isValid: boolean;
    totalEntries: number;
    lastHash?: string;
    brokenAtSeq?: number;
    reason?: string;
  } | null>(null);

  const hashSnippet = lastHash ? `${lastHash.substring(0, 12)}…` : '—';

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  const handleCopyHash = async () => {
    if (!lastHash) return;
    try {
      await navigator.clipboard.writeText(lastHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
    }
  };

  const handleVerifyIntegrity = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch(`/api/campaigns/${slug}/integrity`);
      const json = await res.json();
      if (res.ok && json.data) {
        setVerificationResult(json.data);
      } else {
        setVerificationResult({
          isValid: false,
          totalEntries,
          reason: json.message || 'Gagal memverifikasi keutuhan buku kas.',
        });
      }
    } catch (err: unknown) {
      setVerificationResult({
        isValid: false,
        totalEntries,
        reason: err instanceof Error ? err.message : 'Koneksi terganggu saat memverifikasi.',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      style={{
        background: 'var(--putih)',
        border: '1.5px solid var(--garis-tegas)',
        borderRadius: '6px',
        padding: '16px 20px',
        margin: '20px 0',
      }}
      role="region"
      aria-label="Jangkar Keutuhan Hash"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tinta-redup)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Jangkar Buku Kas
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '15px', color: 'var(--tinta)' }}>Hash terakhir:</span>
            <code
              style={{
                fontFamily: 'monospace',
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--tinta)',
                background: 'var(--kertas)',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid var(--garis)',
              }}
            >
              {hashSnippet}
            </code>
            <span style={{ fontSize: '13.5px', color: 'var(--tinta-redup)' }}>
              (per {formatDateDisplay(lastEntryDate)})
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleCopyHash}
            className="btn btn-sm"
            style={{
              background: 'var(--putih)',
              border: '1.5px solid var(--tinta)',
              color: 'var(--tinta)',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '13.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {copied ? 'Tersalin ✓' : 'Salin hash'}
          </button>

          <button
            type="button"
            onClick={handleVerifyIntegrity}
            disabled={isVerifying}
            className="btn btn-sm"
            style={{
              background: 'var(--tinta)',
              border: 'none',
              color: '#FFFFFF',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '13.5px',
              fontWeight: 700,
              cursor: isVerifying ? 'wait' : 'pointer',
              opacity: isVerifying ? 0.7 : 1,
            }}
          >
            {isVerifying ? 'Memeriksa…' : 'Periksa keutuhan buku'}
          </button>
        </div>
      </div>

      {/* Panel Hasil Verifikasi Integritas (Design.md 6.8 & PRD US-6 & 3.9) */}
      {verificationResult && (
        <div
          style={{
            marginTop: '16px',
            padding: '14px 18px',
            borderRadius: '6px',
            backgroundColor: verificationResult.isValid ? 'var(--blok)' : '#FDF0ED',
            border: verificationResult.isValid ? '1px solid var(--garis)' : '1.5px solid var(--keluar)',
            color: 'var(--tinta)',
            fontSize: '14.5px',
            lineHeight: 1.5,
          }}
          role="status"
          aria-live="polite"
        >
          {verificationResult.isValid ? (
            <div>
              <div style={{ fontWeight: 700, color: 'var(--masuk)', marginBottom: '4px' }}>
                Keutuhan Valid ✓
              </div>
              <div>
                Rantai {verificationResult.totalEntries} entri utuh. Hash terakhir: {verificationResult.lastHash?.substring(0, 16)}…
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--tinta-redup)' }}>
                Simpan atau bagikan hash terakhir ini di grup. Kalau suatu hari berbeda, catatan sudah berubah. Ini memastikan catatan tidak diubah setelah ditulis, bukan membuktikan semua transaksi fisik tercatat.
              </p>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 700, color: 'var(--keluar)', marginBottom: '4px' }}>
                Integritas Terputus
              </div>
              <div>
                Rantai putus di entri #{verificationResult.brokenAtSeq ?? '?'}. {verificationResult.reason || ''}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

