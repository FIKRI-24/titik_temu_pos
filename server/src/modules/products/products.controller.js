// src/modules/products/products.controller.js
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductStock,
  getStockHistory,
  deleteOrDeactivateProduct,
} from './products.service.js';
import { ok, fail } from '../../utils/response.js';

function parseId(rawId) {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function handleGetAll(req, res, next) {
  try {
    const data = await getProducts({
      category: req.query.category,
      q: req.query.q,
      aktif: req.query.aktif,
      role: req.user.role,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function handleGetOne(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 'ID menu tidak valid.', 400);

    const product = await getProductById(id, req.user.role);
    return ok(res, { product });
  } catch (err) {
    next(err);
  }
}

export async function handleCreate(req, res, next) {
  try {
    const product = await createProduct(req.body);
    return ok(res, { product }, 201);
  } catch (err) {
    next(err);
  }
}

export async function handleUpdate(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 'ID menu tidak valid.', 400);

    const product = await updateProduct(id, req.body);
    return ok(res, { product });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateStock(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 'ID menu tidak valid.', 400);

    const data = await updateProductStock(id, req.user.id, req.body);
    return ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function handleGetStockHistory(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 'ID menu tidak valid.', 400);

    const history = await getStockHistory(id);
    return ok(res, { history });
  } catch (err) {
    next(err);
  }
}

export async function handleDelete(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 'ID menu tidak valid.', 400);

    const result = await deleteOrDeactivateProduct(id);
    return ok(res, result);
  } catch (err) {
    next(err);
  }
}
