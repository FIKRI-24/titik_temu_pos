// src/modules/categories/categories.service.js
import { pool } from '../../config/db.js';

export function generateSlug(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function getAllCategories(includeInactive = false) {
  const whereClause = includeInactive ? '' : `WHERE c.status = 'aktif'`;
  const result = await pool.query(
    `SELECT c.id, c.nama_kategori, c.slug, c.status,
            COUNT(p.id) FILTER (WHERE p.status = 'aktif')::int AS jumlah_menu_aktif,
            COUNT(p.id)::int AS jumlah_menu_total
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id
     ${whereClause}
     GROUP BY c.id
     ORDER BY c.id ASC`
  );
  return result.rows;
}

export async function createCategory({ nama_kategori }) {
  const slug = generateSlug(nama_kategori);
  if (!slug) {
    const err = new Error('Nama kategori harus mengandung huruf atau angka.');
    err.status = 422;
    throw err;
  }

  const dup = await pool.query(
    `SELECT id FROM categories WHERE slug = $1 OR LOWER(nama_kategori) = LOWER($2)`,
    [slug, nama_kategori.trim()]
  );
  if (dup.rows.length > 0) {
    const err = new Error(`Kategori '${nama_kategori.trim()}' sudah ada.`);
    err.status = 409;
    throw err;
  }

  const result = await pool.query(
    `INSERT INTO categories (nama_kategori, slug, status)
     VALUES ($1, $2, 'aktif')
     RETURNING id, nama_kategori, slug, status`,
    [nama_kategori.trim(), slug]
  );
  return { ...result.rows[0], jumlah_menu_aktif: 0, jumlah_menu_total: 0 };
}

export async function updateCategory(id, { nama_kategori, status }) {
  const existingRes = await pool.query(
    `SELECT id, nama_kategori, slug, status FROM categories WHERE id = $1`,
    [id]
  );
  if (existingRes.rows.length === 0) {
    const err = new Error('Kategori tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  const existing = existingRes.rows[0];
  let nextNama = existing.nama_kategori;
  let nextSlug = existing.slug;

  if (nama_kategori !== undefined) {
    nextNama = nama_kategori.trim();
    nextSlug = generateSlug(nextNama);
    if (!nextSlug) {
      const err = new Error('Nama kategori harus mengandung huruf atau angka.');
      err.status = 422;
      throw err;
    }

    const dup = await pool.query(
      `SELECT id FROM categories WHERE (slug = $1 OR LOWER(nama_kategori) = LOWER($2)) AND id <> $3`,
      [nextSlug, nextNama, id]
    );
    if (dup.rows.length > 0) {
      const err = new Error(`Kategori '${nextNama}' sudah digunakan.`);
      err.status = 409;
      throw err;
    }
  }

  const nextStatus = status ?? existing.status;

  const result = await pool.query(
    `UPDATE categories
     SET nama_kategori = $1, slug = $2, status = $3
     WHERE id = $4
     RETURNING id, nama_kategori, slug, status`,
    [nextNama, nextSlug, nextStatus, id]
  );
  return result.rows[0];
}

export async function deleteCategory(id) {
  const catRes = await pool.query(
    `SELECT c.id, c.nama_kategori,
            COUNT(p.id) FILTER (WHERE p.status = 'aktif')::int AS active_count,
            COUNT(p.id)::int AS total_count
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id
     WHERE c.id = $1
     GROUP BY c.id`,
    [id]
  );

  if (catRes.rows.length === 0) {
    const err = new Error('Kategori tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  const cat = catRes.rows[0];
  if (cat.active_count > 0) {
    const err = new Error(
      `Kategori '${cat.nama_kategori}' masih memiliki ${cat.active_count} menu aktif dan tidak boleh dihapus. Cukup nonaktifkan kategori ini.`
    );
    err.status = 409;
    throw err;
  }

  if (cat.total_count > 0) {
    const err = new Error(
      `Kategori '${cat.nama_kategori}' masih terhubung dengan ${cat.total_count} menu dan tidak boleh dihapus. Cukup nonaktifkan kategori ini.`
    );
    err.status = 409;
    throw err;
  }

  await pool.query(`DELETE FROM categories WHERE id = $1`, [id]);
  return { id, deleted: true };
}
