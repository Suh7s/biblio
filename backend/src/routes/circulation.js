import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { borrowBook, myBorrows, returnBook, renewBook, reserveBook, myReservations, cancelReservation, myFines, listNotifications, markNotificationRead } from '../controllers/circulation.js';

const router = Router();
router.use(authenticate, authorize('USER', 'ADMIN'));
router.post('/borrow/:bookId', borrowBook);
router.get('/borrow/my', myBorrows);
router.patch('/borrow/:id/return', returnBook);
router.patch('/borrow/:id/renew', renewBook);
router.post('/reservations/:bookId', reserveBook);
router.get('/reservations/my', myReservations);
router.delete('/reservations/:id', cancelReservation);
router.get('/fines/my', myFines);
router.get('/notifications', listNotifications);
router.patch('/notifications/:id/read', markNotificationRead);
export default router;
