# Design.md: Kasbuka

Dokumen ini dipakai sebagai brief untuk membuat **prototipe HTML** di Gemini, lalu menjadi acuan token untuk build di Antigravity. Isi PRD ada di `PRD.md`. Kalau dua dokumen bertentangan, PRD menang untuk perilaku, dokumen ini menang untuk tampilan.

---

## 1. Brief satu paragraf

Kasbuka adalah situs buku kas untuk penggalangan dana komunitas kecil di Indonesia (musala, pesantren, karang taruna, RT/RW). Pengunjung utama membuka link dari grup WhatsApp, di HP Android, dengan sinyal 4G yang kadang lemah. Tugas desain: membuat orang **membaca buku kas**, bukan menekan tombol donasi karena terbawa suasana. Kepercayaan datang dari kejelasan angka dan bukti, jadi tampilan harus terasa seperti dokumen keuangan yang rapi, bukan situs kampanye emosional.

## 2. Ide visual yang dipilih

**Metafora: buku kas bergaris hijau pucat, ditulis dengan pulpen biru.** Ini benda nyata yang dikenal bendahara di seluruh Indonesia: kertas berkolom, garis tipis hijau, tulisan tangan tinta biru, nota dengan stempel.

Satu elemen yang berani (spend boldness in one place): **buku kas itu sendiri adalah hero halaman publik.** Bukan progress bar, bukan angka raksasa dengan gradien. Saldo ditulis sebagai persamaan yang bisa dibaca:

```
Rp 19.105.050 masuk  −  Rp 11.150.000 keluar  =  Rp 7.955.050 saldo
```

Semua elemen lain dibuat tenang supaya persamaan dan tabel itu yang diingat.

### Hal yang sengaja dihindari (default AI yang harus dibuang)

Gemini cenderung jatuh ke pola ini. Larang eksplisit:

