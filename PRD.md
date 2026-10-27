# PRD: Kasbuka

> Buku kas penggalangan dana yang boleh dibuka siapa saja.

| | |
|---|---|
| Versi | 1.0 (MVP) |
| Tanggal | 27 Oktober 2026 |
| Owner | Rizqi (Pacoel) |
| Eksekutor | Antigravity (agent), Claude sebagai reviewer |
| Status | Draft, menunggu persetujuan owner sebelum fase build |

---

## 1. Problem

Penggalangan dana skala kecil di Indonesia (musala, pesantren, panti, karang taruna, RT/RW, alumni) masih jalan lewat broadcast WhatsApp, nomor rekening di poster, dan laporan Excel atau foto kertas. Donatur transfer, lalu tidak tahu uangnya dipakai untuk apa. Pengurus yang jujur pun sulit membuktikan kejujurannya.

Platform besar seperti Kitabisa menjawab masalah jangkauan, tapi tidak cocok untuk komunitas kecil: ada biaya platform, ada proses kurasi, dan laporan penggunaan dana berupa tulisan bebas. Hasilnya: kepercayaan donatur ditentukan reputasi pengurus, bukan bukti.

**Masalah inti:** tidak ada cara murah bagi pengurus kecil untuk menunjukkan setiap rupiah masuk dan keluar dengan bukti, dalam format yang tidak bisa diam-diam diubah.

## 2. Target user

**Persona utama (pengurus):** Pak Hasan, 42 tahun, bendahara takmir musala di Jombang. Pegang HP Android, nyaman dengan WhatsApp dan transfer m-banking, tidak nyaman dengan spreadsheet. Sedang galang dana renovasi atap Rp 85 juta dari warga dan perantau.

**Persona kedua (donatur):** Dina, 27 tahun, perantau di Surabaya. Dapat link dari grup WhatsApp keluarga. Mau donasi Rp 100 ribu, tapi ingin yakin uangnya sampai. Buka link di HP, tidak mau bikin akun.

**Bukan target MVP:** yayasan besar yang sudah punya sistem akuntansi, campaign viral skala nasional, individu yang galang dana pribadi tanpa organisasi.

## 3. Prioritas relatif

| Tingkat | Isi |
|---|---|
| **MVP-critical (P0)** | Ledger append-only, halaman publik campaign, donasi via Midtrans Snap (sandbox), pencatatan manual, pengeluaran dengan bukti, koreksi via reversal, verifikasi integritas, auth pengurus |
| **Berikutnya (P1)** | Berbagi ke WhatsApp dengan OG image, ekspor CSV, notifikasi email ke donatur |
| **Defer** | Semua yang ada di bagian Out of scope |

Aturan ke agent: **jangan mulai P1 sebelum semua P0 punya bukti verifikasi.** Mengerjakan yang paling seru dulu adalah pola yang sudah terjadi di proyek sebelumnya.

## 4. Konsep inti: ledger append-only

Seluruh produk berdiri di atas satu struktur data. Kalau ini salah, sisanya cuma kosmetik.

- Setiap campaign punya satu **buku kas** berisi entri bernomor urut (`seq`) 1, 2, 3, dst.
- Tipe entri: `IN` (uang masuk), `OUT` (uang keluar), `REVERSAL` (membatalkan entri sebelumnya).
- Entri **tidak pernah di-edit atau di-delete**. Salah catat? Buat entri `REVERSAL` yang merujuk entri salah, lalu catat ulang yang benar.
- Setiap entri menyimpan `prevHash` dan `hash`. `hash = SHA-256(prevHash + canonical JSON dari field entri)`. Entri pertama memakai `prevHash` berisi 64 nol.
- Saldo = jumlah `IN` dikurangi `OUT`, dengan `REVERSAL` membalik efek entri yang dirujuk. Saldo **dihitung dari ledger**, tidak disimpan sebagai kolom yang bisa diubah.
- Halaman verifikasi menghitung ulang seluruh rantai di server dan melaporkan `VALID` atau `RUSAK di entri #N`.

**Kejujuran soal batas:** hash chain membuktikan bahwa data di database tidak berubah diam-diam setelah dicatat. Ia **tidak** membuktikan bahwa pengurus mencatat semuanya, atau bahwa foto bukti asli. Jangan menulis "anti-korupsi" atau "100% terpercaya" di UI maupun README. Ini bukan blockchain dan tidak boleh disebut begitu.

## 5. Constraint regulasi (dasar keputusan produk)

Hasil riset 27 Oktober 2026. Ini bukan nasihat hukum; verifikasi ke teks regulasi dan dinas setempat.

