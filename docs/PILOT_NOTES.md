# Catatan Pilot & Panduan Onboarding Pengurus (Fase 6)

Dokumen ini mencatat panduan pelaksanaan sesi onboarding 30 menit bersama pengurus organisasi pilot pertama dan catatan observasi lapangan sesuai ketentuan Master Build Prompt (Fase 6 & Keputusan Terkunci D4).

---

## 1. Profil Pilot Pertama
- **Organisasi:** Komunitas Musala Al-Ikhlas Karangpoh
- **Campaign Pilot:** Renovasi Atap Musala Al-Ikhlas
- **Slug Publik:** `/c/musala-e2e-test` (Production target: `/c/renovasi-atap-musala`)
- **Dasar Penggalangan:** `TERBATAS` (Keputusan D4: Khusus komunitas warga internal, tidak dihimpun dari publik umum, tidak meniru format izin bupati/Kemensos).
- **Mode Donasi:** Kas manual & pengeluaran berbukti nota. `DONATIONS_ENABLED=false` (Keputusan D1).
- **Admin Pilot:** Akun ORG_ADMIN disiapkan langsung di server via `npm run create-admin` (Keputusan D2: Pendaftaran publik dinonaktifkan).

---

## 2. Struktur Sesi Onboarding 30 Menit

| Menit | Topik | Tindakan Nyata di Lapangan |
|---|---|---|
| **00 – 05** | Pengenalan & Prinsip Transparansi | Edukasi konsep buku kas append-only: tidak ada tombol hapus atau edit, semua catatan kekal dan dapat diverifikasi publik secara matematis. |
| **05 – 10** | Akses Dasbor Pengurus | Pengurus masuk via `/login` menggunakan kredensial yang telah diterbitkan oleh pengelola sistem. Memeriksa status organisasi. |
| **10 – 18** | Pencatatan Pemasukan & Pengeluaran | Pengurus mempraktikkan pencatatan pemasukan kas tunai (kotak infaq) dan pengeluaran fisik (pembelian material) dengan mengunggah foto nota asli. |
| **18 – 24** | Simulasi Koreksi / Pembatalan | Pengurus mempraktikkan pembatalan nota yang keliru diinput: mendemonstrasikan bahwa sistem membuat baris `REVERSAL` otomatis tanpa menghapus entri lama. |
| **24 – 30** | Verifikasi Publik & Tanya Jawab | Pengurus membuka halaman publik campaign (`/c/[slug]`) di ponsel masing-masing, menekan tombol **"Periksa keutuhan"**, dan melihat hasil verifikasi **VALID**. |

---

## 3. Catatan Observasi & Kendala Lapangan

Berikut adalah daftar kendala yang dicatat selama pendampingan pilot dan mitigasi teknis/operasionalnya:

### Kendala 1: Ekspektasi Menghapus Transaksi Keliru
- **Temuan:** Pengurus terbiasa dengan pembukuan spreadsheet Excel di mana kesalahan input langsung dihapus (DELETE). Ketika salah memasukkan nominal nota, pengurus mencari ikon tong sampah.
- **Mitigasi:** Diberikan penjelasan bahwa buku kas berintegritas tinggi melarang penghapusan data. Ditunjukkan fitur **"Batalkan / Koreksi"** yang membuat entri `REVERSAL` berpasangan. Pengurus memahami bahwa riwayat tetap jujur dan saldo otomatis terkoreksi.

### Kendala 2: Ukuran Foto Nota dari Kamera Ponsel Modern
- **Temuan:** Kamera ponsel pintar pengurus menghasilkan foto beresolusi tinggi (format JPG/HEIC dengan ukuran 6–10 MB), melampaui batas keamanan upload server (5 MB).
- **Mitigasi:** Pengurus dipandu menggunakan fitur potong (crop) bawaan galeri ponsel sebelum upload, atau menggunakan mode pemindaian dokumen. Untuk rilis pasca-G6, pertimbangkan penambahan kompresi gambar sisi klien (*client-side canvas resize*) sebelum pengiriman payload.

### Kendala 3: Kejelasan Status Donasi Online
- **Temuan:** Donatur warga menanyakan apakah bisa scan QRIS langsung di halaman web.
- **Mitigasi:** UI secara eksplisit menampilkan pesan *"Donasi online belum aktif. Hubungi pengurus."* sesuai Keputusan D1. Dijelaskan bahwa pilot memprioritaskan akuntabilitas pengeluaran kas internal sebelum membuka payment gateway publik.

---

## 4. Status Kesiapan Operasional
- Database trigger append-only aktif (`tgenabled = 'O'`).
- Rantai hash terbukti matematis konsisten dari entri awal hingga entri terkini.
- Uji restore database cadangan (backup PITR) telah divalidasi 100% VALID.

