'use client';

import React, { useState, useEffect } from 'react';

interface DonationSheetProps {
  slug: string;
  campaignTitle: string;
  campaignStatus: string;
  donationsEnabled?: boolean;
}

const PRESET_AMOUNTS = [10000, 25000, 50000, 100000, 250000, 500000];

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        callbacks?: {
          onSuccess?: (result: unknown) => void;
          onPending?: (result: unknown) => void;
          onError?: (result: unknown) => void;
          onClose?: () => void;
        }
      ) => void;
    };
  }
}

export function DonationSheet({
  slug,
  campaignTitle,
  campaignStatus,
  donationsEnabled = true,
}: DonationSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [amount, setAmount] = useState<number>(50000);
  const [customAmountStr, setCustomAmountStr] = useState<string>('50000');
  const [donorName, setDonorName] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [doa, setDoa] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Status Polling State (PRD 4.5)
  const [pollingOrderId, setPollingOrderId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

  // Muat script snap.js sandbox secara dinamis jika belum ada
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || 'SB-Mid-client-placeholder';
    const existingScript = document.getElementById('midtrans-snap-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'midtrans-snap-script';
      script.src = 'https://app.sandbox.midtrans.com/snap/snap.js';
      script.setAttribute('data-client-key', clientKey);
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // Polling status GET /api/donations/[orderId]/status setiap 2.5 detik
  useEffect(() => {
    if (!pollingOrderId || paymentStatus === 'PAID') return;

    let attempts = 0;
    const maxAttempts = 30; // maks ~75 detik

    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/donations/${pollingOrderId}/status`);
        if (res.ok) {
          const data = (await res.json()) as { status: string };
          setPaymentStatus(data.status);
          if (data.status === 'PAID') {
            clearInterval(interval);
            // Refresh halaman agar baris ledger baru tampil
            setTimeout(() => {
              window.location.reload();
            }, 2500);
          }
        }
      } catch (err) {
        console.warn('Error polling status donasi:', err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [pollingOrderId, paymentStatus]);

  if (campaignStatus !== 'ACTIVE') {
    return null;
  }

  // Jika donasi dimatikan di production (D1)
  if (!donationsEnabled) {
    return (
      <div
        style={{
          background: 'var(--kertas-redup, #F4F6F5)',
          border: '1.5px solid var(--garis)',
          borderRadius: '8px',
          padding: '16px',
          marginTop: '24px',
          textAlign: 'center',
          fontSize: '14.5px',
          color: 'var(--tinta-redup)',
        }}
      >
        <strong>Donasi online belum aktif.</strong> Hubungi pengurus.
      </div>
    );
  }

  const handleSelectPreset = (val: number) => {
    setAmount(val);
    setCustomAmountStr(val.toString());
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setCustomAmountStr(raw);
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) {
      setAmount(parsed);
    } else {
      setAmount(0);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      if (amount < 10000 || amount > 100000000) {
        throw new Error('Nominal donasi harus antara Rp 10.000 sampai Rp 100.000.000.');
      }

      const res = await fetch(`/api/campaigns/${slug}/donations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          donorName: isAnonymous ? null : (donorName.trim() || null),
          isAnonymous,
          doa: doa.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal membuat transaksi donasi.');
      }

      const { token, orderId } = data as { token: string; orderId: string };
      setPollingOrderId(orderId);
      setPaymentStatus('PENDING');

      // Buka pop-up Snap Midtrans Sandbox
      if (window.snap && typeof window.snap.pay === 'function') {
        window.snap.pay(token, {
          onSuccess: () => {
            // Callback onSuccess Snap tidak menulis ke DB (PRD 4.5).
            // Status dicatat dan diverifikasi murni lewat webhook server.
            setPaymentStatus('PENDING');
          },
          onPending: () => {
            setPaymentStatus('PENDING');
          },
          onError: () => {
            setErrorMessage('Pembayaran gagal atau dibatalkan.');
          },
          onClose: () => {
            // Popup ditutup oleh donatur
          },
        });
      } else {
        // Fallback jika iframe snap diblokir: redirect ke simulator Midtrans
        console.warn('Midtrans Snap.js belum termuat, menunggu notifikasi webhook.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Tombol Utama Pembuka Sheet */}
      <div style={{ marginTop: '24px' }}>
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setStep(1);
            setErrorMessage(null);
          }}
          className="btn btn-primary"
          style={{ width: '100%', fontSize: '17px', height: '52px' }}
        >
          Berdonasi Sekarang
        </button>
      </div>

      {/* Modal / Bottom Sheet Donasi 3 Langkah */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="donation-sheet-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--kertas, #FFFFFF)',
              color: 'var(--tinta, #1E2A78)',
              borderRadius: '12px',
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 -8px 0 0 rgba(30, 42, 120, 0.06)',
              position: 'relative',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            {/* Header Modal */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                borderBottom: '1px solid var(--garis, #D8E2DC)',
                paddingBottom: '12px',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--tinta-redup, #556080)',
                    letterSpacing: '0.05em',
                  }}
                >
                  Langkah {step} dari 3
                </span>
                <h3
                  id="donation-sheet-title"
                  style={{ fontSize: '19px', fontWeight: 800, margin: '2px 0 0 0' }}
                >
                  {step === 1 && 'Pilih Nominal Donasi'}
                  {step === 2 && 'Data Diri Donatur'}
                  {step === 3 && 'Doa & Konfirmasi'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Tutup"
                style={{
                  fontSize: '22px',
                  fontWeight: 700,
                  color: 'var(--tinta-redup, #556080)',
                  padding: '4px 8px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Indikator Status Polling / Menunggu Webhook */}
            {pollingOrderId && (
              <div
                style={{
                  backgroundColor:
                    paymentStatus === 'PAID'
                      ? 'var(--positif-latar, #E8F5E9)'
                      : 'var(--peringatan-latar, #FFF8E1)',
                  border: `1.5px solid ${paymentStatus === 'PAID' ? 'var(--positif, #2E7D32)' : '#F59E0B'}`,
                  borderRadius: '8px',
                  padding: '14px',
                  marginBottom: '16px',
                  textAlign: 'center',
                  fontSize: '14.5px',
                }}
              >
                {paymentStatus === 'PAID' ? (
                  <div>
                    <strong style={{ color: 'var(--positif, #2E7D32)' }}>
                      Alhamdulillah, Donasi Berhasil Dicatat!
                    </strong>
                    <div style={{ fontSize: '13px', marginTop: '4px' }}>
                      Memperbarui buku kas kasbuka...
                    </div>
                  </div>
                ) : (
                  <div>
                    <strong>Pembayaran diterima, sedang dicatat.</strong>
                    <div style={{ fontSize: '13px', marginTop: '4px', color: '#78350F' }}>
                      Menunggu verifikasi ledger buku kas...
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div
                style={{
                  backgroundColor: '#FEE2E2',
                  color: '#991B1B',
                  border: '1px solid #F87171',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  fontSize: '13.5px',
                  marginBottom: '16px',
                }}
              >
                {errorMessage}
              </div>
            )}

            {/* LANGKAH 1: Nominal Donasi */}
            {step === 1 && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 700,
                    marginBottom: '10px',
                  }}
                >
                  Pilihan Nominal Cepat
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    marginBottom: '16px',
                  }}
                >
                  {PRESET_AMOUNTS.map((val) => {
                    const isSelected = amount === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleSelectPreset(val)}
                        aria-pressed={isSelected}
                        style={{
                          padding: '10px 6px',
                          border: isSelected
                            ? '2.5px solid var(--tinta, #1E2A78)'
                            : '1.5px solid var(--garis, #D8E2DC)',
                          borderRadius: '8px',
                          backgroundColor: isSelected
                            ? 'var(--peringatan-latar, #F4F7FB)'
                            : '#FFFFFF',
                          fontWeight: isSelected ? 800 : 600,
                          fontSize: '14px',
                          color: 'var(--tinta, #1E2A78)',
                        }}
                      >
                        Rp {val.toLocaleString('id-ID')}
                      </button>
                    );
                  })}
                </div>

                <label
                  htmlFor="custom-amount-input"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 700,
                    marginBottom: '6px',
                  }}
                >
                  Atau Masukkan Nominal Lain (Rupiah)
                </label>
                <div style={{ position: 'relative', marginBottom: '20px' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontWeight: 700,
                      color: 'var(--tinta-redup, #556080)',
                    }}
                  >
                    Rp
                  </span>
                  <input
                    id="custom-amount-input"
                    type="text"
                    inputMode="numeric"
                    value={customAmountStr}
                    onChange={handleCustomAmountChange}
                    style={{
                      width: '100%',
                      height: '46px',
                      paddingLeft: '44px',
                      paddingRight: '12px',
                      borderRadius: '8px',
                      border: '1.5px solid var(--garis-tegas, #8FAE9F)',
                      fontSize: '16px',
                      fontWeight: 700,
                    }}
                  />
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--tinta-redup, #556080)',
                      marginTop: '4px',
                    }}
                  >
                    Minimal Rp 10.000 &bull; Maksimal Rp 100.000.000
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (amount < 10000 || amount > 100000000) {
                      setErrorMessage('Nominal donasi harus antara Rp 10.000 - Rp 100.000.000.');
                      return;
                    }
                    setErrorMessage(null);
                    setStep(2);
                  }}
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                >
                  Lanjut ke Data Diri
                </button>
              </div>
            )}

            {/* LANGKAH 2: Data Diri Donatur */}
            {step === 2 && (
              <div>
                <div style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      fontSize: '15px',
                      fontWeight: 600,
                      marginBottom: '16px',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span>Sembunyikan nama saya (Donasi Anonim)</span>
                  </label>

                  {!isAnonymous && (
                    <div>
                      <label
                        htmlFor="donor-name-input"
                        style={{
                          display: 'block',
                          fontSize: '14px',
                          fontWeight: 700,
                          marginBottom: '6px',
                        }}
                      >
                        Nama Lengkap / Panggilan
                      </label>
                      <input
                        id="donor-name-input"
                        type="text"
                        maxLength={60}
                        value={donorName}
                        onChange={(e) => setDonorName(e.target.value)}
                        placeholder="Contoh: Fulan / Hamba Allah"
                        style={{
                          width: '100%',
                          height: '46px',
                          padding: '0 12px',
                          borderRadius: '8px',
                          border: '1.5px solid var(--garis-tegas, #8FAE9F)',
                          fontSize: '15px',
                        }}
                      />
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--tinta-redup, #556080)',
                          marginTop: '4px',
                        }}
                      >
                        Nama ini akan tercatat transparan di buku kas.
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                  >
                    &larr; Kembali
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      setStep(3);
                    }}
                    className="btn btn-primary"
                    style={{ flex: 2 }}
                  >
                    Lanjut ke Doa
                  </button>
                </div>
              </div>
            )}

            {/* LANGKAH 3: Doa & Pembayaran */}
            {step === 3 && (
              <div>
                <div style={{ marginBottom: '16px' }}>
                  <label
                    htmlFor="donor-doa-input"
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 700,
                      marginBottom: '6px',
                    }}
                  >
                    Tulis Doa atau Pesan Kebaikan (Opsional)
                  </label>
                  <textarea
                    id="donor-doa-input"
                    rows={3}
                    maxLength={200}
                    value={doa}
                    onChange={(e) => setDoa(e.target.value)}
                    placeholder="Semoga bermanfaat dan menjadi amal jariyah..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid var(--garis-tegas, #8FAE9F)',
                      fontSize: '14.5px',
                      resize: 'none',
                    }}
                  />
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--tinta-redup, #556080)',
                      textAlign: 'right',
                    }}
                  >
                    {doa.length}/200 karakter
                  </div>
                </div>

                {/* Ringkasan Donasi */}
                <div
                  style={{
                    backgroundColor: 'var(--kertas-redup, #F8FAFC)',
                    border: '1px solid var(--garis, #D8E2DC)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    marginBottom: '20px',
                    fontSize: '14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '6px',
                    }}
                  >
                    <span>Campaign:</span>
                    <strong>{campaignTitle}</strong>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '6px',
                    }}
                  >
                    <span>Donatur:</span>
                    <strong>{isAnonymous ? 'Anonim' : donorName || 'Hamba Allah'}</strong>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderTop: '1px solid var(--garis, #D8E2DC)',
                      paddingTop: '6px',
                    }}
                  >
                    <span>Total Donasi:</span>
                    <strong style={{ fontSize: '16px', color: 'var(--tinta, #1E2A78)' }}>
                      Rp {amount.toLocaleString('id-ID')}
                    </strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={loading}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                  >
                    &larr; Kembali
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    className="btn btn-primary"
                    style={{ flex: 2 }}
                  >
                    {loading ? 'Menyiapkan...' : 'Bayar via Midtrans'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