- Penggalangan uang atau barang untuk kepentingan sosial diatur UU 9/1961, PP 29/1980, dan Permensos 8/2021 (diubah Permensos 8/2024). Prinsipnya tertib, transparan, akuntabel.
- Menurut Permensos 8/2021, penyelenggara adalah organisasi kemasyarakatan berbadan hukum (perkumpulan atau yayasan), bukan perorangan. Izin dari bupati/walikota untuk skala kabupaten/kota, gubernur untuk skala provinsi.
- Penggalangan tertutup (keluarga, komunitas terbatas, internal organisasi) dilaporkan tidak wajib izin.
- Pemberitaan menyebut donasi di atas Rp 500 juta wajib diaudit dan ada batas biaya operasional 10%. Cek angka persisnya di teks regulasi sebelum dijadikan aturan produk.

**Keputusan produk yang diturunkan:**

1. Kasbuka adalah **alat pencatatan dan transparansi**, bukan pihak yang mengumpulkan atau memegang dana. Platform tidak menahan saldo dan tidak mencairkan dana.
2. Saat membuat campaign, pengurus wajib memilih **Dasar penggalangan**: `BERIZIN` (isi nomor dan tanggal izin) atau `TERBATAS` (komunitas tertutup). Pilihan tampil di halaman publik. Platform tidak memvalidasi keabsahan izin dan harus menulis itu di UI.
3. Biaya Midtrans dicatat sebagai bagian ledger (kolom `fee`), tidak disembunyikan.
4. Kasbuka tidak memungut biaya platform di MVP.

## 6. User stories dan acceptance criteria

Semua kriteria harus bisa dijadikan test case. Kriteria yang tidak ditulis di sini tidak wajib dibangun.

### US-1: Donatur melihat campaign dan buku kasnya (P0)
*Sebagai donatur, saya ingin membuka link campaign tanpa login dan melihat semua uang masuk dan keluar, supaya saya bisa menilai sendiri.*

- **Given** campaign berstatus `ACTIVE`, **When** siapa pun membuka `/c/{slug}` tanpa login, **Then** halaman menampilkan judul, cerita, Dasar penggalangan, saldo, total masuk, total keluar, dan tabel buku kas dengan urutan `seq` menurun.
- **Given** campaign berstatus `DRAFT`, **When** non-pengurus membuka `/c/{slug}`, **Then** respons 404.
- **Given** donatur memilih anonim, **When** entri tampil di buku kas, **Then** nama tampil sebagai "Anonim" dan nama asli **tidak** ada di respons API publik.
- **Given** entri bertipe `OUT` punya bukti, **When** donatur menekan "Lihat bukti", **Then** foto terbuka dan tidak memerlukan login.
- **Given** buku kas berisi lebih dari 50 entri, **When** halaman dibuka, **Then** hanya 50 pertama dimuat dan ada kontrol "Muat lebih banyak" (cursor pagination).

### US-2: Donatur berdonasi lewat Midtrans (P0)
*Sebagai donatur, saya ingin berdonasi dengan QRIS, e-wallet, atau transfer bank tanpa membuat akun.*

- **Given** campaign `ACTIVE`, **When** donatur mengisi nominal ≥ Rp 10.000 dan menekan "Lanjut bayar", **Then** server membuat `Donation` berstatus `PENDING` dan mengembalikan Snap token. Nominal diambil dari body hanya pada langkah ini dan divalidasi server (integer, min 10.000, max 100.000.000).
- **Given** Midtrans mengirim notifikasi `settlement` dengan signature valid dan nominal sama dengan `Donation`, **When** webhook diproses, **Then** tepat satu entri `IN` dibuat di ledger dan `Donation` menjadi `PAID`.
- **Given** webhook yang sama dikirim dua kali, **When** diproses, **Then** tidak ada entri kedua (idempoten berdasarkan `orderId`).
- **Given** signature tidak valid, **When** webhook diterima, **Then** respons 401 dan tidak ada perubahan data.
- **Given** nominal di notifikasi tidak sama dengan `Donation`, **When** webhook diproses, **Then** ditolak, dicatat di log, tidak ada entri ledger.
- **Given** donasi berstatus `expire` atau `cancel`, **When** webhook diproses, **Then** `Donation` berubah ke `EXPIRED`/`FAILED` dan ledger tidak berubah.
- **Given** donatur mengisi pesan doa, **When** entri tampil, **Then** pesan tampil di entri itu, maksimal 200 karakter, di-escape (tidak ada HTML mentah).

