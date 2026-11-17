// src/modules/categories/categories.controller.js
import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from './categories.service.js';
import { ok, fail } from '../../utils/response.js';

function parseId(rawId) {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function handleGetAll(req, res, next) {
  try {
    const includeInactive = req.user.role === 'admin' && req.query.all === 'true';
    const categories = await getAllCategories(includeInactive);
    return ok(res, { categories });
  } catch (err) {
    next(err);
  }
}

export async function handleCreate(req, res, next) {
  try {
    const category = await createCategory(req.body);
    return ok(res, { category }, 201);
  } catch (err) {
    next(err);
  }
}

export async function handleUpdate(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 'ID kategori tidak valid.', 400);

    const category = await updateCategory(id, req.body);
    return ok(res, { category });
  } catch (err) {
    next(err);
  }
}

export async function handleDelete(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 'ID kategori tidak valid.', 400);

    const result = await deleteCategory(id);
    return ok(res, result);
  } catch (err) {
    next(err);
  }
}
