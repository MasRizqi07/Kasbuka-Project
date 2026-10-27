# Kasbuka

> Buku kas penggalangan dana yang boleh dibuka siapa saja.

Kasbuka adalah platform pencatatan transparansi kas untuk penggalangan dana komunitas kecil di Indonesia (musala, pesantren, panti, karang taruna, RT/RW, alumni). Platform ini berfungsi sebagai alat pencatatan dan pembuktian keterbukaan, bukan pihak penampung atau penyalur dana.

---

## Konsep Inti: Ledger Append-Only

Seluruh data transaksi Kasbuka berdiri di atas satu struktur data buku kas append-only:

- **Tanpa Edit & Tanpa Delete:** Entri buku kas tidak pernah diubah atau dihapus. Kesalahan pencatatan dikoreksi melalui entri `REVERSAL` yang mereferensikan entri lama.
- **Rantai Hash SHA-256:** Setiap entri menyimpan `prevHash` dan `hash`. `hash = SHA-256(prevHash + canonical JSON dari payload entri)`. Entri pertama menggunakan `prevHash` berupa 64 nol.
- **Saldo Murni Terhitung:** Saldo kas dihitung dinamis dari seluruh entri: `Saldo = Σ(IN - fee) - Σ(OUT)`. Saldo tidak disimpan sebagai kolom mutabel.
- **Verifikasi Integritas:** Siapa pun dapat memeriksa keutuhan buku kas secara publik. Server menghitung ulang seluruh rantai dan melaporkan status `VALID` atau mengidentifikasi entri yang terputus/termanipulasi (`RUSAK di entri #N`).

> **Kejujuran soal Batas:** Rantai hash membuktikan bahwa data di database tidak berubah diam-diam setelah dicatat. Ini tidak membuktikan bahwa pengurus mencatat semuanya, atau bahwa foto bukti asli di dunia nyata. Kasbuka bukan blockchain dan tidak membuat klaim "anti-korupsi" atau "100% terpercaya".

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
├── .github/workflows/ci.yml       # CI Pipeline GitHub Actions
├── prisma/schema.prisma           # Skema Prisma PostgreSQL
├── src/
│   ├── app/
│   │   ├── api/admin/             # Endpoint admin (terproteksi auth & tenant isolation)
│   │   ├── api/campaigns/         # Endpoint publik (termasuk verifikasi integritas)
│   │   ├── layout.tsx             # Root layout dengan Schibsted Grotesk & Kalam
│   │   ├── page.tsx               # Landing page pengurus
│   │   └── globals.css            # Base styles & tokens import
│   ├── lib/
│   │   ├── auth.ts                # Manajemen sesi pengurus
│   │   ├── auth-guard.ts          # Wrapper withAdminAuth & tenant isolation
│   │   ├── prisma.ts              # Prisma client singleton
│   │   └── ledger/                # Core Ledger Engine
│   │       ├── hash.ts            # Canonical JSON & SHA-256 hashing
│   │       ├── balance.ts         # Kalkulator saldo BigInt & reversal
│   │       ├── verifier.ts        # Verifikator keutuhan rantai & tamper detection
│   │       └── service.ts         # Layanan transaksional buku kas
│   └── styles/
│       └── tokens.css             # Desain token warna, tipografi, dan radius
├── tests/
│   ├── admin-auth.test.ts         # Test proteksi rute admin (Evidence Gate Fase 1)
│   └── ledger-core.test.ts        # Test hash chain, balance, & tamper test (Evidence Gate Fase 2)
├── index.html                     # Prototipe interaktif mandiri (Fase 0)
├── PRD.md                         # Product Requirement Document
└── Design.md                      # Spesifikasi token visual & desain sistem
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

4. **Jalankan pengujian integritas:**
   ```bash
   npm run test
   ```

5. **Jalankan server pengembangan:**
   ```bash
   npm run dev
   ```

Akses aplikasi di browser pada `http://localhost:3000`.

---

## Lisensi & Atribusi

Dikembangkan sebagai proyek transparansi dana publik oleh Rizqi (Pacoel).