### US-3: Pengurus mencatat pengeluaran dengan bukti (P0)
*Sebagai pengurus, saya ingin mencatat pengeluaran beserta foto nota, supaya donatur bisa melihatnya.*

- **Given** pengurus login dan memiliki organisasi pemilik campaign, **When** ia mengirim entri `OUT` dengan nominal, tanggal, deskripsi, dan foto bukti, **Then** entri tercatat dengan `seq` berikutnya dan hash yang benar.
- **Given** pengurus dari organisasi lain, **When** ia mencoba mencatat ke campaign ini, **Then** respons 403.
- **Given** nominal `OUT` melebihi saldo saat ini, **When** disubmit, **Then** ditolak 422 dengan pesan yang menyebut saldo tersedia.
- **Given** file bukan JPEG/PNG/WebP atau lebih dari 5 MB, **When** diunggah, **Then** ditolak 422. Validasi dilakukan di server berdasarkan magic bytes, bukan ekstensi.
- **Given** tidak ada foto bukti, **When** disubmit, **Then** ditolak 422. Bukti wajib untuk `OUT`.
- **Given** dua pengurus mencatat bersamaan, **When** keduanya commit, **Then** `seq` tidak bentrok dan rantai hash tetap valid (unique `(campaignId, seq)` dalam transaksi).

### US-4: Pengurus mencatat pemasukan manual (P0)
*Sebagai pengurus, saya ingin mencatat sumbangan tunai atau transfer langsung ke rekening organisasi.*

- **Given** pengurus login, **When** ia mengirim entri `IN` dengan `source=MANUAL`, nama donatur (atau anonim), nominal, dan tanggal, **Then** entri tercatat dan di buku kas diberi tanda "Dicatat pengurus".
- **Given** entri bersumber `MANUAL`, **When** tampil di publik, **Then** tidak ada klaim "terverifikasi pembayaran". Hanya entri `MIDTRANS` yang berlabel "Dibayar lewat Midtrans".

### US-5: Pengurus mengoreksi kesalahan (P0)
- **Given** entri #12 salah nominal, **When** pengurus membuat `REVERSAL` untuk #12 dengan alasan, **Then** entri baru tercatat, saldo kembali seperti sebelum #12, dan #12 tetap terlihat dengan tanda "Dibatalkan oleh #n".
- **Given** entri sudah dibatalkan, **When** pengurus mencoba membatalkannya lagi, **Then** ditolak 409.
- **Given** API apa pun, **When** menerima `PUT`, `PATCH`, atau `DELETE` ke entri ledger, **Then** 405. Tidak ada endpoint ubah atau hapus.
- **Given** pengguna database langsung mengubah satu baris, **When** verifikasi dijalankan, **Then** hasil `RUSAK di entri #N` dengan N benar (diuji lewat test yang memodifikasi baris secara sengaja).

### US-6: Siapa pun memverifikasi integritas (P0)
- **Given** campaign dengan ledger utuh, **When** pengunjung menekan "Periksa keutuhan buku", **Then** hasil `VALID` beserta jumlah entri dan hash terakhir.
- **Given** ledger rusak, **When** diperiksa, **Then** hasil menyebut entri pertama yang rantainya putus.

### US-7: Pengurus membuat campaign (P0)
- **Given** pengurus login, **When** mengisi judul, cerita, target (opsional), dan Dasar penggalangan, **Then** campaign tersimpan `DRAFT` dengan slug unik.
- **Given** Dasar penggalangan `BERIZIN` tanpa nomor izin, **When** disimpan, **Then** ditolak 422.
- **Given** campaign `DRAFT`, **When** pengurus menekan "Publikasikan", **Then** status `ACTIVE`. Setelah `ACTIVE`, judul dan Dasar penggalangan tidak bisa diubah tanpa catatan perubahan publik (cukup tampil "Diubah pada {tanggal}").
- **Given** campaign `ACTIVE`, **When** pengurus menutupnya, **Then** status `CLOSED`, donasi baru ditolak, ledger tetap terbaca publik.

### US-8: Pengurus mendaftar dan masuk (P0)
- **Given** pengunjung baru, **When** mendaftar dengan email dan password (min 10 karakter), **Then** akun dan satu organisasi dibuat, dan ia menjadi `ORG_ADMIN`.
- **Given** pengguna belum login, **When** mengakses `/dashboard` atau endpoint `/api/admin/*`, **Then** 401 atau redirect login. Tidak ada rute admin yang lolos karena pengecualian matcher.
- **Given** identitas pengguna, **When** server menentukan siapa yang mencatat entri, **Then** diambil dari sesi, **tidak pernah** dari body request.

