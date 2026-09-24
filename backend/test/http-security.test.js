import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { serverConfig } from '../src/config/server.js';

test('liveness is public and standard security headers are present', async () => {
  const app = createApp();
  const response = await request(app).get('/health/live');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['strict-transport-security'], undefined);
});

test('readiness returns only a sanitized unavailable response while MongoDB is disconnected', async () => {
  assert.notEqual(mongoose.connection.readyState, 1);
  const response = await request(createApp()).get('/health/ready');
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { status: 'unavailable' });
});

test('production enables HSTS and trusts only the configured proxy hop count', async () => {
  const app = createApp({ isProduction: true, trustProxyHops: 1 });
  assert.equal(app.get('trust proxy'), 1);
  const response = await request(app).get('/health/live');
  assert.equal(response.headers['strict-transport-security'], 'max-age=31536000; includeSubDomains');
});

test('production refuses insecure origins, direct untrusted proxying, and non-TLS MongoDB', () => {
  const base = {
    NODE_ENV: 'production',
    JWT_SECRET: 'test-only-secret-with-at-least-thirty-two-bytes',
    MONGODB_URI: 'mongodb+srv://library.example.edu/biblio',
    CLIENT_ORIGIN: 'http://library.example.edu',
    TRUST_PROXY_HOPS: 0,
  };
  assert.throws(() => serverConfig(base));
  assert.throws(() => serverConfig({ ...base, CLIENT_ORIGIN: 'https://library.example.edu', TRUST_PROXY_HOPS: 1, MONGODB_URI: 'mongodb://db.internal/biblio' }));
  assert.throws(() => serverConfig({ ...base, CLIENT_ORIGIN: 'https://library.example.edu/', TRUST_PROXY_HOPS: 1 }));
  assert.throws(() => serverConfig({ ...base, CLIENT_ORIGIN: 'https://library.example.edu', TRUST_PROXY_HOPS: 1, MONGODB_URI: 'mongodb+srv://db.internal/biblio?tls=false' }));
  assert.doesNotThrow(() => serverConfig({ ...base, CLIENT_ORIGIN: 'https://library.example.edu', TRUST_PROXY_HOPS: 1 }));
  assert.doesNotThrow(() => serverConfig({ ...base, CLIENT_ORIGIN: 'https://library.example.edu', TRUST_PROXY_HOPS: 1, MONGODB_URI: 'mongodb://db.internal/biblio?tls=true' }));
});
