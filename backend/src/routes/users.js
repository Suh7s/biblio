import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { getProfile, updateProfile, history } from '../controllers/users.js';

const router = Router();
router.use(authenticate, authorize('USER', 'ADMIN'));
router.get('/me', getProfile);
router.patch('/me', updateProfile);
router.get('/me/history', history);
export default router;
