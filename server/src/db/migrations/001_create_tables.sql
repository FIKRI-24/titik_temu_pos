-- Migration 001: Create all tables for Titik Temu Kopi POS System
-- Run order: this file first, then seed.sql

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nama_lengkap VARCHAR(100) NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('admin', 'kasir')),
  status VARCHAR(10) NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'nonaktif')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  nama_kategori VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'nonaktif'))
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  kode_produk VARCHAR(50) UNIQUE NOT NULL,
  nama_produk VARCHAR(150) NOT NULL,
  harga_jual INTEGER NOT NULL CHECK (harga_jual >= 0),
  harga_pokok INTEGER NOT NULL CHECK (harga_pokok >= 0),
  stok INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
  stok_minimum INTEGER NOT NULL DEFAULT 5 CHECK (stok_minimum >= 0),
  unit VARCHAR(30) NOT NULL DEFAULT 'pcs',
  status VARCHAR(10) NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'nonaktif')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(30) UNIQUE NOT NULL,
  idempotency_key VARCHAR(100) UNIQUE,
  request_hash VARCHAR(64),
  user_id INTEGER NOT NULL REFERENCES users(id),
  tipe_pesanan VARCHAR(10) NOT NULL CHECK (tipe_pesanan IN ('dine_in', 'takeaway')),
  nomor_meja INTEGER CHECK (
    (tipe_pesanan = 'dine_in' AND nomor_meja IS NOT NULL AND nomor_meja BETWEEN 1 AND 20)
    OR (tipe_pesanan = 'takeaway' AND nomor_meja IS NULL)
  ),
  nama_pemesan VARCHAR(60),
  total_subtotal INTEGER NOT NULL CHECK (total_subtotal >= 0),
  diskon_nominal INTEGER NOT NULL DEFAULT 0 CHECK (diskon_nominal >= 0),
  voucher_kode VARCHAR(50),
  pajak_nominal INTEGER NOT NULL DEFAULT 0 CHECK (pajak_nominal >= 0),
  grand_total INTEGER NOT NULL CHECK (grand_total >= 0),
  metode_bayar VARCHAR(10) NOT NULL CHECK (metode_bayar IN ('tunai', 'qris', 'transfer', 'debit')),
  uang_dibayar INTEGER NOT NULL CHECK (uang_dibayar >= grand_total AND uang_dibayar <= 100000000),
  uang_kembali INTEGER NOT NULL DEFAULT 0 CHECK (uang_kembali >= 0),
  status VARCHAR(15) NOT NULL DEFAULT 'diproses' CHECK (status IN ('diproses', 'selesai', 'dibatalkan')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order details table
CREATE TABLE IF NOT EXISTS order_details (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  harga_satuan INTEGER NOT NULL CHECK (harga_satuan >= 0),
  harga_pokok_satuan INTEGER NOT NULL CHECK (harga_pokok_satuan >= 0),
  kuantiti INTEGER NOT NULL CHECK (kuantiti > 0 AND kuantiti <= 99),
  subtotal_baris INTEGER NOT NULL CHECK (subtotal_baris >= 0),
  catatan_khusus VARCHAR(120)
);

-- Enforce max 30 line items per order at database level
CREATE OR REPLACE FUNCTION check_max_order_details()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM order_details WHERE order_id = NEW.order_id) >= 30 THEN
    RAISE EXCEPTION 'Maksimal 30 baris item per pesanan.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_max_order_details ON order_details;
CREATE TRIGGER trg_max_order_details
  BEFORE INSERT ON order_details
  FOR EACH ROW
  EXECUTE FUNCTION check_max_order_details();

-- Order counters for invoice numbering (per-day sequential)
CREATE TABLE IF NOT EXISTS order_counters (
  tanggal DATE PRIMARY KEY,
  nomor_terakhir INTEGER NOT NULL DEFAULT 0
);

-- Vouchers table
CREATE TABLE IF NOT EXISTS vouchers (
  kode VARCHAR(50) PRIMARY KEY,
  tipe VARCHAR(10) NOT NULL CHECK (tipe IN ('persen', 'nominal')),
  nilai INTEGER NOT NULL CHECK (nilai > 0),
  aktif BOOLEAN NOT NULL DEFAULT TRUE
);

-- Stock adjustments audit log
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  mode VARCHAR(10) NOT NULL CHECK (mode IN ('set', 'selisih')),
  nilai_input INTEGER NOT NULL,
  stok_sebelum INTEGER NOT NULL CHECK (stok_sebelum >= 0),
  stok_sesudah INTEGER NOT NULL CHECK (stok_sesudah >= 0),
  selisih INTEGER NOT NULL,
  catatan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_created_status_method ON orders(created_at DESC, status, metode_bayar);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_details_order_id ON order_details(order_id);
CREATE INDEX IF NOT EXISTS idx_order_details_product_order ON order_details(product_id, order_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product_id ON stock_adjustments(product_id);
