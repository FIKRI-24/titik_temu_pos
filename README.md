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
  Jest secara otomatis membuat database sementara `titik_temu_pos_test`, menjalankan migrasi + seeder, mengeksekusi seluruh suite pengujian, lalu menghapus `titik_temu_pos_test` kembali sehingga database pengembangan (`titik_temu_pos`) tidak terpengaruh.
- **Uji End-to-End Terisolasi (Headless Chrome via `puppeteer-core`)**:
  Menjalankan skrip E2E terhadap database uji terisolasi `titik_temu_pos_test` dan server uji terpisah (port `3005` & `5175`):
  ```bash
  cd server
  node tests/e2e/run_e2e.mjs tests/e2e/verify_fase1.mjs tests/e2e/verify_fase2.mjs tests/e2e/verify_fase3.mjs
  ```
  *(Variabel opsional: `CHROME_PATH` jika lokasi Chrome berbeda.)*

## Akun Uji
| Role | Username | Password |
| :--- | :--- | :--- |
| **Admin** | `admin` | `Admin#2026` |
| **Kasir** | `kasir1` | `Kasir#2026` |

## Asumsi Bisnis & Keamanan
- Zona waktu operasional menggunakan `Asia/Jakarta` untuk perhitungan "hari ini" dan penomoran faktur (`INV-POS-YYYYMMDD-XXXX`).
- Semua nominal uang disimpan sebagai integer rupiah (`INTEGER`) tanpa floating point.
- Pajak PB1 sebesar 10% dihitung dari `(subtotal - diskon)`, dibulatkan ke rupiah terdekat.
- Omset dan jumlah pesanan hari ini menghitung pesanan berstatus `diproses` dan `selesai` (tidak termasuk `dibatalkan`).
- **Menu terlaris hari ini**: dihitung berdasarkan total kuantitas terjual terbanyak pada hari berjalan (zona `Asia/Jakarta`). Jika terdapat dua atau lebih menu dengan total kuantitas sama (seri), pemenang ditentukan secara alfabetis berdasarkan nama produk (`ORDER BY total_qty DESC, nama_produk ASC`).
- **Distribusi penjualan kategori (dashboard)**: menghitung subtotal baris item (`order_details.subtotal_baris`) dari pesanan non-batal pada periode 7 hari terakhir agar mencerminkan kontribusi per kategori.
- Rate limit login: maksimal **10 percobaan gagal per 15 menit per IP** (`skipSuccessfulRequests: true`), sehingga login yang berhasil tidak menghabiskan kuota batas percobaan.
- Panjang password minimal **8 karakter** untuk pembuatan akun baru dan reset password.
- Cookie JWT memakai `httpOnly: true`, `sameSite: 'lax'`, serta otomatis `secure: true` saat `NODE_ENV=production`. Origin CORS dibaca dari variabel environment `CLIENT_ORIGIN`.
