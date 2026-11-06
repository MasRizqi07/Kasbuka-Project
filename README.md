# Kasbuka

> Buku kas penggalangan dana yang boleh dibuka siapa saja.

Kasbuka adalah platform pencatatan transparansi kas untuk penggalangan dana komunitas kecil di Indonesia (musala, pesantren, panti, karang taruna, RT/RW, alumni). Platform ini berfungsi sebagai alat pencatatan dan pembuktian keterbukaan, bukan pihak penampung atau penyalur dana.

---

## Konsep Inti: Ledger Append-Only

Seluruh data transaksi Kasbuka berdiri di atas satu struktur data buku kas append-only:

- **Tanpa Edit & Tanpa Delete:** Entri buku kas tidak pernah diubah atau dihapus. Kesalahan pencatatan dikoreksi melalui entri `REVERSAL` yang mereferensikan entri lama. Trigger database di level PostgreSQL secara fisik menolak operasi UPDATE dan DELETE pada tabel `LedgerEntry`.
- **Rantai Hash SHA-256:** Setiap entri menyimpan `prevHash` dan `hash`. `hash = SHA-256(prevHash + canonical JSON dari payload entri)`. Entri pertama menggunakan `prevHash` berupa 64 nol.
- **Saldo Murni Terhitung:** Saldo kas dihitung dinamis dari seluruh entri: `Saldo = Σ(IN - fee) - Σ(OUT)`. Saldo tidak disimpan sebagai kolom mutabel.
- **Verifikasi Integritas:** Siapa pun dapat memeriksa keutuhan buku kas secara publik. Server menghitung ulang seluruh rantai dan melaporkan status `VALID` atau mengidentifikasi entri yang terputus/termanipulasi (`RUSAK di entri #N`).
- **Jangkar Hash:** Halaman publik menampilkan potongan hash entri terakhir beserta tanggalnya sebagai jangkar publik. Jika data diubah, nilai hash jangkar ini akan berbeda.

> **Kejujuran soal Batas:** Rantai hash membuktikan bahwa data di basis data konsisten dan tidak diubah diam-diam setelah dicatat. Ini tidak membuktikan bahwa pengurus mencatat seluruh transaksi fisik, atau bahwa foto nota asli. Kasbuka murni alat bantu pencatatan terbuka dan akuntabilitas komunitas.

---

## Ketahanan & Menjalankan PostgreSQL Lokal (Port 5433)

Untuk menjalankan pengujian integrasi konkurensi dan menjalankan server secara lokal, instance PostgreSQL harus berjalan pada port **5433**.

### Opsi A: Melalui Windows Service (Native)
Jika PostgreSQL sudah terpasang di host Windows (service `postgresql-x64-18`):

```powershell
# Cek status service
Get-Service postgresql-x64-18

# Menyalakan service PostgreSQL
Start-Service postgresql-x64-18
# Atau menggunakan perintah net:
net start postgresql-x64-18
```

### Opsi B: Melalui Docker Container
Jika menjalankan PostgreSQL melalui Docker:

```powershell
# Jalankan container PostgreSQL di port 5433
docker run -d --name kasbuka-postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=kasbuka `
  -p 5433:5432 `
  postgres:16-alpine

# Buat database pengujian kasbuka_test
docker exec -i kasbuka-postgres psql -U postgres -c "CREATE DATABASE kasbuka_test;"
```

### Menjalankan Migrasi ke Kedua Database
```powershell
# Migrasi database utama (kasbuka)
npx prisma migrate deploy

# Migrasi database pengujian (kasbuka_test)
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/kasbuka_test"
npx prisma migrate deploy
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/kasbuka"
```

---

## Teknologi & Arsitektur

- **Framework:** Next.js 16 (App Router) + TypeScript Strict
- **Database & ORM:** PostgreSQL + Prisma ORM
- **Auth:** Sesi server-side (cookie HttpOnly) + bcryptjs
- **Pembayaran:** Midtrans Snap (Sandbox)
- **Validasi & Pengujian:** Zod, Vitest (Unit & Integrity Tests), Playwright
- **Desain & Gaya:** CSS Design Tokens murni ([tokens.css](src/styles/tokens.css)), Schibsted Grotesk & Kalam

---

## Struktur Folder

