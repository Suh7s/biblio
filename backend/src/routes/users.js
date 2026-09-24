import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { getProfile, updateProfile, history, savedBooks, saveBook, unsaveBook } from '../controllers/users.js';

const router = Router();
router.use(authenticate, authorize('USER', 'ADMIN'));
router.get('/me', getProfile);
router.patch('/me', updateProfile);
router.get('/me/history', history);
router.get('/me/saved-books', savedBooks);
router.put('/me/saved-books/:bookId', saveBook);
router.delete('/me/saved-books/:bookId', unsaveBook);
export default router;