### US-9: Berbagi ke WhatsApp (P1)
- **Given** halaman campaign, **When** tombol "Bagikan" ditekan, **Then** membuka `wa.me` dengan teks dan link. Link pratinjau menampilkan OG image berisi judul dan saldo terkini.

### US-10: Ekspor laporan CSV (P1)
- **Given** pengurus login, **When** menekan "Unduh CSV", **Then** file berisi seluruh entri dengan kolom seq, tanggal, tipe, nominal, fee, nama, deskripsi, hash.

## 7. Out of scope (MVP)

Agent **tidak boleh** membangun ini, meskipun terasa mudah:

- Menahan dana, escrow, atau pencairan dana lewat platform
- KYC atau verifikasi dokumen izin otomatis
- Donasi berulang (recurring), mata uang selain Rupiah
- Akun donatur, riwayat donasi donatur, komentar, like, follow
- Role selain `ORG_ADMIN` (tidak ada bendahara/auditor terpisah)
- Multi-bahasa, dark mode, aplikasi mobile native
- Kalkulator zakat, fitur keagamaan khusus
- Fitur AI apa pun (ringkasan cerita, deteksi penipuan, chatbot)
- Blockchain, smart contract, token, NFT
- Pemeriksaan keaslian foto bukti (EXIF forensik, deteksi manipulasi)
- Dashboard analitik lanjutan, A/B testing, SEO tuning

## 8. Success metric

**Satu angka:** jumlah campaign milik organisasi nyata di production yang punya minimal 1 entri `OUT` berbukti, dalam 30 hari setelah deploy production. **Target: 1** (batas: 21 Desember 2026).

Alasannya: satu pengurus nyata yang mau memakai ini membuktikan lebih banyak daripada seratus bintang GitHub. Metrik teknis (coverage, jumlah fitur) bukan ukuran keberhasilan.

## 9. Arsitektur dan stack

Keputusan sengaja berbeda dari stack standar (Turborepo + NestJS terpisah). Alasannya: ini proyek solo dengan target rilis 4 minggu, dan jumlah service yang dipisah belum menambah nilai.

| Lapisan | Pilihan | Catatan |
|---|---|---|
| App | Next.js (App Router), TypeScript strict | Satu repo, satu deployable. Route handler untuk API |
| Database | PostgreSQL + Prisma | Neon atau Supabase Postgres |
| Auth | Better Auth, email + password | Sesi server-side, cookie HttpOnly |
| Pembayaran | Midtrans Snap, **sandbox dulu** | Server key hanya di env server |
| Storage bukti | Cloudflare R2 atau Supabase Storage | Bucket publik hanya untuk bukti `OUT` |
| Validasi | Zod di setiap route handler | Skema dipakai ulang untuk tipe |
| Test | Vitest (unit), Playwright (alur utama) | Wajib, lihat gate di bawah |
| Deploy | Vercel + Postgres managed | CI GitHub Actions: lint, typecheck, test, build |

Pemisahan ke service sendiri ditunda sampai ada beban nyata yang menuntutnya.

### Model data (ringkas)

```
Organization   id, name, createdAt
User           id, email, passwordHash (dikelola auth lib), organizationId, role=ORG_ADMIN
Campaign       id, organizationId, slug (unique), title, story, targetAmount?,
               basis (BERIZIN|TERBATAS), permitNumber?, permitDate?,
               status (DRAFT|ACTIVE|CLOSED), createdAt
Donation       id, campaignId, orderId (unique), amount, status (PENDING|PAID|EXPIRED|FAILED),
               snapToken?, donorName?, isAnonymous, message?, ledgerEntryId?
LedgerEntry    id, campaignId, seq, type (IN|OUT|REVERSAL), source (MIDTRANS|MANUAL),
               amount (BigInt, rupiah), fee (BigInt, default 0), occurredAt,
               donorName?, isAnonymous, message?, description?, proofUrl?, proofSha256?,
               reversesEntryId?, createdById?, prevHash, hash
               UNIQUE (campaignId, seq), UNIQUE (campaignId, reversesEntryId)
```

Uang disimpan sebagai integer rupiah. Tidak ada float.

## 10. Keamanan (non-negotiable)

Daftar ini lahir dari temuan berulang di proyek-proyek sebelumnya.

