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

## Lisensi & Atribusi

Dikembangkan sebagai proyek transparansi dana publik oleh Rizqi (Pacoel).
