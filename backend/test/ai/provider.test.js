import test from "node:test";
import assert from "node:assert/strict";
import { getAiConfig } from "../../src/ai/config.js";
import { createProvider } from "../../src/services/ai/provider.js";
import {
  cosineScore,
  vectorPipeline,
} from "../../src/services/ai/vector-store.js";
import { splitText } from "../../src/services/ai/indexing.js";
import BookChunk from "../../src/models/BookChunk.js";
import { ids } from "./fixtures.js";

const config = {
  ...getAiConfig({}),
  OPENAI_API_KEY: "test-only-not-a-real-key",
  AI_EMBEDDING_DIMENSIONS: 3,
};
const response = (data) => ({
  ok: true,
  async json() {
    return data;
  },
});
test("embedding adapter maps unordered batch indices and uses configured dimensions", async () => {
  let body;
  const provider = createProvider(config, async (url, opts) => {
    assert.equal(url, "https://api.openai.com/v1/embeddings");
    body = JSON.parse(opts.body);
    return response({
      data: [
        { index: 1, embedding: [0, 1, 0] },
        { index: 0, embedding: [1, 0, 0] },
      ],
    });
  });
  assert.deepEqual(await provider.embed(["first", "second"]), [
    [1, 0, 0],
    [0, 1, 0],
  ]);
  assert.equal(body.dimensions, 3);
  assert.equal(body.encoding_format, "float");
});
test("embedding adapter rejects wrong dimensions, NaN, zero vectors, duplicates and missing data", async () => {
  for (const data of [
    [],
    [{ index: 0, embedding: [1, 2] }],
    [{ index: 0, embedding: [NaN, 1, 0] }],
    [{ index: 0, embedding: [0, 0, 0] }],
    [{ index: 9, embedding: [1, 0, 0] }],
    [
      { index: 0, embedding: [1, 0, 0] },
      { index: 0, embedding: [1, 0, 0] },
    ],
  ]) {
    const provider = createProvider(config, async () => response({ data }));
    await assert.rejects(provider.embed(["text"]), (e) => e.status === 502);
  }
});
test("provider reports missing configuration, timeouts and rate limits without leaking details", async () => {
  await assert.rejects(
    createProvider({ ...config, OPENAI_API_KEY: "" }).embed(["text"]),
    (e) => e.status === 503,
  );
  for (const fetcher of [
    async () => {
      throw new Error("secret internal detail");
    },
    async () => ({ ok: false, status: 429 }),
  ]) {
    await assert.rejects(
      createProvider(config, fetcher).embed(["text"]),
      (e) => e.status === 503 && !e.message.includes("secret"),
    );
  }
});
test("production AI configuration requires live credentials and Atlas vector search", () => {
  const env = {
    NODE_ENV: 'production',
    OPENAI_API_KEY: 'a-real-looking-but-test-only-key-value',
    AI_VECTOR_MODE: 'atlas',
  };
  assert.doesNotThrow(() => getAiConfig(env));
  assert.throws(() => getAiConfig({ ...env, OPENAI_API_KEY: '' }));
  assert.throws(() => getAiConfig({ ...env, OPENAI_API_KEY: 'replace-with-key' }));
  assert.throws(() => getAiConfig({ ...env, AI_VECTOR_MODE: 'exact' }));
});
test("structured generation disables storage and fails on refusal/incomplete/invalid output", async () => {
  const input = {
    system: "system",
    input: { question: "question" },
    schema: { type: "object" },
  };
  for (const data of [
    { status: "incomplete", output: [] },
    {
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal" }] }],
    },
    {
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "bad json" }],
        },
      ],
    },
  ]) {
    const provider = createProvider(config, async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      return response(data);
    });
    await assert.rejects(provider.select(input), (e) =>
      [422, 502].includes(e.status),
    );
  }
});
test("cosine scoring agrees with Atlas normalized score semantics", () => {
  assert.equal(cosineScore([1, 0], [1, 0]), 1);
  assert.equal(cosineScore([1, 0], [0, 1]), 0.5);
  assert.equal(cosineScore([1, 0], [-1, 0]), 0);
  assert.equal(cosineScore([0, 0], [1, 0]), 0);
  assert.equal(cosineScore([1, 0], null), 0);
});
test("Atlas vector pipeline starts with indexed search and prefilters model/dimensions/book", () => {
  const pipeline = vectorPipeline([1, 0, 0], config, {
    limit: 20,
    bookIds: [ids.book],
  });
  assert.equal(pipeline[0].$vectorSearch.path, "embedding");
  assert.equal(pipeline[0].$vectorSearch.numCandidates, 400);
  assert.equal(String(pipeline[0].$vectorSearch.filter.book.$in[0]), ids.book);
  assert.equal(pipeline[0].$vectorSearch.filter.embeddingDimensions, 3);
});
test("chunk splitting bounds long source text, overlaps boundaries and preserves ending", () => {
  const text = "A careful account of robotics and coordinate frames. ".repeat(
    100,
  );
  const parts = splitText(text);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((v) => v.length <= 1800));
  assert.ok(
    parts[1].startsWith(parts[0].slice(-100)) ||
      parts[0].includes(parts[1].slice(0, 100)),
  );
  assert.ok(text.trim().endsWith(parts.at(-1)));
  assert.throws(() => splitText(text, 10, 10));
});
test("BookChunk rejects invalid vectors and defines a unique stable source index", async () => {
  const model = new BookChunk({
    book: ids.book,
    content: "test source",
    embedding: [1, 2],
    embeddingDimensions: 3,
    embeddingModel: "test",
    metadata: {
      sourceId: "test",
      sourceType: "excerpt",
      chunkIndex: 0,
      contentHash: "abc",
      indexedAt: new Date(),
    },
  });
  await assert.rejects(model.validate(), /embedding/);
  assert.ok(
    BookChunk.schema
      .indexes()
      .some(
        ([fields, options]) =>
          fields["metadata.sourceId"] === 1 && options.unique,
      ),
  );
  assert.equal(BookChunk.schema.path("embedding").options.select, false);
});