- Latar krem hangat + serif display + aksen terakota. **Tidak dipakai.** Palet di sini dingin (putih kehijauan + biru tinta).
- Tema gelap dengan satu aksen hijau neon atau jingga menyala.
- Layout koran dengan garis rambut dan radius nol di mana-mana.
- Grid kartu seragam, semua radius sama, bayangan abu lembut identik, latar gradien, blob blur, glassmorphism.
- Label ALL CAPS dengan letter-spacing lebar di atas setiap judul (eyebrow).
- Penanda bernomor 01 / 02 / 03 untuk konten yang bukan urutan.
- String meta dengan titik tengah ("A · B · C"), label gaya "KATA — fragmen", tanda panah "→" di akhir tombol atau tautan.
- Satu kata di judul diberi warna atau miring sendirian.
- Hitam tinted (#0B0B0B, #111) sebagai pengganti hitam. Teks memakai biru tinta, bukan hitam.
- Ikon emoji sebagai ikon fitur. Stok foto orang tersenyum. Ilustrasi 3D.
- Fade-and-slide-up di setiap section dan hover-lift di setiap kartu.
- Teks "Lorem ipsum", nama "John Doe", "Acme". Semua konten memakai data di bagian 8.
- Grid tiga fitur dengan ikon di landing page.
- Monospace untuk label kecil. Angka memakai tabular figures dari font utama.

## 3. Prinsip

1. **Angka lebih penting daripada kata.** Rupiah selalu rata kanan, tabular, tanpa singkatan ("Rp 7.955.050", bukan "7,9 jt").
2. **Garis membawa informasi.** Garis hijau antar baris = pemisah entri. Garis margin vertikal = batas kolom tanggal. Jangan menambah garis dekoratif.
3. **Tiga warna punya arti tetap.** Biru tinta = identitas dan aksi. Hijau = uang masuk. Oranye bata = uang keluar. Tidak boleh dipakai untuk hal lain.
4. **Tulisan tangan hanya untuk suara manusia.** Pesan doa donatur memakai font tulisan tangan. Selain itu tidak ada.
5. **Jujur soal batas.** Label sumber entri ("Dibayar lewat Midtrans" vs "Dicatat pengurus") selalu terlihat. Tidak ada lencana "Terjamin" atau perisai.

## 4. Token

### 4.1 Warna

| Nama | Hex | Peran | Kontras |
|---|---|---|---|
| `--kertas` | `#F4F6F3` | Latar halaman | (dasar) |
| `--putih` | `#FFFFFF` | Permukaan form, sheet | (dasar) |
| `--tinta` | `#1E2A78` | Teks utama, tombol utama, tautan | 11,7:1 di kertas |
| `--tinta-redup` | `#5A6360` | Teks sekunder | 5,7:1 di kertas |
| `--masuk` | `#17694A` | Uang masuk | 6,1:1 di kertas, 6,6:1 di putih |
| `--keluar` | `#A83A1B` | Uang keluar | 5,9:1 di kertas |
| `--garis` | `#BFD3C8` | Garis baris, border | dekoratif, bukan teks |
| `--garis-tegas` | `#8FAE9F` | Garis margin, border input | 2,4:1 (batas komponen, dibantu label) |
| `--blok` | `#E6EEE8` | Latar baris terpilih/ganjil, status netral | dekoratif |
| `--peringatan-latar` | `#FBEFD5` | Kotak peringatan (disclaimer) | teks `--tinta` di atasnya 10,4:1 |

Kontras dihitung manual dengan rumus WCAG 2.x; **verifikasi ulang dengan alat kontras sebelum build final.** Teks putih di atas `--tinta` sekitar 12,7:1.

Aturan: tidak ada gradien. Tidak ada bayangan lembut. Warna selalu dipasangkan dengan teks atau tanda (ikon, simbol + / −), tidak boleh hanya warna.

### 4.2 Tipografi

Dua keluarga, keduanya Google Fonts, dengan fallback sistem.

| Peran | Font | Fallback | Dipakai untuk |
|---|---|---|---|
| Utama | **Schibsted Grotesk** (400, 500, 700, 800) | `system-ui, sans-serif` | Semua teks, judul, angka |
| Tulisan tangan | **Kalam** (400) | `"Segoe Print", cursive` | Hanya pesan doa donatur |

Angka: `font-variant-numeric: tabular-nums lining-nums;` di semua tempat yang menampilkan Rupiah.

Skala (mobile / desktop):

| Token | Ukuran | Berat | Line-height | Catatan |
|---|---|---|---|---|
| `judul-1` | 30 / 44 px | 800 | 1.1 | Judul campaign, hero landing. Tracking -0.02em |
| `judul-2` | 22 / 28 px | 700 | 1.2 | Judul section |
| `judul-3` | 17 / 18 px | 700 | 1.3 | Judul sub-bagian |
| `angka-besar` | 34 / 52 px | 800 | 1.05 | Saldo |
| `badan` | 16 / 17 px | 400 | 1.55 | Cerita, paragraf. Lebar maks 62 karakter |
| `kecil` | 14 px | 500 | 1.4 | Keterangan entri, label form |
| `mikro` | 12,5 px | 500 | 1.35 | Hash, tanggal pada baris sempit. Tidak di bawah 12,5 |
| `tangan` | 18 px | 400 | 1.45 | Pesan doa (Kalam) |

Judul memakai sentence case. Tidak ada ALL CAPS di mana pun.

### 4.3 Spasi, radius, garis

- Basis spasi 4 px. Skala: 4, 8, 12, 16, 24, 32, 48, 72.
- Radius: **input dan tombol 6 px; sheet 14 px di sudut atas; status pill penuh; tabel ledger 0 px.** Tidak ada radius seragam di semua elemen.
- Border input: 1,5 px `--garis-tegas`; fokus: 2 px `--tinta` + offset 2 px.
- Tidak ada bayangan, kecuali sheet donasi (satu bayangan tegas `0 -8px 0 0 rgba(30,42,120,.06)` hanya sebagai pembeda lapisan; bila terlihat dekoratif, hapus).

### 4.4 Gerak

Hanya tiga gerak, semuanya punya alasan:

1. **Hero landing, sekali saat dibuka:** satu baris ledger "ditulis" huruf demi huruf (±1,2 detik), lalu berhenti. Ini satu-satunya gerak yang tidak dipicu pengguna.
2. **Setelah donasi sukses (dipicu pengguna):** baris baru muncul paling atas dengan latar `--blok` yang memudar ke transparan dalam 1,2 detik, dan angka saldo berganti.
3. **Periksa keutuhan buku (dipicu pengguna):** penanda centang menyapu baris dari bawah ke atas, 60 ms per baris, lalu hasil `VALID`.

Semua gerak mati bila `prefers-reduced-motion: reduce` (ganti dengan perubahan instan). Tidak ada hover-lift, tidak ada entrance per section.

## 5. Layout

- **Mobile-first, lebar acuan 390 px.** Breakpoint tambahan 768 px dan 1120 px.
- Perataan: **rata kiri.** Tidak ada teks tengah kecuali status kosong. Konten desktop maksimal 1040 px, kolom teks 62 karakter.
- Halaman campaign desktop: kolom kiri (cerita + tabel) dan kolom kanan lengket (saldo + tombol donasi, lebar 320 px). Di mobile, tombol donasi menjadi bar bawah tetap setinggi 64 px dengan area aman (safe area inset).
- Buku kas di desktop: tabel enam kolom. Di mobile: **tetap berbentuk baris bergaris**, bukan kartu. Setiap baris dua tingkat (tanggal + keterangan di kiri, nominal di kanan).

## 6. Komponen

### 6.1 Wordmark
Teks "Kasbuka" Schibsted Grotesk 800, `--tinta`. Di sebelah kiri: tanda berupa persegi 22 px dengan dua garis horizontal dan satu garis vertikal margin yang terputus di tengah (buku terbuka). Garis tanda 2 px `--tinta`. Tidak ada tagline di header.

### 6.2 Persamaan saldo
Satu komponen, tiga angka dalam satu baris (mobile: tiga baris bertumpuk dengan operator di kiri, garis bawah ganda sebelum hasil, persis seperti hitungan di kertas).

```
  Masuk       Rp 19.105.050     (hijau, awalan +)
  Keluar    − Rp 11.150.000     (oranye bata, awalan −)
  ═══════════════════════════
  Saldo       Rp  7.955.050     (tinta, angka-besar)
```
Di bawahnya satu baris keterangan kecil: "Dihitung dari 11 entri. Masuk dihitung setelah biaya Midtrans."

### 6.3 Baris buku kas (komponen inti)

Desktop, kolom: `No` (60) | `Tanggal` (110) | `Keterangan` (fleksibel) | `Masuk` (130, rata kanan) | `Keluar` (130, rata kanan) | `Saldo` (140, rata kanan).

- Garis bawah tiap baris `--garis` 1 px. Garis margin vertikal ganda tipis (`--garis-tegas`) setelah kolom `No`.
- Baris `IN`: nominal di kolom Masuk, hijau, awalan "+". Baris `OUT`: kolom Keluar, oranye bata, awalan "−".
- Di bawah keterangan: status pill kecil (lihat 6.4) dan, bila ada, tautan "Lihat bukti".
- Pesan doa (hanya `IN` yang punya pesan): satu baris di bawah keterangan, font Kalam, tanpa tanda kutip dekoratif, diberi indent 16 px.
- Baris `REVERSAL`: teks keterangan "Membatalkan #8: salah nominal". Baris yang dibatalkan: nominal dicoret dan pill "Dibatalkan oleh #10".
- Hash: tampil sebagai 8 karakter pertama + "…" di `mikro`, disalin saat ditekan; tidak diberi hiasan.
- Baris diurutkan `seq` menurun (terbaru di atas). Nomor tetap `#` + angka.

Mobile: dua tingkat. Tingkat 1: `#11` + keterangan (maks 2 baris) di kiri, nominal di kanan. Tingkat 2: tanggal, pill sumber, "Lihat bukti". Saldo berjalan disembunyikan di mobile (tersedia di rincian saat baris ditekan).

### 6.4 Pill status
Penuh melengkung, tinggi 24 px, teks `kecil` 13 px, tanpa ikon dekoratif.

| Teks | Latar | Teks |
|---|---|---|
| Dibayar lewat Midtrans | `--blok` | `--tinta` |
| Dicatat pengurus | `--putih`, border `--garis-tegas` | `--tinta` |
| Dibatalkan oleh #10 | `--putih`, border `--keluar` | `--keluar` |
| Berizin | `--blok` | `--masuk` |
| Komunitas terbatas | `--blok` | `--tinta` |

### 6.5 Tombol
- Utama: latar `--tinta`, teks putih, tinggi 52 px (mobile) / 48 px (desktop), radius 6, berat 700. Teks kata kerja jelas ("Donasi sekarang", "Catat pengeluaran"). **Tanpa panah.**
- Sekunder: latar putih, border 1,5 px `--tinta`, teks `--tinta`.
- Teks (tertier): tautan `--tinta` bergaris bawah 1,5 px, offset 3 px.
- Fokus terlihat selalu: ring 2 px `--tinta` + offset 2 px. Target sentuh minimal 44 x 44 px.
- Status memuat: teks berubah ("Memproses…") dan tombol dinonaktifkan; tidak ada spinner dekoratif.

### 6.6 Form
- Label di atas input, `kecil` 14 px berat 500, tidak pernah placeholder-sebagai-label.
- Input tinggi 52 px, border 1,5 px, latar putih, radius 6.
- Input nominal: awalan "Rp" tetap di dalam kolom, angka diformat ribuan saat mengetik, `inputmode="numeric"`.
- Pilihan nominal cepat: Rp 25.000, 50.000, 100.000, 250.000, dan "Nominal lain". Bentuk: kotak 6 px radius, bukan pill. Satu terpilih = latar `--tinta` + teks putih + tanda centang kecil.
- Error: teks `--keluar` di bawah input, dimulai dengan apa yang salah, lalu cara memperbaikinya. Contoh: "Nominal minimal Rp 10.000. Naikkan sedikit lagi." Tidak ada permintaan maaf, tidak ada tanda seru.
- Pesan doa: area teks 3 baris, hitung karakter "34/200".

### 6.7 Sheet donasi
Mobile: bottom sheet naik dari bawah, tinggi maks 92 vh, handle 4 x 36 px. Desktop: modal 440 px di tengah dengan overlay `rgba(30,42,120,.35)`.
Isi satu sheet, tiga langkah dalam satu layar yang bergulir (bukan wizard bernomor): nominal → data diri → ringkasan + tombol bayar. Ringkasan menyebut biaya: "Biaya Midtrans Rp 700 dipotong dari donasi, tercatat di buku kas."

### 6.8 Panel keutuhan
Tombol sekunder "Periksa keutuhan buku". Hasil `VALID`: kotak `--blok` dengan teks "Rantai 11 entri utuh. Hash terakhir 7be41d09…" dan satu kalimat jujur: "Ini memastikan catatan tidak diubah setelah ditulis. Ini tidak membuktikan semua uang tercatat." Hasil rusak: kotak border `--keluar`, "Rantai putus di entri #7."

### 6.9 Kotak Dasar penggalangan
Di bawah judul campaign. Latar `--peringatan-latar`, border kiri 4 px `--tinta`. Isi contoh (BERIZIN): "Penggalangan berizin. Izin Bupati Jombang No. 188/412/415.35/2026, 12 Oktober 2026. Kasbuka mencatat, tidak memeriksa keabsahan izin." Untuk TERBATAS: "Penggalangan terbatas untuk warga Dusun Karangpoh. Tidak dibuka untuk umum." (nomor izin dan dusun di sini fiktif.)

### 6.10 Keadaan kosong dan error
- Buku kosong: "Buku kas masih kosong. Entri pertama muncul setelah ada uang masuk." (bukan ilustrasi lucu)
- Jaringan gagal: "Tidak bisa memuat buku kas. Periksa sinyal, lalu coba lagi." + tombol "Coba lagi".
- Donasi kedaluwarsa: "Pembayaran kedaluwarsa dan tidak ada uang yang dipotong. Buat donasi baru bila masih ingin lanjut."

## 7. Layar prototipe

Satu file `index.html`, empat layar dipindah lewat hash (`#/`, `#/c/atap-musala-al-ikhlas`, `#/dashboard`) dan satu sheet donasi. Bar kecil di atas halaman bertuliskan "Prototipe" dengan tautan ke tiga layar, dipisahkan dari desain asli (tidak ikut ke build).

### S1 Landing untuk pengurus (`#/`)
Tujuan: pengurus paham dalam 10 detik bahwa ini buku kas publik untuk komunitasnya.

```
[wordmark Kasbuka]                         [Masuk]  [Mulai buku kas]

Semua rupiah yang masuk dan
keluar, ditulis di depan umum.            ┌────────────────────────┐
                                          │ #12  27 Okt             │  <- baris ledger
Kasbuka membantu pengurus musala,         │ Dina K.        + 100.000│     ditulis perlahan
pesantren, dan komunitas menunjukkan      │ "Semoga atapnya segera  │     (gerak 1)
catatan dana lengkap dengan foto nota.    │  selesai, Pak."         │
                                          └────────────────────────┘
[Mulai buku kas]   Lihat contoh buku kas
```
- Judul `judul-1`, rata kiri, tanpa kata yang diberi aksen warna.
- Di bawah hero: **tiga langkah sebagai urutan sungguhan** (ini memang urutan): Buat campaign, Catat setiap uang masuk dan keluar, Bagikan link ke grup. Diberi nomor karena memang berurutan. Bukan grid ikon.
- Satu blok "Yang Kasbuka tidak lakukan": tidak menahan dana, tidak memeriksa izin, tidak menjamin pengurus jujur. Ditulis lugas.
- Footer: nama proyek, tautan GitHub, catatan "Proyek portofolio, belum dipakai untuk donasi sungguhan" selama masih sandbox.

### S2 Halaman publik campaign (`#/c/atap-musala-al-ikhlas`) , layar utama
```
[Kasbuka]                                   (header kecil, sticky)

Atap Musala Al-Ikhlas bocor,
warga Karangpoh renovasi bersama
[Berizin] [Diperbarui 26 Okt]

┌ Dasar penggalangan (kotak peringatan) ┐

Masuk        Rp 19.105.050
Keluar     − Rp 11.150.000
══════════════════════════
Saldo        Rp  7.955.050          Target Rp 85.000.000, 22% terkumpul
[tipis ──────────░░░░░░░░░░░░░░]

[Donasi sekarang]   [Bagikan ke WhatsApp]  [Periksa keutuhan buku]

Cerita  (3 paragraf, badan 16px)

Buku kas      (tabel/daftar, 11 entri, "Muat lebih banyak")
Penerima dana: Takmir Musala Al-Ikhlas, ketua Pak Hasan
```
Mobile: bar bawah tetap berisi tombol "Donasi sekarang" dan saldo kecil di kiri.

### S3 Sheet donasi
Alur: pilih nominal → isi nama (atau centang Anonim) → tulis doa (opsional) → ringkasan → tombol "Bayar Rp 100.000". Tombol memunculkan **layar simulasi Snap** (kotak putih dengan tiga metode: QRIS, GoPay, Transfer BCA) dan tombol "Simulasikan pembayaran berhasil". Setelah sukses: sheet menutup, baris #12 muncul di atas ledger (gerak 2), toast "Donasi Rp 100.000 tercatat sebagai entri #12."

### S4 Dasbor pengurus (`#/dashboard`)
```
Atap Musala Al-Ikhlas                      [Aktif]  [Tutup campaign]

Saldo Rp 7.955.050     Entri 11     Terakhir dicatat 27 Okt

[ Catat pengeluaran ] [ Catat pemasukan ]     (dua tab)

Tanggal      [27 Okt 2026]
Nominal      [Rp          ]
Keterangan   [               ]
Foto nota    [Pilih foto]  (pratinjau di bawahnya)
[Catat pengeluaran]        "Entri tidak bisa diubah. Salah catat? Batalkan lewat entri koreksi."

Riwayat entri (tabel sama seperti S2) + kolom Aksi: [Batalkan]
```
- "Batalkan" membuka dialog kecil: alasan wajib diisi, teks tegas: "Entri #8 tetap terlihat. Sistem menambah entri koreksi." Tombol "Buat entri koreksi".
- Tab pengeluaran dan pemasukan memakai garis bawah 3 px `--tinta`, bukan pill.

## 8. Data tiruan (gunakan persis, semua fiktif)

Campaign: **Atap Musala Al-Ikhlas bocor, warga Karangpoh renovasi bersama**. Slug `atap-musala-al-ikhlas`. Target Rp 85.000.000. Penerima: Takmir Musala Al-Ikhlas, Dusun Karangpoh, Jombang. Dasar penggalangan: Berizin (nomor fiktif di 6.9).

Cerita (tiga paragraf, tulis ulang dengan nada warga biasa, tanpa dramatisasi): atap asbes bocor sejak musim hujan tahun lalu; jamaah salat Jumat sekitar 120 orang; rencana anggaran Rp 85 juta untuk rangka baja ringan dan genteng metal, dengan rincian garis besar.

Buku kas (terbaru di atas). Saldo = Σ(masuk − fee) − Σ keluar.

| # | Tanggal | Tipe | Keterangan | Sumber | Masuk | Fee | Keluar | Saldo | Hash |
|---|---|---|---|---|---|---|---|---|---|
| 11 | 27 Okt | OUT | Upah tukang 5 orang x 3 hari (koreksi dari #8) | Dicatat pengurus | | | 4.800.000 | 7.955.050 | 7be41d09 |
| 10 | 27 Okt | REVERSAL | Membatalkan #8: nominal salah, seharusnya 4.800.000 | Dicatat pengurus | | | (+4.500.000 balik) | 12.755.050 | c40a99e2 |
| 9 | 26 Okt | IN | Kotak amal Jumat | Dicatat pengurus | 1.275.000 | 0 | | 8.255.050 | 1d73b5f8 |
| 8 | 26 Okt | OUT | Upah tukang 5 orang x 3 hari | Dicatat pengurus | | | 4.500.000 (dibatalkan oleh #10) | 6.980.050 | e9026ac1 |
| 7 | 25 Okt | IN | Rizal (Surabaya), doa: "Semoga cepat selesai, nitip salam buat warga." | Midtrans | 500.000 | 3.500 | | 11.480.050 | 5af8d3b7 |
| 6 | 25 Okt | OUT | Semen 40 sak dan pasir 2 rit, Toko Bangunan Makmur | Dicatat pengurus | | | 6.350.000 | 10.983.550 | a3f9120c |
| 5 | 24 Okt | IN | Keluarga Besar H. Mansur | Midtrans | 2.000.000 | 14.000 | | 17.333.550 | 82cd04be |
| 4 | 24 Okt | IN | Anonim | Midtrans | 250.000 | 1.750 | | 15.347.550 | 9b11e7a4 |
| 3 | 23 Okt | IN | Dina K., doa: "Semoga atapnya segera selesai, Pak." | Midtrans | 100.000 | 700 | | 15.099.300 | f6e2c8d0 |
| 2 | 22 Okt | IN | Bpk. Sholeh | Dicatat pengurus | 5.000.000 | 0 | | 15.000.000 | 3c5ab719 |
| 1 | 22 Okt | IN | Saldo awal dari kas takmir | Dicatat pengurus | 10.000.000 | 0 | | 10.000.000 | 04d8e6f2 |

Total masuk (setelah fee) Rp 19.105.050. Total keluar efektif Rp 11.150.000 (entri #6 dan #11; #8 dibatalkan). Saldo Rp 7.955.050. Setelah simulasi donasi Rp 100.000 (fee Rp 700), entri #12 masuk dan saldo menjadi Rp 8.054.350.

Hash di atas berupa 8 karakter tiruan; prototipe tidak perlu menghitung SHA-256 sungguhan, kecuali Gemini bisa menambahkannya dengan Web Crypto (opsional, nilai tambah).

## 9. Aturan tulisan di UI

- Bahasa Indonesia baku yang hangat. Sapaan "Anda" tidak dipakai berlebihan; kalimat aktif dan ringkas.
- Tombol memakai kata kerja yang menjelaskan hasil: "Donasi sekarang", "Catat pengeluaran", "Buat entri koreksi". Nama aksi sama di seluruh alur: tombol "Catat pengeluaran" menghasilkan toast "Pengeluaran tercatat."
- Sentence case. Tanpa tanda seru. Tanpa kata "revolusioner", "terpercaya 100%", "aman terjamin".
- Rupiah: "Rp 1.250.000" dengan spasi setelah Rp dan titik ribuan. Tanggal: "27 Okt 2026" di tabel, "27 Oktober 2026" di teks panjang.
- Error menyebut masalah dan jalan keluar, tanpa permintaan maaf.

## 10. Aksesibilitas (lantai kualitas)

- Teks badan minimal 16 px; tidak ada teks di bawah 12,5 px.
- Kontras teks minimal 4,5:1 (lihat tabel warna).
- Fokus keyboard selalu terlihat. Urutan tab mengikuti urutan baca. Sheet donasi memerangkap fokus dan menutup dengan Esc.
- Tabel memakai `<table>` semantik di desktop; di mobile baris memakai `<ol>` dengan `aria-label` yang memuat nominal dan tipe ("Uang masuk Rp 100.000").
- Tidak ada informasi hanya lewat warna: masuk/keluar juga diberi awalan + / −.
- Target sentuh ≥ 44 px. Bar bawah mobile menghormati `env(safe-area-inset-bottom)`.
- `prefers-reduced-motion` dihormati.
- `lang="id"`, `<meta name="viewport" content="width=device-width, initial-scale=1">`.

## 11. Prompt untuk Gemini

Tempel `Design.md` ini bersama prompt berikut:

> Buat prototipe HTML **satu file** (`index.html`) untuk produk yang dijelaskan di Design.md terlampir. Ikuti dokumen itu apa adanya, terutama bagian 2 (hal yang dihindari), 4 (token), 6 (komponen), dan 8 (data tiruan).
>
> Persyaratan teknis: HTML + CSS + JavaScript vanilla, tanpa framework dan tanpa library selain Google Fonts (Schibsted Grotesk dan Kalam). Semua warna, ukuran, dan spasi sebagai CSS custom properties di `:root` dengan nama persis seperti token di dokumen. Mobile-first, uji di 390 px dan 1280 px. Layar dipindah lewat hash. Data tiruan dari bagian 8 disimpan di satu array JavaScript; saldo dan total **dihitung dari array itu**, tidak ditulis manual di HTML.
>
> Interaksi yang harus berfungsi: sheet donasi (tiga langkah, simulasi Snap, entri #12 muncul dengan gerak 2), tombol Periksa keutuhan buku (gerak 3), form catat pengeluaran dengan pratinjau foto, dialog Batalkan yang menambah entri REVERSAL baru, tombol salin hash.
>
> Sebelum menulis kode, tulis rencana desain pendek (palet, tipografi, layout) dan periksa apakah ada bagian yang terasa seperti desain generik; revisi bagian itu dan sebutkan apa yang diubah. Setelah kode jadi, lakukan self-critique terhadap daftar di bagian 2 dan 12, lalu perbaiki pelanggaran.
>
> Jangan menambah fitur di luar dokumen. Jangan memakai emoji sebagai ikon. Jangan menulis Lorem ipsum.

## 12. Daftar periksa prototipe (centang dengan bukti, bukan perasaan)

- [ ] Tidak ada gradien, bayangan lembut, glassmorphism, atau blob (cari di CSS)
- [ ] Tidak ada ALL CAPS, eyebrow, "→", titik tengah pemisah, penanda 01/02/03 di konten non-urutan
- [ ] Teks utama berwarna `--tinta` (#1E2A78), bukan hitam
- [ ] Semua angka Rupiah tabular dan rata kanan; saldo dihitung dari array data
- [ ] Persamaan saldo muncul di S2 dan S4 dengan garis ganda sebelum hasil
- [ ] Font Kalam hanya muncul di pesan doa
- [ ] Hanya tiga gerak (bagian 4.4), dan mati saat reduced motion
- [ ] Layar 390 px: tidak ada scroll horizontal, bar bawah tidak menutupi konten
- [ ] Fokus keyboard terlihat di semua kontrol; Esc menutup sheet
- [ ] Tidak ada fitur di luar bagian 7 (tidak ada login sungguhan, tidak ada profil donatur)
- [ ] Screenshot S1, S2 (mobile dan desktop), S3, S4 disimpan untuk gate fase 0

## 13. Jalur ke build

Setelah prototipe dipilih dan dibekukan: (1) ekstrak token CSS ke `tokens.css` tanpa mengubah nama, (2) pecah komponen 6.x menjadi komponen React dengan nama sama, (3) hubungkan ke data sungguhan sesuai PRD. Jangan mendesain ulang di Antigravity; perubahan visual dilakukan di dokumen ini dulu.
