import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { listBooks, getBook, createBook, updateBook, deleteBook, listCategories } from '../controllers/books.js';

const router = Router();
router.get('/categories', authenticate, authorize('USER', 'ADMIN'), listCategories);
router.get('/', authenticate, authorize('USER', 'ADMIN'), listBooks);
router.get('/:id', authenticate, authorize('USER', 'ADMIN'), getBook);
router.post('/', authenticate, authorize('ADMIN'), createBook);
router.patch('/:id', authenticate, authorize('ADMIN'), updateBook);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteBook);
export default router;
