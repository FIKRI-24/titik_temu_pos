# Sistem Kasir & Pemesanan Kafe Modern — Titik Temu Kopi (`MED-WEB-01`)

Aplikasi web Point of Sales (POS) untuk layanan **Dine-In** dan **Takeaway** kafe *Titik Temu Kopi*, dibangun dengan Node.js 20, Express, PostgreSQL (`pg`), dan React + Vite.

## Tech Stack
- **Backend**: Node.js 20, Express, PostgreSQL (`pg` SQL manual), `zod`, `bcrypt`, `jsonwebtoken` (`httpOnly` cookie), `helmet`, `express-rate-limit`, `pdfkit`
- **Frontend**: React 18 + Vite, React Router, TanStack Query, Recharts, CSS Variables design tokens

## Prasyarat
- Node.js 20 LTS & npm
- PostgreSQL 14+ (berjalan di lokal, default port `5432`)
- Google Chrome (opsional, hanya untuk menjalankan uji E2E browser)

## Cara Setup & Impor `database.sql` ke Database Kosong (Windows & Linux/macOS)

Anda bisa menginisialisasi database dengan **salah satu** dari dua cara berikut:

### Opsi A — Menggunakan Skrip Otomatis (`npm run db:setup`)
1. Masuk ke folder `server/`, salin `.env.example` menjadi `.env`, lalu isi `DB_PASSWORD`, `JWT_SECRET`, dan `CLIENT_ORIGIN` (default `http://localhost:5173`).
2. Jalankan:
   ```bash
   cd server
   npm install
   npm run db:setup
   ```

### Opsi B — Impor Manual `database.sql` Menggunakan `psql`

#### Windows (PowerShell)
```powershell
# 1. Buat database kosong baru
$env:PGPASSWORD = "password_postgres_anda"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d postgres -c "CREATE DATABASE titik_temu_pos ENCODING 'UTF8';"

# 2. Impor skema dan data awal dari database.sql
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d titik_temu_pos -v ON_ERROR_STOP=1 -f ".\database.sql"
```
*(Sesuaikan versi PostgreSQL pada path `C:\Program Files\PostgreSQL\<versi>\bin\psql.exe` jika berbeda, atau gunakan `psql` langsung bila sudah ada di `PATH`.)*

#### Linux / macOS (Bash / Zsh)
```bash
# 1. Buat database kosong baru
PGPASSWORD="password_postgres_anda" psql -U postgres -d postgres -c "CREATE DATABASE titik_temu_pos ENCODING 'UTF8';"

# 2. Impor skema dan data awal dari database.sql
PGPASSWORD="password_postgres_anda" psql -U postgres -d titik_temu_pos -v ON_ERROR_STOP=1 -f "./database.sql"
```

## Menjalankan Aplikasi
1. **Backend**:
   ```bash
   cd server
   npm run dev
   ```
   Server berjalan di `http://localhost:3001`.
2. **Frontend**:
   ```bash
   cd client
   npm install
   npm run dev
   ```
   Aplikasi dapat diakses di `http://localhost:5173`.

## Menjalankan Pengujian
- **Unit & Integration test (Jest)**:
  ```bash
  cd server
  npm test
  ```
  Jest berjalan secara sekuensial (`--runInBand`) pada database sementara `titik_temu_pos_test` yang dibuat, di-seed, dan dihapus otomatis setelah selesai sehingga database pengembangan (`titik_temu_pos`) tetap bersih.
- **Uji End-to-End Terisolasi (Paket terpisah `server/tests/e2e`)**:
  `puppeteer-core` dipisahkan ke `server/tests/e2e/package.json` agar `npm install` di `server/` tidak mengunduh dependensi browser. Untuk instalasi biasa tanpa mengunduh Chromium, gunakan `PUPPETEER_SKIP_DOWNLOAD=1`:
  ```bash
  # Instalasi awal paket E2E (gunakan PUPPETEER_SKIP_DOWNLOAD=1)
  cd server/tests/e2e
  PUPPETEER_SKIP_DOWNLOAD=1 npm install

  # Jalankan dari folder server/ terhadap database uji terisolasi titik_temu_pos_test
  cd ../..
  node tests/e2e/run_e2e.mjs tests/e2e/verify_fase1.mjs tests/e2e/verify_fase2.mjs tests/e2e/verify_fase3.mjs tests/e2e/verify_fase4.mjs tests/e2e/verify_fase5.mjs
  ```
  *(Variabel opsional: `CHROME_PATH` jika lokasi Chrome berbeda.)*

## Akun Uji
| Role | Username | Password |
| :--- | :--- | :--- |
| **Admin** | `admin` | `Admin#2026` |
| **Kasir** | `kasir1` | `Kasir#2026` |

