'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SaldoEquation, formatRupiahDisplay } from '@/components/SaldoEquation';
import { LedgerTable, type LedgerItem } from '@/components/LedgerTable';
import type { SerializedCampaign } from '@/lib/campaigns';

interface AnomalyItem {
  id: string;
  orderId: string;
  transactionStatus: string;
  receivedAt: string;
  result: string;
  amount?: string;
  campaignTitle?: string;
}

interface OrganizationInfo {
  id: string;
  name: string;
  users?: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
  }>;
}

interface FinancialSummary {
  totalMasuk: string;
  totalKeluar: string;
  saldo: string;
  totalEntries: number;
}

function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Data Sesi & Organisasi
  const [loadingInit, setLoadingInit] = useState(true);
  const [org, setOrg] = useState<OrganizationInfo | null>(null);
  const [campaigns, setCampaigns] = useState<SerializedCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [entries, setEntries] = useState<LedgerItem[]>([]);
  const [financial, setFinancial] = useState<FinancialSummary>({
    totalMasuk: '0',
    totalKeluar: '0',
    saldo: '0',
    totalEntries: 0,
  });
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);

  // UI Tabs & Modals
  const [activeTab, setActiveTab] = useState<'pengeluaran' | 'pemasukan'>('pengeluaran');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [submittingEntry, setSubmittingEntry] = useState(false);
  const [submittingCampaign, setSubmittingCampaign] = useState(false);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form Pengeluaran / Pemasukan Manual
  const [nominal, setNominal] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [tanggal, setTanggal] = useState(getTodayIsoDate);
  const [namaDonatur, setNamaDonatur] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  // Form Buat Campaign Baru
  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newStory, setNewStory] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newBasis, setNewBasis] = useState<'TERBATAS' | 'BERIZIN'>('TERBATAS');
  const [newPermitNumber, setNewPermitNumber] = useState('');
  const [newPermitDate, setNewPermitDate] = useState('');
  const [campaignError, setCampaignError] = useState<string | null>(null);

  // Dialog Reversal (Batalkan Entri)
  const [reversalTarget, setReversalTarget] = useState<LedgerItem | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalError, setReversalError] = useState<string | null>(null);
  const [submittingReversal, setSubmittingReversal] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const loadCampaignEntries = useCallback(async (campaignId: string) => {
    if (!campaignId) return;
    setLoadingEntries(true);
    try {
      const res = await fetch(`/api/admin/entries?campaignId=${encodeURIComponent(campaignId)}`);
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      if (!res.ok) return;
      const json = await res.json();
      if (Array.isArray(json.data)) {
        setEntries(json.data);
      }
      if (json.financial) {
        setFinancial(json.financial);
      }
    } finally {
      setLoadingEntries(false);
    }
  }, [router]);

  const loadDashboardInit = useCallback(async () => {
    setLoadingInit(true);
    try {
      const [orgRes, campRes, anomRes] = await Promise.all([
        fetch('/api/admin/organization'),
        fetch('/api/admin/campaigns'),
        fetch('/api/admin/anomalies'),
      ]);

      if (orgRes.status === 401 || campRes.status === 401) {
        router.replace('/login');
        return;
      }

      if (orgRes.ok) {
        const orgJson = await orgRes.json();
        setOrg(orgJson.data ?? null);
      }

      if (campRes.ok) {
        const campJson = await campRes.json();
        const list: SerializedCampaign[] = Array.isArray(campJson.data) ? campJson.data : [];
        setCampaigns(list);
        if (list.length > 0) {
          setSelectedCampaignId((prev) => (prev && list.some((c) => c.id === prev) ? prev : list[0].id));
          setShowCreateForm(false);
        } else {
          setShowCreateForm(true);
        }
      }

      if (anomRes.ok) {
        const anomJson = await anomRes.json();
        if (Array.isArray(anomJson.anomalies)) {
          setAnomalies(anomJson.anomalies);
        }
      }
    } finally {
      setLoadingInit(false);
    }
  }, [router]);

  useEffect(() => {
    loadDashboardInit();
  }, [loadDashboardInit]);

  useEffect(() => {
    if (selectedCampaignId) {
      loadCampaignEntries(selectedCampaignId);
    }
  }, [selectedCampaignId, loadCampaignEntries]);

  // Tutup modal reversal dengan Escape
  useEffect(() => {
    if (!reversalTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submittingReversal) {
        setReversalTarget(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reversalTarget, submittingReversal]);

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId) ?? null;
  const saldoTersedia = BigInt(financial.saldo || '0');

  const handleFormatRupiahInput = (val: string, setter: (v: string) => void) => {
    const raw = val.replace(/[^0-9]/g, '');
    if (!raw) {
      setter('');
      return;
    }
    const formatted = BigInt(raw).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setter(formatted);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage('Ukuran file foto bukti maksimal 5 MB.');
        setSelectedFile(null);
        setFilePreview(null);
        return;
      }
      setErrorMessage(null);
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setFilePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setCampaignError(null);
    setSubmittingCampaign(true);

    try {
      const cleanTarget = newTarget.replace(/\./g, '').trim();
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          slug: newSlug.trim() || undefined,
          story: newStory.trim(),
          targetAmount: cleanTarget || undefined,
          basis: newBasis,
          permitNumber: newBasis === 'BERIZIN' ? newPermitNumber.trim() : undefined,
          permitDate: newBasis === 'BERIZIN' && newPermitDate ? newPermitDate : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || json.error || 'Gagal membuat campaign baru.');
      }

      const created: SerializedCampaign = json.data;
      setCampaigns((prev) => [created, ...prev]);
      setSelectedCampaignId(created.id);
      setShowCreateForm(false);
      setNewTitle('');
      setNewSlug('');
      setNewStory('');
      setNewTarget('');
      setNewBasis('TERBATAS');
      setNewPermitNumber('');
      setNewPermitDate('');
      showToast(`Campaign "${created.title}" berhasil dibuat (status Draft).`);
    } catch (err: unknown) {
      setCampaignError(err instanceof Error ? err.message : 'Gagal membuat campaign.');
    } finally {
      setSubmittingCampaign(false);
    }
  };

  const handlePublishCampaign = async () => {
    if (!selectedCampaign) return;
    setLifecycleLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${selectedCampaign.id}/publish`, {
        method: 'PATCH',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || json.error || 'Gagal menerbitkan campaign.');
      }
      const updated: SerializedCampaign = json.data;
      setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      showToast('Campaign berhasil diterbitkan dan terbuka untuk publik.');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menerbitkan campaign.');
    } finally {
      setLifecycleLoading(false);
    }
  };

  const handleCloseCampaign = async () => {
    if (!selectedCampaign) return;
    if (!window.confirm(`Tutup campaign "${selectedCampaign.title}"? Donasi baru akan ditolak, tetapi catatan buku kas tetap terbaca publik.`)) {
      return;
    }
    setLifecycleLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${selectedCampaign.id}/close`, {
        method: 'PATCH',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || json.error || 'Gagal menutup campaign.');
      }
      const updated: SerializedCampaign = json.data;
      setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      showToast('Campaign berhasil ditutup.');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menutup campaign.');
    } finally {
      setLifecycleLoading(false);
    }
  };

  const handleSubmitPengeluaran = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) return;
    setErrorMessage(null);

    const rawAmountStr = nominal.replace(/\./g, '').trim();
    if (!rawAmountStr || !/^\d+$/.test(rawAmountStr)) {
      setErrorMessage('Nominal pengeluaran wajib berupa angka.');
      return;
    }
    const rawAmount = BigInt(rawAmountStr);
    if (rawAmount <= 0n) {
      setErrorMessage('Nominal pengeluaran harus lebih besar dari 0.');
      return;
    }

    if (rawAmount > saldoTersedia) {
      setErrorMessage(
        `Nominal pengeluaran (${formatRupiahDisplay(rawAmount)}) melebihi saldo tersedia (${formatRupiahDisplay(saldoTersedia)}).`
      );
      return;
    }

    if (!selectedFile) {
      setErrorMessage('Foto bukti nota wajib diunggah.');
      return;
    }

    setSubmittingEntry(true);
    try {
      // 1. Unggah foto nota ke server (validasi magic bytes + simpan ke storage)
      const formData = new FormData();
      formData.append('file', selectedFile);

      const uploadRes = await fetch('/api/admin/proof/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadJson.message || uploadJson.error || 'Gagal mengunggah foto bukti.');
      }

      const { proofUrl, proofSha256 } = uploadJson.data as {
        proofUrl: string;
        proofSha256: string;
      };

      // 2. Catat entri OUT ke buku kas
      const expenseRes = await fetch('/api/admin/entries/expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: selectedCampaign.id,
          amount: rawAmount.toString(),
          description: keterangan.trim(),
          occurredAt: tanggal ? new Date(`${tanggal}T12:00:00+07:00`).toISOString() : undefined,
          proofUrl,
          proofSha256,
        }),
      });
      const expenseJson = await expenseRes.json();
      if (!expenseRes.ok) {
        throw new Error(expenseJson.message || expenseJson.error || 'Gagal mencatat pengeluaran.');
      }

      setNominal('');
      setKeterangan('');
      setSelectedFile(null);
      setFilePreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await loadCampaignEntries(selectedCampaign.id);
      showToast(`Pengeluaran ${formatRupiahDisplay(rawAmount)} berhasil dicatat.`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal mencatat pengeluaran.');
    } finally {
      setSubmittingEntry(false);
    }
  };

  const handleSubmitPemasukan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) return;
    setErrorMessage(null);

    const rawAmountStr = nominal.replace(/\./g, '').trim();
    if (!rawAmountStr || !/^\d+$/.test(rawAmountStr)) {
      setErrorMessage('Nominal pemasukan wajib berupa angka.');
      return;
    }
    const rawAmount = BigInt(rawAmountStr);
    if (rawAmount <= 0n) {
      setErrorMessage('Nominal pemasukan harus lebih besar dari 0.');
      return;
    }

    setSubmittingEntry(true);
    try {
      const res = await fetch('/api/admin/entries/manual-income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: selectedCampaign.id,
          amount: rawAmount.toString(),
          donorName: isAnonymous ? null : namaDonatur.trim() || null,
          isAnonymous,
          description: keterangan.trim(),
          occurredAt: tanggal ? new Date(`${tanggal}T12:00:00+07:00`).toISOString() : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || json.error || 'Gagal mencatat pemasukan manual.');
      }

      setNominal('');
      setNamaDonatur('');
      setKeterangan('');
      setIsAnonymous(false);
      await loadCampaignEntries(selectedCampaign.id);
      showToast(`Pemasukan manual ${formatRupiahDisplay(rawAmount)} berhasil dicatat.`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal mencatat pemasukan manual.');
    } finally {
      setSubmittingEntry(false);
    }
  };

  const handleSubmitReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign || !reversalTarget) return;
    const reason = reversalReason.trim();
    if (!reason) {
      setReversalError('Alasan koreksi wajib diisi.');
      return;
    }

    setReversalError(null);
    setSubmittingReversal(true);
    try {
      const res = await fetch('/api/admin/entries/reversal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: selectedCampaign.id,
          targetEntryId: reversalTarget.id,
          reason,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || json.error || 'Gagal membuat entri koreksi.');
      }

      const seqCanceled = reversalTarget.seq;
      setReversalTarget(null);
      setReversalReason('');
      await loadCampaignEntries(selectedCampaign.id);
      showToast(`Entri koreksi untuk #${seqCanceled} berhasil dicatat.`);
    } catch (err: unknown) {
      setReversalError(err instanceof Error ? err.message : 'Gagal membuat entri koreksi.');
    } finally {
      setSubmittingReversal(false);
    }
  };

  return (
    <>
      <header style={{ background: 'var(--kertas)', borderBottom: '1px solid var(--garis)', padding: '14px 20px' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {selectedCampaign && (
              <Link href={`/c/${selectedCampaign.slug}`} className="btn btn-sm btn-outline-garis">
                Lihat Halaman Publik
              </Link>
            )}
            <button type="button" onClick={handleLogout} className="btn btn-sm btn-outline-garis">
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1040px', width: '100%', margin: '0 auto', padding: '28px 20px 80px 20px', flex: 1 }}>
        {/* Peringatan Anomali Webhook (Aturan 8.5 K) */}
        {anomalies.length > 0 && (
          <section
            aria-label="Peringatan Anomali Transaksi"
            style={{
              marginBottom: '24px',
              padding: '16px 20px',
              backgroundColor: 'var(--peringatan-latar)',
              border: '1.5px solid var(--keluar)',
              borderRadius: '6px',
              color: 'var(--tinta)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: 'var(--keluar)' }}>
                Perhatian: {anomalies.length} Transaksi Masuk Berstatus Anomali
              </h2>
            </div>
            <p style={{ fontSize: '14px', lineHeight: 1.5, margin: '0 0 12px 0' }}>
              Notifikasi pelunasan diterima untuk transaksi donasi yang sebelumnya berstatus kedaluwarsa atau gagal. Dana kemungkinan masuk ke penyedia pembayaran, namun belum otomatis dicatat di buku kas.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--garis-tegas)' }}>
                    <th style={{ padding: '6px 8px' }}>Order ID</th>
                    <th style={{ padding: '6px 8px' }}>Status Midtrans</th>
                    <th style={{ padding: '6px 8px' }}>Nominal</th>
                    <th style={{ padding: '6px 8px' }}>Waktu Diterima</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--garis)' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700 }}>{item.orderId}</td>
                      <td style={{ padding: '6px 8px' }}>{item.transactionStatus}</td>
                      <td className="tabular-angka" style={{ padding: '6px 8px' }}>
                        {item.amount ? formatRupiahDisplay(BigInt(item.amount)) : '-'}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        {new Date(item.receivedAt).toLocaleString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Info Organisasi & Pilihan / Pembuatan Campaign */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--tinta)', lineHeight: 1.2 }}>
              {selectedCampaign ? selectedCampaign.title : 'Dasbor Pengurus'}
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--tinta-redup)', marginTop: '4px' }}>
              Organisasi: <strong>{org?.name || 'Memuat…'}</strong> (Role: ORG_ADMIN)
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {selectedCampaign && (
              <>
                <span
                  className={`status-pill ${
                    selectedCampaign.status === 'ACTIVE'
                      ? 'pill-berizin'
                      : selectedCampaign.status === 'CLOSED'
                        ? 'pill-reversal'
                        : 'pill-pengurus'
                  }`}
                >
                  {selectedCampaign.status === 'ACTIVE'
                    ? 'Aktif'
                    : selectedCampaign.status === 'CLOSED'
                      ? 'Ditutup'
                      : 'Draft'}
                </span>

                {selectedCampaign.status === 'DRAFT' && (
                  <button
                    type="button"
                    onClick={handlePublishCampaign}
                    disabled={lifecycleLoading}
                    className="btn btn-sm btn-primary"
                  >
                    {lifecycleLoading ? 'Memproses…' : 'Terbitkan campaign'}
                  </button>
                )}

                {selectedCampaign.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={handleCloseCampaign}
                    disabled={lifecycleLoading}
                    className="btn btn-sm btn-outline-garis"
                  >
                    {lifecycleLoading ? 'Memproses…' : 'Tutup campaign'}
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setShowCreateForm((v) => !v);
                setCampaignError(null);
              }}
              className="btn btn-sm btn-secondary"
            >
              {showCreateForm && campaigns.length > 0 ? 'Batal buat' : 'Buat campaign'}
            </button>
          </div>
        </div>

        {/* Pemilih Campaign jika lebih dari 1 */}
        {campaigns.length > 1 && (
          <div style={{ marginBottom: '20px', maxWidth: '480px' }}>
            <label htmlFor="select-campaign" style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, marginBottom: '6px', color: 'var(--tinta-redup)' }}>
              Pilih Campaign Aktif
            </label>
            <select
              id="select-campaign"
              value={selectedCampaignId}
              onChange={(e) => {
                setSelectedCampaignId(e.target.value);
                setErrorMessage(null);
              }}
              style={{
                width: '100%',
                height: '44px',
                padding: '0 12px',
                border: '1.5px solid var(--garis-tegas)',
                borderRadius: '6px',
                background: 'var(--putih)',
                color: 'var(--tinta)',
              }}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.status})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Form Buat Campaign Baru */}
        {showCreateForm && (
          <section
            aria-label="Formulir Buat Campaign"
            style={{
              background: 'var(--putih)',
              border: '1.5px solid var(--garis-tegas)',
              padding: '24px',
              marginBottom: '28px',
              maxWidth: '640px',
            }}
          >
            <h2 style={{ fontSize: '19px', fontWeight: 700, color: 'var(--tinta)', marginBottom: '6px' }}>
              {campaigns.length === 0 ? 'Buat campaign pertama' : 'Buat campaign baru'}
            </h2>
            <p style={{ fontSize: '13.5px', color: 'var(--tinta-redup)', marginBottom: '18px' }}>
              Campaign baru disimpan sebagai Draft sampai Anda menerbitkannya.
            </p>

            <form onSubmit={handleCreateCampaign}>
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="newTitle" style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                  Judul Campaign (Wajib)
                </label>
                <input
                  id="newTitle"
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Contoh: Renovasi atap musala dusun"
                  style={{ width: '100%', height: '46px', padding: '0 12px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="newSlug" style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                  Slug URL (Opsional, huruf kecil & tanda hubung)
                </label>
                <input
                  id="newSlug"
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="Otomatis dari judul jika dikosongkan"
                  style={{ width: '100%', height: '46px', padding: '0 12px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="newStory" style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                  Cerita &amp; Rencana Anggaran (Wajib)
                </label>
                <textarea
                  id="newStory"
                  required
                  rows={4}
                  value={newStory}
                  onChange={(e) => setNewStory(e.target.value)}
                  placeholder="Jelaskan kebutuhan dan rencana penggunaan dana secara lugas..."
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px', resize: 'vertical' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="newTarget" style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                  Target Nominal Rupiah (Opsional)
                </label>
                <input
                  id="newTarget"
                  type="text"
                  inputMode="numeric"
                  className="rupiah"
                  value={newTarget}
                  onChange={(e) => handleFormatRupiahInput(e.target.value, setNewTarget)}
                  placeholder="Contoh: 25.000.000"
                  style={{ width: '100%', height: '46px', padding: '0 12px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="newBasis" style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                  Dasar Penggalangan
                </label>
                <select
                  id="newBasis"
                  value={newBasis}
                  onChange={(e) => setNewBasis(e.target.value as 'TERBATAS' | 'BERIZIN')}
                  style={{ width: '100%', height: '46px', padding: '0 12px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px', background: 'var(--putih)' }}
                >
                  <option value="TERBATAS">Komunitas terbatas (TERBATAS)</option>
                  <option value="BERIZIN">Penggalangan berizin (BERIZIN)</option>
                </select>
              </div>

              {newBasis === 'BERIZIN' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <label htmlFor="newPermitNumber" style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                      Nomor Izin (Wajib)
                    </label>
                    <input
                      id="newPermitNumber"
                      type="text"
                      required
                      value={newPermitNumber}
                      onChange={(e) => setNewPermitNumber(e.target.value)}
                      placeholder="Contoh: 188/412/2026"
                      style={{ width: '100%', height: '46px', padding: '0 12px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="newPermitDate" style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                      Tanggal Izin (Opsional)
                    </label>
                    <input
                      id="newPermitDate"
                      type="date"
                      value={newPermitDate}
                      onChange={(e) => setNewPermitDate(e.target.value)}
                      style={{ width: '100%', height: '46px', padding: '0 12px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px' }}
                    />
                  </div>
                </div>
              )}

              {campaignError && (
                <div style={{ color: 'var(--keluar)', fontSize: '13.5px', marginBottom: '14px', fontWeight: 500 }} role="alert">
                  {campaignError}
                </div>
              )}

              <button type="submit" disabled={submittingCampaign} className="btn btn-primary" style={{ width: '100%' }}>
                {submittingCampaign ? 'Menyimpan campaign…' : 'Simpan campaign (Draft)'}
              </button>
            </form>
          </section>
        )}

        {loadingInit ? (
          <div style={{ padding: '32px 0', color: 'var(--tinta-redup)' }}>
            Memuat data buku kas organisasi…
          </div>
        ) : selectedCampaign ? (
          <>
            {/* Ringkasan Keuangan Real dari Database */}
            <SaldoEquation
              totalMasuk={financial.totalMasuk}
              totalKeluar={financial.totalKeluar}
              saldo={financial.saldo}
              totalEntries={financial.totalEntries}
              targetAmount={selectedCampaign.targetAmount}
            />

            {/* Tab Dasbor: Garis Bawah 3px --tinta (Design.md S4) */}
            <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--garis-tegas)', margin: '24px 0' }} role="tablist">
              <button
                type="button"
                className="tab-btn"
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: activeTab === 'pengeluaran' ? 'var(--tinta)' : 'var(--tinta-redup)',
                  padding: '10px 0',
                  borderBottom: activeTab === 'pengeluaran' ? '3px solid var(--tinta)' : '3px solid transparent',
                  cursor: 'pointer',
                  minHeight: '44px',
                }}
                onClick={() => {
                  setActiveTab('pengeluaran');
                  setErrorMessage(null);
                }}
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
                  borderBottom: activeTab === 'pemasukan' ? '3px solid var(--tinta)' : '3px solid transparent',
                  cursor: 'pointer',
                  minHeight: '44px',
                }}
                onClick={() => {
                  setActiveTab('pemasukan');
                  setErrorMessage(null);
                }}
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
                      type="date"
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
                      onChange={(e) => handleFormatRupiahInput(e.target.value, setNominal)}
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
                      placeholder="Contoh: Pembelian semen 10 sak di TB Makmur"
                      value={keterangan}
                      onChange={(e) => setKeterangan(e.target.value)}
                      style={{ width: '100%', height: '48px', padding: '10px 14px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px' }}
                      required
                    />
                  </div>

                  <div style={{ marginBottom: '18px' }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }} htmlFor="inFoto">
                      Foto Nota / Bukti (Wajib: JPEG, PNG, atau WebP, maks 5 MB)
                    </label>
                    <input
                      ref={fileInputRef}
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
                    <div style={{ color: 'var(--keluar)', fontSize: '13.5px', marginBottom: '14px', fontWeight: 500 }} role="alert">
                      {errorMessage}
                    </div>
                  )}

                  <button type="submit" disabled={submittingEntry} className="btn btn-primary" style={{ width: '100%' }}>
                    {submittingEntry ? 'Mengunggah bukti & mencatat…' : 'Catat pengeluaran'}
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
                      type="date"
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
                      onChange={(e) => handleFormatRupiahInput(e.target.value, setNominal)}
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
                        style={{ width: '18px', height: '18px' }}
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
                    <div style={{ color: 'var(--keluar)', fontSize: '13.5px', marginBottom: '14px', fontWeight: 500 }} role="alert">
                      {errorMessage}
                    </div>
                  )}

                  <button type="submit" disabled={submittingEntry} className="btn btn-primary" style={{ width: '100%' }}>
                    {submittingEntry ? 'Mencatat pemasukan…' : 'Catat pemasukan manual'}
                  </button>
                  <p style={{ fontSize: '13px', color: 'var(--tinta-redup)', marginTop: '8px' }}>
                    Dicatat sebagai sumber MANUAL (&ldquo;Dicatat pengurus&rdquo;), bukan Midtrans.
                  </p>
                </form>
              </div>
            )}

            {/* Riwayat Buku Kas + Aksi Koreksi Reversal (Design.md S4) */}
            <div style={{ marginTop: '36px' }}>
              {loadingEntries ? (
                <p style={{ color: 'var(--tinta-redup)', fontSize: '14.5px' }}>Memuat riwayat buku kas…</p>
              ) : (
                <LedgerTable
                  entries={entries}
                  renderEntryAction={(entry) => {
                    const canReverse = (entry.type === 'IN' || entry.type === 'OUT') && !entry.isReversed;
                    if (!canReverse) {
                      return <span style={{ fontSize: '12.5px', color: 'var(--tinta-redup)' }}>—</span>;
                    }
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setReversalTarget(entry);
                          setReversalReason('');
                          setReversalError(null);
                        }}
                        className="btn btn-sm btn-outline-garis"
                      >
                        Batalkan
                      </button>
                    );
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <div style={{ padding: '24px', background: 'var(--putih)', border: '1px solid var(--garis)', color: 'var(--tinta-redup)' }}>
            Belum ada campaign untuk organisasi ini. Isi formulir di atas untuk membuat campaign pertama.
          </div>
        )}

        {/* Dialog Konfirmasi Koreksi Reversal (Design.md S4) */}
        {reversalTarget && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reversal-dialog-title"
            onClick={() => !submittingReversal && setReversalTarget(null)}
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
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--putih)',
                border: '1.5px solid var(--garis-tegas)',
                borderRadius: '10px',
                maxWidth: '460px',
                width: '100%',
                padding: '24px',
              }}
            >
              <h3 id="reversal-dialog-title" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--tinta)', marginBottom: '8px' }}>
                Batalkan Entri #{reversalTarget.seq}
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--tinta)', background: 'var(--peringatan-latar)', borderLeft: '4px solid var(--tinta)', padding: '10px 14px', marginBottom: '16px', lineHeight: 1.5 }}>
                Entri #{reversalTarget.seq} tetap terlihat. Sistem menambah entri koreksi.
              </p>

              <form onSubmit={handleSubmitReversal}>
                <label htmlFor="reversal-reason" style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                  Alasan koreksi (wajib diisi)
                </label>
                <textarea
                  id="reversal-reason"
                  required
                  rows={3}
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Contoh: Nominal salah input, seharusnya Rp 4.800.000"
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--garis-tegas)', borderRadius: '6px', marginBottom: '14px' }}
                />

                {reversalError && (
                  <div style={{ color: 'var(--keluar)', fontSize: '13.5px', marginBottom: '12px', fontWeight: 500 }} role="alert">
                    {reversalError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    disabled={submittingReversal}
                    onClick={() => setReversalTarget(null)}
                    className="btn btn-sm btn-outline-garis"
                  >
                    Tutup
                  </button>
                  <button type="submit" disabled={submittingReversal} className="btn btn-sm btn-primary">
                    {submittingReversal ? 'Menyimpan…' : 'Buat entri koreksi'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {toastMessage && (
          <div
            role="status"
            className="toast-animated"
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              background: 'var(--tinta)',
              color: 'var(--putih)',
              padding: '14px 20px',
              borderRadius: '6px',
              fontWeight: 500,
              border: '1px solid var(--tinta)',
              zIndex: 1500,
            }}
          >
            {toastMessage}
          </div>
        )}
      </main>
    </>
  );
}
