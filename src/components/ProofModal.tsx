'use client';

import React, { useState, useEffect, useCallback } from 'react';

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
  const [rotation, setRotation] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);

  // Reset transform saat modal dibuka/ditutup
  useEffect(() => {
    if (isOpen) {
      setRotation(0);
      setZoom(1);
    }
  }, [isOpen]);

  // Tutup modal dengan tombol Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(2.5, +(prev + 0.25).toFixed(2)));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.75, +(prev - 0.25).toFixed(2)));
  };

  const handleReset = () => {
    setRotation(0);
    setZoom(1);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(30, 42, 120, 0.45)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="proof-modal-title"
    >
      <div
        style={{
          background: 'var(--putih)',
          borderRadius: 'var(--radius-sheet)',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--garis-tegas)',
          position: 'relative',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--garis)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--putih)',
          }}
        >
          <div>
            <h3
              id="proof-modal-title"
              style={{ fontSize: '17px', fontWeight: 700, color: 'var(--tinta)', margin: 0 }}
            >
              {title}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--tinta-redup)' }}>
              Bukti sah transaksi tercatat
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: '18px',
              color: 'var(--tinta)',
              cursor: 'pointer',
              padding: '6px 10px',
              borderRadius: 'var(--radius-btn)',
              background: 'var(--kertas)',
              border: '1px solid var(--garis)',
              lineHeight: 1,
            }}
            aria-label="Tutup bukti"
          >
            ✕
          </button>
        </div>

        {/* Bilah Kontrol Gambar (Rotate, Zoom, Open) */}
        {proofUrl && proofUrl.startsWith('/') && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px',
              backgroundColor: 'var(--kertas)',
              borderBottom: '1px solid var(--garis)',
              fontSize: '13px',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={handleRotate}
                className="btn btn-sm btn-outline-garis"
                style={{ padding: '0 10px', height: '30px', fontSize: '12.5px' }}
                title="Putar 90 derajat searah jarum jam"
              >
                Putar 90°
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                className="btn btn-sm btn-outline-garis"
                style={{ padding: '0 10px', height: '30px', fontSize: '12.5px' }}
                title="Perbesar gambar"
              >
                +
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                className="btn btn-sm btn-outline-garis"
                style={{ padding: '0 10px', height: '30px', fontSize: '12.5px' }}
                title="Perkecil gambar"
              >
                −
              </button>
              {(rotation !== 0 || zoom !== 1) && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="btn btn-sm btn-text"
                  style={{ fontSize: '12px', height: '30px' }}
                >
                  Reset
                </button>
              )}
            </div>

            <a
              href={proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--tinta)',
                fontSize: '12.5px',
                fontWeight: 600,
                textDecoration: 'underline',
              }}
            >
              Buka gambar penuh ↗
            </a>
          </div>
        )}

        {/* Konten Gambar Nota */}
        <div
          style={{
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div
            style={{
              background: 'var(--kertas)',
              padding: '12px',
              border: '1px solid var(--garis)',
              minHeight: '260px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              borderRadius: '4px',
            }}
          >
            {proofUrl && proofUrl.startsWith('/') ? (
              <img
                src={proofUrl}
                alt={title}
                style={{
                  maxHeight: '380px',
                  maxWidth: '100%',
                  objectFit: 'contain',
                  transform: `rotate(${rotation}deg) scale(${zoom})`,
                  transition: 'transform 0.15s ease-out',
                }}
              />
            ) : (
              <svg viewBox="0 0 360 260" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg">
                <rect width="360" height="260" fill="#FFFDF8" stroke="#BFD3C8" strokeWidth="2" />
                <text
                  x="180"
                  y="30"
                  fontFamily="'Schibsted Grotesk', sans-serif"
                  fontSize="16"
                  fontWeight="bold"
                  fill="#1E2A78"
                  textAnchor="middle"
                >
                  BUKTI TRANSAKSI SAH
                </text>
                <text
                  x="180"
                  y="46"
                  fontFamily="'Schibsted Grotesk', sans-serif"
                  fontSize="11"
                  fill="#5A6360"
                  textAnchor="middle"
                >
                  Dokumen Pembelian / Nota Pengeluaran
                </text>
                <line x1="20" y1="56" x2="340" y2="56" stroke="#8FAE9F" strokeWidth="1.5" strokeDasharray="4 2" />
                <text x="24" y="90" fontSize="12" fill="#5A6360">
                  Keterangan:
                </text>
                <text x="24" y="110" fontSize="13" fontWeight="bold" fill="#1E2A78">
                  {description}
                </text>
                <line x1="20" y1="165" x2="340" y2="165" stroke="#8FAE9F" strokeWidth="1" />
                <circle cx="270" cy="210" r="32" fill="none" stroke="#A83A1B" strokeWidth="2" strokeOpacity="0.85" />
                <text
                  x="270"
                  y="208"
                  fontFamily="'Schibsted Grotesk', sans-serif"
                  fontSize="10"
                  fontWeight="bold"
                  fill="#A83A1B"
                  textAnchor="middle"
                  transform="rotate(-12 270 210)"
                >
                  LUNAS
                </text>
                <text
                  x="270"
                  y="222"
                  fontFamily="'Schibsted Grotesk', sans-serif"
                  fontSize="9"
                  fill="#A83A1B"
                  textAnchor="middle"
                  transform="rotate(-12 270 210)"
                >
                  TERVERIFIKASI
                </text>
              </svg>
            )}
          </div>

          <p
            style={{
              fontSize: '13.5px',
              color: 'var(--tinta-redup)',
              margin: 0,
              lineHeight: 1.5,
              padding: '6px 4px',
            }}
          >
            Foto nota asli untuk pengeluaran: &ldquo;
            <strong style={{ color: 'var(--tinta)' }}>{description}</strong>
            &rdquo;. Disimpan di penyimpanan privat dan diverifikasi di rantai buku kas Kasbuka.
          </p>
        </div>
      </div>
    </div>
  );
};
