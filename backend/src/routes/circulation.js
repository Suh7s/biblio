import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { borrowBook, myBorrows, returnBook, renewBook, reserveBook, myReservations, cancelReservation, myFines, listNotifications, markNotificationRead } from '../controllers/circulation.js';

const router = Router();
const access = [authenticate, authorize('USER', 'ADMIN')];
router.post('/borrow/:bookId', ...access, borrowBook);
router.get('/borrow/my', ...access, myBorrows);
router.patch('/borrow/:id/return', ...access, returnBook);
router.patch('/borrow/:id/renew', ...access, renewBook);
router.post('/reservations/:bookId', ...access, reserveBook);
router.get('/reservations/my', ...access, myReservations);
router.delete('/reservations/:id', ...access, cancelReservation);
router.get('/fines/my', ...access, myFines);
router.get('/notifications', ...access, listNotifications);
router.patch('/notifications/:id/read', ...access, markNotificationRead);
export default router;
