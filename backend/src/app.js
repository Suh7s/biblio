import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bookRoutes from './routes/books.js';
import { authenticate, authorize } from './middleware/auth.js';
import { listCategories } from './controllers/books.js';
import { notFound, errorHandler } from './middleware/errors.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.get('/api/v1/categories', authenticate, authorize('USER', 'ADMIN'), listCategories);
app.use('/api/v1/books', bookRoutes);
app.use(notFound);
app.use(errorHandler);
export default app;
