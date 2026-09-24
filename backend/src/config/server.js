import { z } from 'zod';
export function serverConfig(env = process.env) {
  return z.object({
    MONGODB_URI: z.string().min(1), JWT_SECRET: z.string().min(32).refine(v => !v.startsWith('replace-with'), 'Set a unique random JWT secret.'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
    LOAN_DAYS: z.coerce.number().int().min(1).max(365).default(14),
    MAX_RENEWALS: z.coerce.number().int().min(0).max(100).default(2),
    RESERVATION_HOLD_DAYS: z.coerce.number().int().min(1).max(30).default(3),
    FINE_PER_DAY: z.coerce.number().min(0).max(10000).default(1),
    RESERVATION_SWEEP_MS: z.coerce.number().int().min(1000).max(3600000).default(60000)
  }).parse(env);
}
