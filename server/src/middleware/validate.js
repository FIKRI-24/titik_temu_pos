// src/middleware/validate.js
import { fail } from '../utils/response.js';

/**
 * Zod schema validation middleware
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return fail(res, 'Data yang dikirim tidak valid.', 422, details);
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return fail(res, 'Parameter query tidak valid.', 422, details);
    }
    req.query = result.data;
    next();
  };
}
