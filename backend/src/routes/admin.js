import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { analytics, dashboard, listBorrowings, listReservations, listUsers } from '../controllers/admin.js';

const router = Router();
router.use(authenticate, authorize('ADMIN'));
router.get('/dashboard', dashboard);
router.get('/users', listUsers);
router.get('/borrowings', listBorrowings);
router.get('/reservations', listReservations);
router.get('/analytics', analytics);
export default router;
