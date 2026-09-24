import { z } from 'zod';
export function serverConfig(env = process.env) {
  return z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    MONGODB_URI: z.string().min(1), JWT_SECRET: z.string().min(32).refine(v => !v.startsWith('replace-with'), 'Set a unique random JWT secret.'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    LOAN_DAYS: z.coerce.number().int().min(1).max(365).default(14),
    MAX_RENEWALS: z.coerce.number().int().min(0).max(100).default(2),
    RESERVATION_HOLD_DAYS: z.coerce.number().int().min(1).max(30).default(3),
    FINE_PER_DAY: z.coerce.number().min(0).max(10000).default(1),
    RESERVATION_SWEEP_MS: z.coerce.number().int().min(1000).max(3600000).default(60000)
  }).superRefine((config, context) => {
    try {
      if (new URL(config.CLIENT_ORIGIN).origin !== config.CLIENT_ORIGIN) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['CLIENT_ORIGIN'], message: 'CLIENT_ORIGIN must be an origin without a path or trailing slash.' });
      }
    } catch {
      // The base URL validator reports malformed origins.
    }
    if (config.NODE_ENV !== 'production') return;
    if (!config.CLIENT_ORIGIN.startsWith('https://')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['CLIENT_ORIGIN'], message: 'Production CLIENT_ORIGIN must use HTTPS.' });
    }
    if (config.TRUST_PROXY_HOPS < 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['TRUST_PROXY_HOPS'], message: 'Production must run behind a configured trusted HTTPS proxy.' });
    }
    const explicitlyDisablesTls = /[?&](tls|ssl)=false(?:&|$)/i.test(config.MONGODB_URI);
    if (explicitlyDisablesTls || (!config.MONGODB_URI.startsWith('mongodb+srv://') && !/[?&](tls|ssl)=true(?:&|$)/i.test(config.MONGODB_URI))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['MONGODB_URI'], message: 'Production MongoDB connections must use TLS.' });
    }
  }).parse(env);
}
