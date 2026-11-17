// src/modules/orders/orders.controller.js
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
} from './orders.service.js';
import { ok, fail } from '../../utils/response.js';

function parseId(rawId) {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function handleCreateOrder(req, res, next) {
  try {
    const idempotencyKey = req.get('Idempotency-Key')?.trim() || null;
    const order = await createOrder(req.user.id, req.body, { idempotencyKey });
    return ok(res, { order }, 201);
  } catch (err) {
    next(err);
  }
}

export async function handleGetOrders(req, res, next) {
  try {
    const data = await getOrders(req.user.id, req.user.role, {
      status: req.query.status,
      q: req.query.q,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function handleGetOrderById(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 'ID pesanan tidak valid.', 400);

    const order = await getOrderById(id, req.user.id, req.user.role);
    return ok(res, { order });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateOrderStatus(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 'ID pesanan tidak valid.', 400);

    const order = await updateOrderStatus(id, req.user.id, req.user.role, req.body.status);
    return ok(res, { order });
  } catch (err) {
    next(err);
  }
}
