-- Seed data for Titik Temu Kopi POS System
-- Password untuk admin: Admin#2026
-- Password untuk kasir1: Kasir#2026
-- Hash bcrypt dibuat dengan cost 10

TRUNCATE stock_adjustments, order_details, orders, order_counters, products, vouchers, categories, users RESTART IDENTITY CASCADE;

-- ============================================================
-- USERS
-- ============================================================
INSERT INTO users (username, password_hash, nama_lengkap, role, status) VALUES
('admin', '$2b$10$qVPXUda55w2Krh017znKsukS6Pt/D3sQdneIdd4m1Myfv3yoIg2dq', 'Admin Titik Temu', 'admin', 'aktif'),
('kasir1', '$2b$10$9aXkAvZgPO8R9crT7kwQvO4RjbdASJ8lYL.vHVYzSPhU.f3TeQhSG', 'Budi Santoso', 'kasir', 'aktif');

-- ============================================================
-- CATEGORIES
-- ============================================================
INSERT INTO categories (nama_kategori, slug, status) VALUES
('Coffee', 'coffee', 'aktif'),
('Non-Coffee', 'non-coffee', 'aktif'),
('Food', 'food', 'aktif'),
('Pastry', 'pastry', 'aktif');

-- ============================================================
-- PRODUCTS (16 menu, 2 mendekati batas stok minimum)
-- ============================================================
INSERT INTO products (category_id, kode_produk, nama_produk, harga_jual, harga_pokok, stok, stok_minimum, unit, status) VALUES
(1, 'COF-001', 'Espresso Single', 20000, 8000, 50, 10, 'cup', 'aktif'),
(1, 'COF-002', 'Americano', 25000, 9000, 45, 10, 'cup', 'aktif'),
(1, 'COF-003', 'Cappuccino', 32000, 12000, 40, 10, 'cup', 'aktif'),
(1, 'COF-004', 'Es Kopi Susu', 28000, 10000, 60, 10, 'cup', 'aktif'),
(1, 'COF-005', 'Latte', 35000, 13000, 7, 10, 'cup', 'aktif'),
(2, 'NCF-001', 'Matcha Latte', 35000, 14000, 35, 10, 'cup', 'aktif'),
(2, 'NCF-002', 'Cokelat Panas', 28000, 10000, 30, 10, 'cup', 'aktif'),
(2, 'NCF-003', 'Teh Tarik', 20000, 7000, 40, 10, 'cup', 'aktif'),
(2, 'NCF-004', 'Lemon Tea', 22000, 7000, 25, 10, 'cup', 'aktif'),
(2, 'NCF-005', 'Jus Alpukat', 30000, 11000, 6, 10, 'cup', 'aktif'),
(3, 'FOD-001', 'Nasi Goreng Kafe', 45000, 18000, 30, 5, 'porsi', 'aktif'),
(3, 'FOD-002', 'Sandwich Ayam', 38000, 15000, 25, 5, 'pcs', 'aktif'),
(3, 'FOD-003', 'Salad Buah', 32000, 12000, 20, 5, 'bowl', 'aktif'),
(4, 'PAS-001', 'Croissant Butter', 28000, 10000, 20, 5, 'pcs', 'aktif'),
(4, 'PAS-002', 'Banana Bread', 30000, 11000, 18, 5, 'slice', 'aktif'),
(4, 'PAS-003', 'Cheesecake Slice', 42000, 16000, 15, 5, 'slice', 'aktif');

-- ============================================================
-- VOUCHERS
-- ============================================================
INSERT INTO vouchers (kode, tipe, nilai, aktif) VALUES
('HEMAT10', 'persen', 10, TRUE),
('KOPI5000', 'nominal', 5000, TRUE);