- Identitas pelaku selalu dari sesi server, bukan dari body.
- Auth diterapkan di satu tempat terpusat (middleware atau wrapper route) yang mencakup `/api/admin/*`. Tambahkan test yang menembak setiap rute admin tanpa sesi dan mengharapkan 401.
- Tidak ada secret dengan prefix `NEXT_PUBLIC_`. `MIDTRANS_SERVER_KEY` hanya terbaca di server.
- Webhook: verifikasi `signature_key = SHA512(order_id + status_code + gross_amount + ServerKey)`, cocokkan nominal dengan `Donation`, idempoten.
- Rate limit pada endpoint pembuatan donasi dan login.
- Pesan donatur dan teks campaign di-escape saat render. Tidak ada `dangerouslySetInnerHTML` untuk konten pengguna.
- Upload: cek magic bytes, batas 5 MB, nama file diganti UUID, simpan `proofSha256`.
- Tenant isolation: setiap query admin menyertakan `organizationId` dari sesi.
- Respons API publik tidak pernah memuat email pengurus atau nama asli donatur anonim.

## 11. Fase build dan Evidence Gate

Setiap fase **selesai** hanya jika bukti mentahnya ditempel: output terminal untuk `typecheck`, `lint`, `test`, `build`, tanpa diringkas oleh agent. Klaim "selesai" tanpa log ditolak.

| Fase | Isi | Gate | Target |
|---|---|---|---|
| 0 | Prototipe HTML di Gemini dari Design.md, dipilih dan dibekukan | File HTML final + 4 screenshot | Jum 30 Okt |
| 1 | Scaffold, CI, skema Prisma, auth, middleware admin | Test: semua rute admin tanpa sesi → 401 | Min 1 Nov |
| 2 | Inti ledger: append, hash chain, reversal, verifikasi | Test integritas termasuk tamper test (US-5, US-6) | Min 8 Nov |
| 3 | Campaign CRUD, halaman publik, pengeluaran + upload bukti, pemasukan manual | Test akseptansi US-1, US-3, US-4, US-7 | Sab 14 Nov |
| 4 | Midtrans Snap sandbox + webhook idempoten | Test US-2 termasuk webhook ganda dan signature palsu | Min 15 Nov |
| 5 | Deploy staging, uji lintas perangkat, perbaiki | URL staging hidup, uji manual di HP Android | Sab 21 Nov |
| 6 | Deploy production, onboard 1 pengurus nyata | URL production, 1 campaign nyata terdaftar | Sab 28 Nov |

Jadwal ini ketat dan sengaja begitu. Kalau fase 3 meleset, **buang fase 4** (donasi pakai catatan manual dulu), jangan geser tanggal rilis.

## 12. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Pengurus mencatat tidak lengkap, ledger rapi tapi isinya bohong | Kepercayaan palsu | Teks jujur di UI soal batas bukti; label sumber entri; jangan klaim "terjamin" |
| Penyalahgunaan untuk penipuan donasi | Reputasi dan hukum | Tampilkan Dasar penggalangan, tombol "Laporkan campaign", hapus akses publik lewat status `CLOSED`; tidak ada pencairan lewat platform |
| Pelanggaran regulasi PUB oleh pengguna | Hukum | Wajib pilih Dasar penggalangan, disclaimer platform bukan pemberi izin |
| Midtrans production butuh akun bisnis per merchant | Tidak bisa terima donasi nyata | MVP produksi bisa memakai pencatatan manual; Midtrans tetap sandbox sampai ada merchant sah |
| Scope creep karena ide terlalu menarik | Tidak rilis | Out of scope di atas dibacakan ulang ke agent di setiap fase |
| Hash chain jadi satu-satunya "fitur unik" | Produk tipis | Nilai produk ada di alur pengurus yang mudah, bukan di kriptografi; uji ke pengurus nyata di fase 6 |

## 13. Daftar verifikasi (tidak boleh dicentang tanpa bukti)

- [ ] Semua rute `/api/admin/*` mengembalikan 401 tanpa sesi (log test)
- [ ] Tamper test ledger lolos (log test)
- [ ] Webhook ganda tidak membuat entri kedua (log test)
- [ ] Signature palsu → 401 (log test)
- [ ] `grep -r "NEXT_PUBLIC_" .env*` tidak menemukan secret
- [ ] Tidak ada endpoint `PUT/PATCH/DELETE` untuk `LedgerEntry`
- [ ] Halaman publik terbuka di HP Android dengan koneksi 4G (uji manual, screenshot)
- [ ] 1 pengurus nyata sudah mencoba alur pengeluaran dan memberi komentar tertulis

## 14. Pertanyaan terbuka untuk owner

1. Apakah pilot pertama sudah ada? Sebut satu nama organisasi dan satu orang yang bisa dihubungi sebelum fase 1 dimulai. Tanpa ini, fase 6 hanya angan-angan.
2. Nama produk "Kasbuka" final atau mau diganti? Cek ketersediaan domain sebelum prototipe dibuat.
