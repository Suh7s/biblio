import { Router } from 'express';
import { register, login, logout, me } from '../controllers/auth.js';
import { authenticate } from '../middleware/auth.js';

import { rateLimit } from 'express-rate-limit';
const router = Router();
const attempts = rateLimit({ windowMs: 15 * 60000, limit: 30, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, message: 'Too many authentication attempts. Try again in 15 minutes.', errors: {} } });
const registrations = rateLimit({ windowMs: 60 * 60000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, message: 'Too many registrations. Try again later.', errors: {} } });
router.post('/register', registrations, register);
router.post('/login', attempts, login);
router.post('/logout', logout);
router.get('/me', authenticate, me);
export default router;
