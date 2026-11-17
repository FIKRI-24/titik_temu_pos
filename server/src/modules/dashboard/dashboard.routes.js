// src/modules/dashboard/dashboard.routes.js
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { handleSummary, handleTrend, handleRecent } from './dashboard.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/summary', handleSummary);
router.get('/trend', handleTrend);
router.get('/recent', handleRecent);

export default router;