## Definisi KPI Dashboard & Aturan Bisnis
- Zona waktu operasional menggunakan `Asia/Jakarta` untuk batas hari ("hari ini") dan penomoran faktur (`INV-POS-YYYYMMDD-XXXX`).
- Semua nominal uang disimpan sebagai integer rupiah (`INTEGER`) tanpa floating point.
- Pajak PB1 sebesar 10% dihitung dari `(subtotal - diskon)`, dibulatkan ke rupiah terdekat (`Math.round`).
- **Definisi KPI Dashboard**:
  - `total_omset` (ditampilkan sebagai **"Total diterima hari ini"** & **"Tren total diterima 7 hari terakhir"**) & `jumlah_pesanan`: menghitung seluruh pesanan berstatus `diproses` dan `selesai` pada tanggal hari ini (`Asia/Jakarta`), mengecualikan `dibatalkan`, berdasarkan `grand_total` (total yang diterima).
  - `menu_terlaris`: dihitung berdasarkan total kuantitas terjual terbanyak hari ini (`SUM(kuantiti)`). Aturan seri (jika qty sama): dipilih secara alfabetis (`ORDER BY total_qty DESC, nama_produk ASC`).
  - `stok_rendah`: daftar menu `aktif` dengan `stok <= stok_minimum`.
  - `tren 7 hari`: memakai `generate_series` pada zona `Asia/Jakarta` dari 6 hari lalu hingga hari ini (hari tanpa transaksi tetap muncul bernilai `0`).
  - **Distribusi penjualan kategori (dashboard)**: menghitung `SUM(order_details.subtotal_baris)` dari pesanan non-batal pada periode 7 hari terakhir.

## Definisi laporan
Semua perhitungan laporan hanya mencakup transaksi yang lolos filter dengan status **non-batal** (`status IN ('diproses', 'selesai')`). Batas tanggal `dari`–`sampai` bersifat inklusif berdasarkan tanggal kalender zona `Asia/Jakarta` (implementasi interval setengah terbuka `[start_ts, end_ts)` terhadap indeks `created_at`).

| Metrik Laporan | Definisi & Rumus | Catatan |
| :--- | :--- | :--- |
| **Omset bruto** | `SUM(orders.total_subtotal)` | Total penjualan sebelum diskon & pajak PB1 |
| **Total diskon** | `SUM(orders.diskon_nominal)` | Akumulasi nominal potongan voucher |
| **Omset bersih** | `Omset bruto - Total diskon` | Dasar pengenaan pajak (DPP) |
| **Total pajak PB1** | `SUM(orders.pajak_nominal)` | Ditampilkan terpisah, bukan bagian omset bersih |
| **Total diterima** | `Omset bersih + Total pajak PB1` (`SUM(orders.grand_total)`) | Sama persis dengan metrik **"Total diterima hari ini"** di Dashboard |
| **Rata-rata nilai transaksi** | `Total diterima / Jumlah pesanan non-batal` | Bernilai `0` jika jumlah pesanan non-batal = 0 (basis perhitungan dicantumkan di UI) |
| **Laba kotor** | `Omset bersih - SUM(order_details.harga_pokok_satuan * order_details.kuantiti)` | Memakai snapshot HPP saat transaksi (`order_details.harga_pokok_satuan`) |
| **Pesanan dibatalkan** | Tidak masuk ke metrik ringkasan mana pun | Tetap dapat tampil pada tabel/ekspor bila filter status mengizinkan (`all` / `dibatalkan`), diberi penanda **Dibatalkan** |
| **Filter kategori (`EXISTS`)** | Menyaring pesanan yang memuat minimal 1 item kategori terpilih | Total ringkasan tetap per pesanan utuh tanpa penggandaan baris; grafik kategori dihitung dari `SUM(order_details.subtotal_baris)` pada baris detail |

### Rekonsiliasi Dashboard & Laporan
Dashboard menjumlahkan `orders.grand_total` dan kini berlabel **"Total diterima hari ini"** agar konsisten dengan definisi laporan. Untuk rentang tanggal hari ini (`dateFrom = dateTo = hari ini WIB`) tanpa filter kategori/metode pembayaran, nilai **Total diterima** dan **Jumlah pesanan** pada laporan Admin **selalu identik** dengan **Total diterima hari ini** pada Dashboard Admin.
- Rate limit login: maksimal **10 percobaan gagal per 15 menit per IP** (`skipSuccessfulRequests: true`).
- Panjang password minimal **8 karakter** untuk pembuatan akun baru dan reset password.
- Cookie JWT memakai `httpOnly: true`, `sameSite: 'lax'`, serta otomatis `secure: true` saat `NODE_ENV=production`. Origin CORS dibaca dari `CLIENT_ORIGIN`.
