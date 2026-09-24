import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import mongoose from 'mongoose';
import bookRoutes from './routes/books.js';
import { createAiRouter } from './routes/ai.js';
import { fail } from './utils/errors.js';
import circulationRoutes from './routes/circulation.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import { authenticate, authorize } from './middleware/auth.js';
import { listCategories } from './controllers/books.js';
import { notFound, errorHandler } from './middleware/errors.js';

export function createApp({ ai, trustProxyHops = 0, isProduction = process.env.NODE_ENV === 'production' } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops);
  app.use(helmet({
    frameguard: { action: 'deny' },
    strictTransportSecurity: isProduction ? { maxAge: 31536000, includeSubDomains: true } : false
  }));
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && origin !== (process.env.CLIENT_ORIGIN || 'http://localhost:5173')) return next(fail(403, 'This request origin is not allowed.'));
    next();
  });
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health/live', (_req, res) => res.set('Cache-Control', 'no-store').json({ status: 'ok' }));
  app.get('/health/ready', async (_req, res) => {
    if (app.locals.draining || mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      return res.set('Cache-Control', 'no-store').status(503).json({ status: 'unavailable' });
    }
    try {
      await mongoose.connection.db.admin().command({ ping: 1 });
      return res.set('Cache-Control', 'no-store').json({ status: 'ok' });
    } catch {
      return res.set('Cache-Control', 'no-store').status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.get('/api/v1/categories', authenticate, authorize('USER', 'ADMIN'), listCategories);
  app.use('/api/v1/books', bookRoutes);
  app.use('/api/v1/ai', createAiRouter(ai));
  app.use('/api/v1', circulationRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
export default createApp();
