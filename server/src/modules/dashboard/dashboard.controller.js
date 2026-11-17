// src/modules/dashboard/dashboard.controller.js
import { getSummary, getTrend, getRecentOrders } from './dashboard.service.js';
import { ok } from '../../utils/response.js';

export async function handleSummary(req, res, next) {
  try {
    const data = await getSummary(req.user.id, req.user.role);
    return ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function handleTrend(req, res, next) {
  try {
    const days = req.query.days ? parseInt(req.query.days, 10) : 7;
    const data = await getTrend(req.user.id, req.user.role, days);
    return ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function handleRecent(req, res, next) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 8;
    const orders = await getRecentOrders(req.user.id, req.user.role, limit);
    return ok(res, { orders });
  } catch (err) {
    next(err);
  }
}
