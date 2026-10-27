import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      <header style={{ background: 'var(--kertas)', borderBottom: '1px solid var(--garis)', padding: '16px 24px' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none', fontWeight: 800, fontSize: '24px', color: 'var(--tinta)' }}>
            <svg style={{ width: '22px', height: '22px' }} viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="1" y="1" width="20" height="20" rx="3" stroke="#1E2A78" strokeWidth="2" />
              <line x1="1" y1="8" x2="21" y2="8" stroke="#1E2A78" strokeWidth="1.5" />
              <line x1="1" y1="15" x2="21" y2="15" stroke="#1E2A78" strokeWidth="1.5" />
              <line x1="7" y1="1" x2="7" y2="7" stroke="#1E2A78" strokeWidth="2" />
              <line x1="7" y1="16" x2="7" y2="21" stroke="#1E2A78" strokeWidth="2" />
            </svg>
            <span>Kasbuka</span>
          </Link>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <Link href="/login" className="btn btn-sm btn-text">Masuk</Link>
            <Link href="/dashboard" className="btn btn-sm btn-primary">Mulai buku kas</Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1040px', width: '100%', margin: '0 auto', padding: '32px 24px 80px 24px', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '40px', alignItems: 'center', marginTop: '24px', marginBottom: '64px' }}>
          <div>
            <h1 style={{ fontSize: '40px', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em', color: 'var(--tinta)', marginBottom: '20px' }}>
              Semua rupiah yang masuk dan keluar, ditulis di depan umum.
            </h1>
            <p style={{ fontSize: '18px', color: 'var(--tinta)', lineHeight: 1.55, maxWidth: '500px', marginBottom: '28px' }}>
              Kasbuka membantu pengurus musala, pesantren, dan komunitas menunjukkan catatan dana lengkap dengan foto nota.
            </p>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <Link href="/dashboard" className="btn btn-primary">Mulai buku kas</Link>
              <Link href="/c/atap-musala-al-ikhlas" className="btn btn-text">Lihat contoh buku kas</Link>
            </div>
          </div>

          <div style={{ background: 'var(--putih)', border: '1px solid var(--garis)', padding: '0' }}>
            <div style={{ background: 'var(--blok)', padding: '10px 16px', fontSize: '13px', fontWeight: 700, borderBottom: '1.5px solid var(--garis-tegas)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Buku kas: Musala Al-Ikhlas</span>
              <span className="tabular-angka">Saldo Rp 7.955.050</span>
            </div>
            <div style={{ padding: '16px' }}>
              <div style={{ padding: '10px 0', borderBottom: '1px solid var(--garis)', display: 'flex', gap: '12px', fontSize: '14px', background: 'var(--blok)' }}>
                <div style={{ width: '48px', color: 'var(--tinta-redup)', fontSize: '13px', borderRight: '2px solid var(--garis-tegas)', paddingRight: '6px', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--tinta)' }}>#12</div>
                  <div>27 Okt</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong style={{ color: 'var(--tinta)' }}>Dina K.</strong>
                    <span className="tabular-angka" style={{ color: 'var(--masuk)', fontWeight: 700 }}>+ Rp 100.000</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-tangan)', fontSize: '16px', marginTop: '4px', paddingLeft: '12px', borderLeft: '2px solid var(--garis-tegas)' }}>
                    &ldquo;Semoga atapnya segera selesai, Pak.&rdquo;
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section style={{ margin: '64px 0', borderTop: '1px solid var(--garis)', paddingTop: '48px' }}>
          <h2 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '28px', color: 'var(--tinta)' }}>Cara kerja untuk pengurus</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '760px' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--tinta)', width: '32px', flexShrink: 0 }}>1.</div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>Buat campaign</h3>
                <p style={{ fontSize: '15.5px', color: 'var(--tinta-redup)', lineHeight: 1.5 }}>
                  Tulis tujuan penggalangan dana, kebutuhan anggaran, dan cantumkan dasar izin atau keterangan komunitas terbatas.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--tinta)', width: '32px', flexShrink: 0 }}>2.</div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>Catat setiap uang masuk dan keluar</h3>
                <p style={{ fontSize: '15.5px', color: 'var(--tinta-redup)', lineHeight: 1.5 }}>
                  Donasi lewat QRIS atau transfer otomatis masuk ke buku kas. Setiap pengeluaran wajib dilampiri foto nota toko atau kuitansi tukang.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--tinta)', width: '32px', flexShrink: 0 }}>3.</div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>Bagikan link ke grup</h3>
                <p style={{ fontSize: '15.5px', color: 'var(--tinta-redup)', lineHeight: 1.5 }}>
                  Kirim tautan buku kas ke grup WhatsApp keluarga atau warga. Siapa pun dapat melihat saldo terkini dan membuktikan keutuhan catatan.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section style={{ background: 'var(--putih)', border: '1px solid var(--garis)', borderLeft: '4px solid var(--tinta)', padding: '24px', margin: '48px 0', maxWidth: '760px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: 'var(--tinta)' }}>Yang Kasbuka tidak lakukan</h3>
          <ul style={{ listStyleType: 'square', paddingLeft: '20px', fontSize: '15px', color: 'var(--tinta)', lineHeight: 1.6 }}>
            <li><strong>Tidak memegang atau menampung dana.</strong> Donasi disalurkan langsung via payment gateway ke rekening organisasi; Kasbuka murni alat pencatatan transparansi.</li>
            <li><strong>Tidak memeriksa keabsahan izin dinas.</strong> Status izin dicantumkan apa adanya sesuai pengakuan pengurus untuk dinilai sendiri oleh publik.</li>
            <li><strong>Tidak menjamin pengurus jujur.</strong> Sistem hash chain memastikan catatan yang sudah ditulis tidak bisa diubah diam-diam, namun tidak menggantikan ketelitian warga.</li>
          </ul>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid var(--garis)', padding: '32px 24px', background: 'var(--kertas)', fontSize: '14px', color: 'var(--tinta-redup)', marginTop: 'auto' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <strong style={{ color: 'var(--tinta)' }}>Kasbuka</strong> — Buku kas penggalangan dana terbuka.
            <div style={{ marginTop: '4px' }}>Proyek portofolio, belum dipakai untuk donasi sungguhan (Midtrans Sandbox).</div>
          </div>
          <div>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </div>
      </footer>
    </>
  );
}