-- ============================================================
-- HISTORICAL ORDERS (25 pesanan 7 hari terakhir, zona waktu Asia/Jakarta)
-- ============================================================
INSERT INTO orders (invoice_number, user_id, tipe_pesanan, nomor_meja, nama_pemesan, total_subtotal, diskon_nominal, voucher_kode, pajak_nominal, grand_total, metode_bayar, uang_dibayar, uang_kembali, status, created_at) VALUES
-- Hari -7 (3 pesanan)
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 7, 'YYYYMMDD') || '-0001', 2, 'dine_in', 3, 'Hendra', 92000, 0, NULL, 9200, 101200, 'tunai', 110000, 8800, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 7) + TIME '08:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 7, 'YYYYMMDD') || '-0002', 2, 'takeaway', NULL, 'Sinta', 56000, 0, NULL, 5600, 61600, 'qris', 61600, 0, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 7) + TIME '10:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 7, 'YYYYMMDD') || '-0003', 1, 'dine_in', 5, 'Joko', 70000, 5000, 'KOPI5000', 6500, 71500, 'tunai', 80000, 8500, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 7) + TIME '14:00:00') AT TIME ZONE 'Asia/Jakarta'),
-- Hari -6 (3 pesanan)
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 6, 'YYYYMMDD') || '-0001', 2, 'dine_in', 1, 'Devi', 110000, 11000, 'HEMAT10', 9900, 108900, 'debit', 108900, 0, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 6) + TIME '09:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 6, 'YYYYMMDD') || '-0002', 2, 'takeaway', NULL, 'Rino', 63000, 0, NULL, 6300, 69300, 'tunai', 70000, 700, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 6) + TIME '11:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 6, 'YYYYMMDD') || '-0003', 1, 'dine_in', 7, 'Nita', 84000, 0, NULL, 8400, 92400, 'qris', 92400, 0, 'dibatalkan', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 6) + TIME '15:00:00') AT TIME ZONE 'Asia/Jakarta'),
-- Hari -5 (4 pesanan)
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 5, 'YYYYMMDD') || '-0001', 2, 'dine_in', 2, 'Ari', 56000, 0, NULL, 5600, 61600, 'tunai', 65000, 3400, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 5) + TIME '08:30:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 5, 'YYYYMMDD') || '-0002', 2, 'takeaway', NULL, 'Bela', 70000, 0, NULL, 7000, 77000, 'transfer', 77000, 0, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 5) + TIME '10:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 5, 'YYYYMMDD') || '-0003', 1, 'dine_in', 4, 'Candra', 93000, 0, NULL, 9300, 102300, 'tunai', 110000, 7700, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 5) + TIME '13:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 5, 'YYYYMMDD') || '-0004', 2, 'dine_in', 6, 'Dina', 45000, 0, NULL, 4500, 49500, 'qris', 49500, 0, 'diproses', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 5) + TIME '16:00:00') AT TIME ZONE 'Asia/Jakarta'),
-- Hari -4 (3 pesanan)
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 4, 'YYYYMMDD') || '-0001', 2, 'takeaway', NULL, 'Eka', 60000, 6000, 'HEMAT10', 5400, 59400, 'tunai', 60000, 600, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 4) + TIME '09:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 4, 'YYYYMMDD') || '-0002', 1, 'dine_in', 8, 'Farid', 105000, 0, NULL, 10500, 115500, 'debit', 115500, 0, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 4) + TIME '12:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 4, 'YYYYMMDD') || '-0003', 2, 'dine_in', 3, 'Gita', 77000, 5000, 'KOPI5000', 7200, 79200, 'tunai', 80000, 800, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 4) + TIME '15:00:00') AT TIME ZONE 'Asia/Jakarta'),
-- Hari -3 (4 pesanan)
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 3, 'YYYYMMDD') || '-0001', 2, 'dine_in', 10, 'Hana', 56000, 0, NULL, 5600, 61600, 'qris', 61600, 0, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 3) + TIME '08:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 3, 'YYYYMMDD') || '-0002', 2, 'takeaway', NULL, 'Ivan', 42000, 0, NULL, 4200, 46200, 'tunai', 50000, 3800, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 3) + TIME '10:30:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 3, 'YYYYMMDD') || '-0003', 1, 'dine_in', 2, 'Jeni', 125000, 12500, 'HEMAT10', 11250, 123750, 'transfer', 123750, 0, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 3) + TIME '13:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 3, 'YYYYMMDD') || '-0004', 2, 'dine_in', 9, 'Kiki', 67000, 0, NULL, 6700, 73700, 'tunai', 80000, 6300, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 3) + TIME '16:00:00') AT TIME ZONE 'Asia/Jakarta'),
-- Hari -2 (4 pesanan)
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 2, 'YYYYMMDD') || '-0001', 2, 'dine_in', 5, 'Lia', 88000, 0, NULL, 8800, 96800, 'tunai', 100000, 3200, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 2) + TIME '09:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 2, 'YYYYMMDD') || '-0002', 1, 'takeaway', NULL, 'Mario', 35000, 0, NULL, 3500, 38500, 'qris', 38500, 0, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 2) + TIME '11:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 2, 'YYYYMMDD') || '-0003', 2, 'dine_in', 12, 'Nina', 95000, 0, NULL, 9500, 104500, 'debit', 104500, 0, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 2) + TIME '14:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 2, 'YYYYMMDD') || '-0004', 2, 'dine_in', 4, 'Ogi', 50000, 5000, 'KOPI5000', 4500, 49500, 'tunai', 50000, 500, 'dibatalkan', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 2) + TIME '16:00:00') AT TIME ZONE 'Asia/Jakarta'),
-- Hari -1 (4 pesanan)
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 1, 'YYYYMMDD') || '-0001', 2, 'dine_in', 1, 'Putri', 112000, 11200, 'HEMAT10', 10080, 110880, 'tunai', 120000, 9120, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 1) + TIME '08:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 1, 'YYYYMMDD') || '-0002', 2, 'takeaway', NULL, 'Reza', 63000, 0, NULL, 6300, 69300, 'qris', 69300, 0, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 1) + TIME '10:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 1, 'YYYYMMDD') || '-0003', 1, 'dine_in', 6, 'Sari', 78000, 0, NULL, 7800, 85800, 'transfer', 85800, 0, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 1) + TIME '13:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 1, 'YYYYMMDD') || '-0004', 2, 'dine_in', 11, 'Tono', 45000, 0, NULL, 4500, 49500, 'tunai', 50000, 500, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 1) + TIME '17:00:00') AT TIME ZONE 'Asia/Jakarta'),
-- Hari ini (4 pesanan, zona waktu Asia/Jakarta)
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date, 'YYYYMMDD') || '-0001', 2, 'dine_in', 2, 'Lina', 56000, 0, NULL, 5600, 61600, 'tunai', 70000, 8400, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date) + TIME '01:15:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date, 'YYYYMMDD') || '-0002', 2, 'takeaway', NULL, 'Bagus', 70000, 5000, 'KOPI5000', 6500, 71500, 'qris', 71500, 0, 'selesai', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date) + TIME '02:30:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date, 'YYYYMMDD') || '-0003', 1, 'dine_in', 5, 'Citra', 106000, 10600, 'HEMAT10', 9540, 104940, 'transfer', 104940, 0, 'diproses', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date) + TIME '04:00:00') AT TIME ZONE 'Asia/Jakarta'),
('INV-POS-' || TO_CHAR((NOW() AT TIME ZONE 'Asia/Jakarta')::date, 'YYYYMMDD') || '-0004', 2, 'dine_in', 8, 'Dimas', 91000, 0, NULL, 9100, 100100, 'debit', 100100, 0, 'diproses', (((NOW() AT TIME ZONE 'Asia/Jakarta')::date) + TIME '06:45:00') AT TIME ZONE 'Asia/Jakarta');

