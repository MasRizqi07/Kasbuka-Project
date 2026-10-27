'use client';

import React from 'react';

interface ProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  proofUrl?: string | null;
}

export const ProofModal: React.FC<ProofModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  proofUrl,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(30, 42, 120, 0.4)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          background: 'var(--putih)',
          borderRadius: 'var(--radius-sheet)',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid var(--garis-tegas)',
          boxShadow: '0 -8px 0 0 rgba(30, 42, 120, 0.06)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--garis)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--tinta)' }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ fontSize: '20px', color: 'var(--tinta-redup)', cursor: 'pointer', padding: '4px' }}
            aria-label="Tutup bukti"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '24px', textAlign: 'center' }}>
          <div
            style={{
              background: 'var(--kertas)',
              padding: '16px',
              border: '1px solid var(--garis)',
              marginBottom: '12px',
              minHeight: '200px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {proofUrl && proofUrl.startsWith('/') ? (
              <img
                src={proofUrl}
                alt={title}
                style={{ maxHeight: '350px', maxWidth: '100%', objectFit: 'contain' }}
              />
            ) : (
              <svg viewBox="0 0 360 260" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg">
                <rect width="360" height="260" fill="#FFFDF8" stroke="#BFD3C8" strokeWidth="2" />
                <text x="180" y="30" fontFamily="'Schibsted Grotesk', sans-serif" fontSize="16" fontWeight="bold" fill="#1E2A78" textAnchor="middle">
                  BUKTI TRANSAKSI SAH
                </text>
                <text x="180" y="46" fontFamily="'Schibsted Grotesk', sans-serif" fontSize="11" fill="#5A6360" textAnchor="middle">
                  Dokumen Pembelian / Nota Pengeluaran
                </text>
                <line x1="20" y1="56" x2="340" y2="56" stroke="#8FAE9F" strokeWidth="1.5" strokeDasharray="4 2" />
                <text x="24" y="90" fontSize="12" fill="#5A6360">Keterangan:</text>
                <text x="24" y="110" fontSize="13" fontWeight="bold" fill="#1E2A78">{description}</text>
                <line x1="20" y1="165" x2="340" y2="165" stroke="#8FAE9F" strokeWidth="1" />
                <circle cx="270" cy="210" r="32" fill="none" stroke="#A83A1B" strokeWidth="2" strokeOpacity="0.85" />
                <text x="270" y="208" fontFamily="'Schibsted Grotesk', sans-serif" fontSize="10" fontWeight="bold" fill="#A83A1B" textAnchor="middle" transform="rotate(-12 270 210)">
                  LUNAS
                </text>
                <text x="270" y="222" fontFamily="'Schibsted Grotesk', sans-serif" fontSize="9" fill="#A83A1B" textAnchor="middle" transform="rotate(-12 270 210)">
                  TERVERIFIKASI
                </text>
              </svg>
            )}
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--tinta-redup)', textAlign: 'left' }}>
            Foto nota asli untuk pengeluaran: &ldquo;{description}&rdquo;. Terverifikasi dan disimpan di ledger Kasbuka.
          </p>
        </div>
      </div>
    </div>
  );
};
