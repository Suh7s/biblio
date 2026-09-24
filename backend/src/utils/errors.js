import { z } from 'zod';
export const fail = (status, message, errors = {}) => Object.assign(new Error(message), { status, errors });
export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw fail(400, 'Validation failed.', result.error.flatten());
  return result.data;
}
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Expected a valid resource ID.');
export const pagination = { page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) };