```text
Kasbuka-Project/
├── .github/workflows/ci.yml       # CI Pipeline GitHub Actions dengan PostgreSQL service
├── prisma/schema.prisma           # Skema Prisma PostgreSQL
├── prisma/migrations/             # Migrasi fisik DDL & trigger append-only
├── src/
│   ├── app/
│   │   ├── api/admin/             # Endpoint admin (terproteksi auth & tenant isolation)
│   │   ├── api/campaigns/         # Endpoint publik (termasuk verifikasi integritas)
│   │   ├── c/[slug]/              # Halaman publik campaign dengan jangkar hash
│   │   ├── layout.tsx             # Root layout dengan Schibsted Grotesk & Kalam
│   │   ├── page.tsx               # Landing page pengurus
│   │   └── globals.css            # Base styles & tokens import
│   ├── components/                # Komponen antarmuka (LedgerTable, HashAnchor, dll)
│   ├── lib/
│   │   ├── auth.ts                # Manajemen sesi pengurus
│   │   ├── auth-guard.ts          # Wrapper withAdminAuth & tenant isolation
│   │   ├── prisma.ts              # Prisma client singleton
│   │   └── ledger/                # Core Ledger Engine
│   │       ├── hash.ts            # Canonical JSON & SHA-256 hashing
│   │       ├── balance.ts         # Kalkulator saldo BigInt & reversal dinamis
│   │       ├── verifier.ts        # Verifikator keutuhan rantai & tamper detection
│   │       └── service.ts         # Layanan transaksional buku kas & konkurensi DB
│   └── styles/
│       └── tokens.css             # Desain token warna, tipografi, dan radius
├── tests/
│   ├── admin-auth.test.ts                 # Test proteksi rute admin
│   ├── ledger-core.test.ts                # Test hash chain, balance, & tamper test
│   ├── ledger-concurrency.test.ts         # Test konkurensi memori & P2002 retry
│   ├── ledger-postgres-integration.test.ts# Test PostgreSQL nyata (kasbuka_test)
│   ├── midtrans-signature.test.ts         # Test kalkulasi signature Midtrans
│   └── phase3-acceptance.test.ts          # Acceptance test CRUD, saldo & bukti
├── index.html                             # Prototipe interaktif mandiri (Fase 0)
├── PRD.md                                 # Product Requirement Document
└── Design.md                              # Spesifikasi token visual & desain sistem
```

---

## Memulai Proyek Secara Lokal

1. **Clone repository:**
   ```bash
   git clone https://github.com/MasRizqi07/Kasbuka-Project.git
   cd Kasbuka-Project
   ```

2. **Pasang dependensi:**
   ```bash
   npm install
   ```

3. **Salin konfigurasi environment:**
   ```bash
   cp .env.example .env
   ```

4. **Pastikan PostgreSQL berjalan pada port 5433** (lihat bagian Ketahanan PostgreSQL di atas).

5. **Jalankan pengujian integritas:**
   ```bash
   npm run test
   ```

6. **Jalankan server pengembangan:**
   ```bash
   npm run dev
   ```

Akses aplikasi di browser pada `http://localhost:3000`.

---

## Variabel Lingkungan (Environment Variables)

Daftar resmi seluruh variabel lingkungan dikelola secara tunggal di [.env.example](.env.example).
Tidak ada rahasia (secret) yang menggunakan prefix `NEXT_PUBLIC_` selain client key Midtrans publik (PRD Bagian 10).

---

## Panduan Deployment Staging

Untuk melakukan verifikasi staging di platform Vercel / Cloudflare Pages:

1. **Siapkan Database Terkelola (Supabase / Neon):**
   - Dapatkan `DATABASE_URL` (dengan connection pooling/pgBouncer).
   - Dapatkan `DIRECT_URL` (koneksi langsung ke PostgreSQL port 5432 untuk migrasi DDL).

2. **Jalankan Migrasi Database Staging:**
   ```bash
   DATABASE_URL="<STAGING_DATABASE_URL>" DIRECT_URL="<STAGING_DIRECT_URL>" npx prisma migrate deploy
   ```

3. **Verifikasi Trigger Append-Only Aktif:**
   ```sql
   SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trg_ledger_entry_append_only';
   -- Pastikan tgenabled = 'O'
   ```

