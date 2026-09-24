import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../src/middleware/errors.js';

test('internal server errors never expose a supplied message or details', () => {
  let statusCode;
  let body;
  const response = {
    headersSent: false,
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; },
  };
  const error = Object.assign(new Error('database password leaked'), {
    status: 500,
    errors: { connection: 'mongodb://user:password@host' },
  });
  errorHandler(error, {}, response, () => assert.fail('next should not be called'));
  assert.equal(statusCode, 500);
  assert.deepEqual(body, { success: false, message: 'Internal server error.', errors: {} });
});
