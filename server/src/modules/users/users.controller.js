// src/modules/users/users.controller.js
import { getAllUsers, createUser, updateUser, resetPassword } from './users.service.js';
import { ok, fail } from '../../utils/response.js';

function parseUserId(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

export async function handleGetAll(_req, res, next) {
  try {
    const users = await getAllUsers();
    return ok(res, { users });
  } catch (err) {
    next(err);
  }
}

export async function handleCreate(req, res, next) {
  try {
    const user = await createUser(req.body);
    return ok(res, { user }, 201);
  } catch (err) {
    next(err);
  }
}

export async function handleUpdate(req, res, next) {
  try {
    const id = parseUserId(req.params.id);
    if (!id) return fail(res, 'ID pengguna tidak valid.', 400);

    const user = await updateUser(id, req.user.id, req.body);
    return ok(res, { user });
  } catch (err) {
    next(err);
  }
}

export async function handleResetPassword(req, res, next) {
  try {
    const id = parseUserId(req.params.id);
    if (!id) return fail(res, 'ID pengguna tidak valid.', 400);

    const user = await resetPassword(id, req.body.password);
    return ok(res, { user });
  } catch (err) {
    next(err);
  }
}