-- ============================================================
-- ORDER DETAILS (snapshot harga historis, jumlah tepat sama dengan total_subtotal)
-- ============================================================
INSERT INTO order_details (order_id, product_id, harga_satuan, harga_pokok_satuan, kuantiti, subtotal_baris) VALUES
-- Order 1: 92000
(1, 2, 25000, 9000, 2, 50000),
(1, 8, 20000, 7000, 1, 20000),
(1, 9, 22000, 7000, 1, 22000),
-- Order 2: 56000
(2, 4, 28000, 10000, 1, 28000),
(2, 14, 28000, 10000, 1, 28000),
-- Order 3: 70000
(3, 4, 28000, 10000, 1, 28000),
(3, 9, 22000, 7000, 1, 22000),
(3, 1, 20000, 8000, 1, 20000),
-- Order 4: 110000
(4, 11, 45000, 18000, 2, 90000),
(4, 1, 20000, 8000, 1, 20000),
-- Order 5: 63000
(5, 6, 35000, 14000, 1, 35000),
(5, 7, 28000, 10000, 1, 28000),
-- Order 6: 84000
(6, 4, 28000, 10000, 2, 56000),
(6, 7, 28000, 10000, 1, 28000),
-- Order 7: 56000
(7, 4, 28000, 10000, 1, 28000),
(7, 14, 28000, 10000, 1, 28000),
-- Order 8: 70000
(8, 2, 25000, 9000, 2, 50000),
(8, 8, 20000, 7000, 1, 20000),
-- Order 9: 93000
(9, 5, 35000, 13000, 1, 35000),
(9, 12, 38000, 15000, 1, 38000),
(9, 1, 20000, 8000, 1, 20000),
-- Order 10: 45000
(10, 11, 45000, 18000, 1, 45000),
-- Order 11: 60000
(11, 3, 32000, 12000, 1, 32000),
(11, 7, 28000, 10000, 1, 28000),
-- Order 12: 105000
(12, 5, 35000, 13000, 1, 35000),
(12, 12, 38000, 15000, 1, 38000),
(12, 3, 32000, 12000, 1, 32000),
-- Order 13: 77000
(13, 11, 45000, 18000, 1, 45000),
(13, 3, 32000, 12000, 1, 32000),
-- Order 14: 56000
(14, 4, 28000, 10000, 1, 28000),
(14, 7, 28000, 10000, 1, 28000),
-- Order 15: 42000
(15, 16, 42000, 16000, 1, 42000),
-- Order 16: 125000
(16, 5, 35000, 13000, 1, 35000),
(16, 11, 45000, 18000, 2, 90000),
-- Order 17: 67000
(17, 3, 32000, 12000, 1, 32000),
(17, 6, 35000, 14000, 1, 35000),
-- Order 18: 88000
(18, 4, 28000, 10000, 2, 56000),
(18, 3, 32000, 12000, 1, 32000),
-- Order 19: 35000
(19, 5, 35000, 13000, 1, 35000),
-- Order 20: 95000
(20, 6, 35000, 14000, 1, 35000),
(20, 3, 32000, 12000, 1, 32000),
(20, 7, 28000, 10000, 1, 28000),
-- Order 21: 50000
(21, 2, 25000, 9000, 2, 50000),
-- Order 22: 112000
(22, 11, 45000, 18000, 1, 45000),
(22, 5, 35000, 13000, 1, 35000),
(22, 3, 32000, 12000, 1, 32000),
-- Order 23: 63000
(23, 6, 35000, 14000, 1, 35000),
(23, 7, 28000, 10000, 1, 28000),
-- Order 24: 78000
(24, 12, 38000, 15000, 1, 38000),
(24, 1, 20000, 8000, 2, 40000),
-- Order 25: 45000
(25, 11, 45000, 18000, 1, 45000),
-- Order 26 (Hari ini): 56000
(26, 4, 28000, 10000, 1, 28000),
(26, 14, 28000, 10000, 1, 28000),
-- Order 27 (Hari ini): 70000
(27, 11, 45000, 18000, 1, 45000),
(27, 2, 25000, 9000, 1, 25000),
-- Order 28 (Hari ini): 106000
(28, 3, 32000, 12000, 2, 64000),
(28, 16, 42000, 16000, 1, 42000),
-- Order 29 (Hari ini): 91000
(29, 4, 28000, 10000, 2, 56000),
(29, 6, 35000, 14000, 1, 35000);

-- ============================================================
-- ORDER COUNTERS
-- ============================================================
INSERT INTO order_counters (tanggal, nomor_terakhir) VALUES
((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 7, 3),
((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 6, 3),
((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 5, 4),
((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 4, 3),
((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 3, 4),
((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 2, 4),
((NOW() AT TIME ZONE 'Asia/Jakarta')::date - 1, 4),
((NOW() AT TIME ZONE 'Asia/Jakarta')::date, 4)
ON CONFLICT (tanggal) DO UPDATE SET nomor_terakhir = EXCLUDED.nomor_terakhir;