4. **Konfigurasi Environment Variable Staging di Vercel:**
   Salin nilai sesuai daftar di `.env.example`:
   - `DATABASE_URL` & `DIRECT_URL`
   - `AUTH_SECRET`: string acak minimum 32 karakter
   - `MIDTRANS_SERVER_KEY` & `MIDTRANS_CLIENT_KEY` (kredensial Sandbox dari Midtrans Dashboard)
   - `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY`
   - `MIDTRANS_IS_PRODUCTION="false"`
   - `DONATIONS_ENABLED="true"` (untuk pengujian donasi di staging)
   - `STORAGE_PROVIDER="supabase"`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_APP_URL="https://<nama-project>.vercel.app"`

5. **Uji Transaksi Nyata di Staging:**
   - Lakukan donasi uji via Midtrans Sandbox simulator.
   - Periksa status entri pada tabel `Donation` berubah menjadi `PAID` (bukan `SETTLED`, status `PAID` adalah representasi lunas di `DonationStatus` schema.prisma).
   - Periksa pembentukan baris otomatis di `LedgerEntry` bertipe `IN` dengan `source = 'MIDTRANS'` dan `donationId`.
   - Periksa pencatatan di `WebhookEvent` dengan `result = 'PROCESSED'`.

---

## Pemisahan Lingkungan: Staging vs Production & Prosedur Data Reset (Aturan 5B W)

Untuk menjaga integritas dan akuntabilitas data, lingkungan Staging dan Production **wajib dipisahkan secara fisik** dan memiliki basis data serta konfigurasi yang berbeda.

### 1. Prosedur Pembersihan Data Uji di Staging (Data Reset)
Setelah pengujian simulasi Sandbox selesai atau sebelum mengulang uji integrasi, jalankan perintah TRUNCATE berikut di SQL Editor basis data Staging:

```sql
-- PERINGATAN: Hanya jalankan di basis data STAGING.
-- Menghapus seluruh transaksi simulasi dan mereset nomor urut ledger:
TRUNCATE TABLE "LedgerEntry", "Donation", "WebhookEvent", "RateLimit" CASCADE;

-- Atau untuk mereset seluruh database staging ke keadaan awal (kosong bersih):
TRUNCATE TABLE "LedgerEntry", "Donation", "WebhookEvent", "RateLimit", "Session", "Campaign", "User", "Organization" CASCADE;
```

### 2. Penyiapan Basis Data Production Terpisah
Production **tidak boleh** berbagi database dengan Staging. Langkah penyiapan Production:
1. **Buat Proyek Database Supabase Baru:**
   - Buat proyek khusus `kasbuka-prod` di region yang sama dengan serverless runtime (misal `ap-south-1` Mumbai).
   - Pastikan backup otomatis diaktifkan di dashboard Supabase.
2. **Jalankan Migrasi DDL Fisik ke Production:**
   ```bash
   DATABASE_URL="<PROD_DATABASE_POOLER_URL>" DIRECT_URL="<PROD_DATABASE_DIRECT_URL>" npx prisma migrate deploy
   ```
3. **Verifikasi Keamanan Basis Data:**
   - Pastikan trigger append-only aktif: `SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trg_ledger_entry_append_only';` (`tgenabled = 'O'`).
   - Pastikan RLS aktif di seluruh 8 tabel: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';` (`rowsecurity = true`).
4. **Buat Akun Pengurus Pilot Pertama:**
   Jalankan script CLI dengan input password tersembunyi (raw mode muted):
   ```bash
   DATABASE_URL="<PROD_DATABASE_DIRECT_URL>" ADMIN_EMAIL="pengurus@pilot.org" ADMIN_ORG="Organisasi Pilot" npm run create-admin
   ```
5. **Siapkan Supabase Storage Privat:**
   - Buat bucket `kasbuka-proofs` dengan status privat (bukan public).
   - Pastikan role server menggunakan `STORAGE_PROVIDER="supabase"` dengan `SUPABASE_SERVICE_ROLE_KEY`.

### 3. Aturan Saklar Donasi Online (`DONATIONS_ENABLED`)
- **Staging:** `DONATIONS_ENABLED="true"` diaktifkan **hanya** saat pengujian end-to-end dengan Midtrans Sandbox Simulator.
- **Production (Pilot):** `DONATIONS_ENABLED="false"` **wajib bernilai false** sebelum dan selama onboarding organisasi pilot nyata. Pengurus pilot mencatat transaksi kas operasional (IN manual dan OUT dengan bukti foto nota asli) tanpa membuka gerbang pembayaran daring hingga fase audit selesai.

---

## Lisensi & Atribusi

Dikembangkan sebagai proyek transparansi dana publik oleh Rizqi (Pacoel).
