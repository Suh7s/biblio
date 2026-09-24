// TEST ONLY: real Express, MongoDB, vector store and provider protocol; deterministic
// OpenAI transport. This module is never imported by production startup.
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app.js';
import { getAiConfig } from '../../src/ai/config.js';
import { createProvider } from '../../src/services/ai/provider.js';
import { createAiService } from '../../src/services/ai/service.js';
import { createIndexer } from '../../src/services/ai/indexing.js';
import { createVectorStore } from '../../src/services/ai/vector-store.js';
import { catalogue } from '../../src/services/ai/catalogue.js';
import { activity } from '../../src/services/ai/activity.js';
export const password = 'Integration-test-42!';
export const excerpt = 'Coordinate frames describe position and orientation. Sensor fusion combines measurements for autonomous motion planning.';
export const bookInput = { title: 'Integration Robotics Resource', authors: ['Integration Author'], isbn: 'INTEGRATION-001', category: 'Engineering', description: excerpt, totalCopies: 1, availableCopies: 1 };
export async function startFixture(port = 0) {
  process.env.JWT_SECRET = 'isolated-integration-test-secret-not-for-deployment';
  const mongo = await MongoMemoryReplSet.create({ binary: { downloadDir: join(tmpdir(), 'libramind-mongodb-binaries') }, replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  const control = { calls: [], invalidSelection: false };
  const config = { ...getAiConfig({}), OPENAI_API_KEY: 'test-transport-only', AI_VECTOR_MODE: 'exact', AI_EMBEDDING_DIMENSIONS: 3 };
  const provider = createProvider(config, async (url, options) => {
    const body = JSON.parse(options.body); control.calls.push({ url, body });
    if (url.endsWith('/embeddings')) return Response.json({ data: body.input.map((input, index) => ({ index, embedding: /pastry|baking|cooking/i.test(input) ? [0, 1, 0] : [1, 0, 0] })) });
    const input = JSON.parse(body.input[1].content);
    const source = input.libraryContext[0];
    const selection = { insufficientContext: false, selections: [{ sourceId: control.invalidSelection ? 'invented-source' : source.sourceId, excerpt: source.content.slice(0, 120), role: 'foundation' }] };
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(selection) }] }] });
  });
  const app = createApp({ ai: {
    service: createAiService({ config, provider, catalogue, activity, vectorStore: createVectorStore(config) }),
    indexer: createIndexer({ config, provider, catalogue })
  } });
  const server = await new Promise(resolve => { const s = app.listen(port, '127.0.0.1', () => resolve(s)); });
  return { server, control, base: `http://127.0.0.1:${server.address().port}/api/v1`, async close() { await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await mongo.stop(); } };
}
export class Client {
  constructor(base) { this.base = base; this.cookie = ''; }
  async call(method, path, body, headers = {}) {
    const response = await fetch(this.base + path, { method, headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const cookie = response.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  get(path) { return this.call('GET', path); }
  post(path, body) { return this.call('POST', path, body); }
  patch(path, body) { return this.call('PATCH', path, body); }
  delete(path) { return this.call('DELETE', path); }
}
