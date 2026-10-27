'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { SaldoEquation, formatRupiahDisplay } from '@/components/SaldoEquation';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'pengeluaran' | 'pemasukan'>('pengeluaran');
  const [nominal, setNominal] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [tanggal, setTanggal] = useState('27 Okt 2026');
  const [namaDonatur, setNamaDonatur] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Nilai simulasi saldo
  const saldoTersedia = 7955050n;

  const handleFormatNominal = (val: string) => {
    const raw = val.replace(/[^0-9]/g, '');
    if (!raw) {
      setNominal('');
      return;
    }
    const formatted = parseInt(raw, 10).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setNominal(formatted);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage('Ukuran file foto bukti maksimal 5 MB.');
        return;
      }
      setErrorMessage(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        setFilePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitPengeluaran = (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmount = BigInt(nominal.replace(/\./g, '') || '0');

    // US-3: Validasi nominal melebihi saldo
    if (rawAmount > saldoTersedia) {
      setErrorMessage(
        `Nominal pengeluaran (${formatRupiahDisplay(rawAmount)}) melebihi saldo tersedia (${formatRupiahDisplay(saldoTersedia)}).`
      );
      return;
    }

    if (!filePreview) {
      setErrorMessage('Foto bukti nota wajib diunggah.');
      return;
    }

    setErrorMessage(null);
    setToastMessage(`Pengeluaran ${formatRupiahDisplay(rawAmount)} berhasil dicatat.`);
    setNominal('');
    setKeterangan('');
    setFilePreview(null);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSubmitPemasukan = (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmount = BigInt(nominal.replace(/\./g, '') || '0');

    if (rawAmount <= 0n) {
      setErrorMessage('Nominal pemasukan harus lebih besar dari 0.');
      return;
    }

    setErrorMessage(null);
    setToastMessage(`Pemasukan manual ${formatRupiahDisplay(rawAmount)} berhasil dicatat.`);
    setNominal('');
    setNamaDonatur('');
    setKeterangan('');
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <>
      <header style={{ background: 'var(--kertas)', borderBottom: '1px solid var(--garis)', padding: '16px 24px' }}>
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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Link href="/c/atap-musala-al-ikhlas" className="btn btn-sm btn-outline-garis">
              Lihat Halaman Publik
            </Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1040px', width: '100%', margin: '0 auto', padding: '32px 24px 80px 24px', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--tinta)' }}>Atap Musala Al-Ikhlas</h1>
            <p style={{ fontSize: '14px', color: 'var(--tinta-redup)' }}>Organisasi: Takmir Musala Al-Ikhlas (Role: ORG_ADMIN)</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span className="status-pill pill-berizin">Aktif</span>
          </div>
        </div>

        {/* Ringkasan Keuangan Dasbor */}
        <SaldoEquation
          totalMasuk={19105050n}
          totalKeluar={11150000n}
          saldo={saldoTersedia}
          totalEntries={11}
          targetAmount={85000000n}
        />

        {/* Tab Dasbor */}
        <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--garis-tegas)', margin: '24px 0' }} role="tablist">
          <button
            type="button"
            className="tab-btn"
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: activeTab === 'pengeluaran' ? 'var(--tinta)' : 'var(--tinta-redup)',
              padding: '10px 0',
              borderBottom: activeTab === 'pengeluaran' ? '3px solid var(--tinta)' : 'none',
              cursor: 'pointer',
            }}
            onClick={() => setActiveTab('pengeluaran')}
            role="tab"
            aria-selected={activeTab === 'pengeluaran'}
          >
            Catat pengeluaran
          </button>
          <button
            type="button"
            className="tab-btn"
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: activeTab === 'pemasukan' ? 'var(--tinta)' : 'var(--tinta-redup)',
              padding: '10px 0',
              borderBottom: activeTab === 'pemasukan' ? '3px solid var(--tinta)' : 'none',
              cursor: 'pointer',
            }}
            onClick={() => setActiveTab('pemasukan')}
            role="tab"
            aria-selected={activeTab === 'pemasukan'}
          >
            Catat pemasukan
          </button>
        </div>

        {/* Form Catat Pengeluaran (US-3) */}
        {activeTab === 'pengeluaran' ? (
          <div style={{ background: 'var(--putih)', border: '1px solid var(--garis)', padding: '24px', maxWidth: '540px' }}>
            <form onSubmit={handleSubmitPengeluaran}>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }} htmlFor="inTanggal">
                  Tanggal
                </label>
                <input
                  id="inTanggal"
                  type="text"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  style={{ width: '100%', height: '48px', padding: '10px 14px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }} htmlFor="inNominal">
                  Nominal (Rupiah)
                </label>
                <input
                  id="inNominal"
                  type="text"
                  inputMode="numeric"
                  className="rupiah"
                  placeholder="Contoh: 1.500.000"
                  value={nominal}
                  onChange={(e) => handleFormatNominal(e.target.value)}
                  style={{ width: '100%', height: '48px', padding: '10px 14px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }} htmlFor="inKeterangan">
                  Keterangan Pengeluaran
                </label>
                <input
                  id="inKeterangan"
                  type="text"
                  placeholder="Contoh: Pembelian semen dan kuas roll"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  style={{ width: '100%', height: '48px', padding: '10px 14px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }} htmlFor="inFoto">
                  Foto Nota / Bukti (Wajib)
                </label>
                <input
                  id="inFoto"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  style={{ width: '100%', height: '48px', padding: '10px 14px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px' }}
                  required
                />
                {filePreview && (
                  <div style={{ marginTop: '10px', padding: '8px', background: 'var(--kertas)', border: '1px dashed var(--garis-tegas)', textAlign: 'center' }}>
                    <img src={filePreview} alt="Pratinjau Nota" style={{ maxHeight: '140px', maxWidth: '100%', objectFit: 'contain' }} />
                  </div>
                )}
              </div>

              {errorMessage && (
                <div style={{ color: 'var(--keluar)', fontSize: '13.5px', marginBottom: '14px' }}>
                  {errorMessage}
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                Catat pengeluaran
              </button>
              <p style={{ fontSize: '13px', color: 'var(--tinta-redup)', marginTop: '8px' }}>
                Entri tidak bisa diubah. Salah catat? Batalkan lewat entri koreksi.
              </p>
            </form>
          </div>
        ) : (
          /* Form Catat Pemasukan Manual (US-4) */
          <div style={{ background: 'var(--putih)', border: '1px solid var(--garis)', padding: '24px', maxWidth: '540px' }}>
            <form onSubmit={handleSubmitPemasukan}>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }} htmlFor="inPemasukanTgl">
                  Tanggal
                </label>
                <input
                  id="inPemasukanTgl"
                  type="text"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  style={{ width: '100%', height: '48px', padding: '10px 14px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }} htmlFor="inPemasukanNominal">
                  Nominal (Rupiah)
                </label>
                <input
                  id="inPemasukanNominal"
                  type="text"
                  inputMode="numeric"
                  className="rupiah"
                  placeholder="Contoh: 500.000"
                  value={nominal}
                  onChange={(e) => handleFormatNominal(e.target.value)}
                  style={{ width: '100%', height: '48px', padding: '10px 14px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }} htmlFor="inPemasukanDonor">
                  Nama Donatur
                </label>
                <input
                  id="inPemasukanDonor"
                  type="text"
                  placeholder="Nama penyumbang"
                  value={isAnonymous ? 'Anonim' : namaDonatur}
                  disabled={isAnonymous}
                  onChange={(e) => setNamaDonatur(e.target.value)}
                  style={{ width: '100%', height: '48px', padding: '10px 14px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px' }}
                  required={!isAnonymous}
                />
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="chkAnon"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                  />
                  <label htmlFor="chkAnon" style={{ fontSize: '13.5px', color: 'var(--tinta)' }}>
                    Sumbangan Anonim
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }} htmlFor="inPemasukanKet">
                  Keterangan / Sumber
                </label>
                <input
                  id="inPemasukanKet"
                  type="text"
                  placeholder="Contoh: Kotak amal Jumat"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  style={{ width: '100%', height: '48px', padding: '10px 14px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px' }}
                  required
                />
              </div>

              {errorMessage && (
                <div style={{ color: 'var(--keluar)', fontSize: '13.5px', marginBottom: '14px' }}>
                  {errorMessage}
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                Catat pemasukan manual
              </button>
              <p style={{ fontSize: '13px', color: 'var(--tinta-redup)', marginTop: '8px' }}>
                Dicatat sebagai sumber MANUAL (&ldquo;Dicatat pengurus&rdquo;), bukan Midtrans.
              </p>
            </form>
          </div>
        )}

        {toastMessage && (
          <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: 'var(--tinta)', color: 'var(--putih)', padding: '14px 20px', borderRadius: '6px', fontWeight: 500, boxShadow: '0 4px 14px rgba(0,0,0,0.2)' }}>
            {toastMessage}
          </div>
        )}
      </main>
    </>
  );
}
