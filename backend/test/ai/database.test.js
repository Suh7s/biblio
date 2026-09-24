import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Book from "../../src/models/Book.js";
import BookChunk from "../../src/models/BookChunk.js";
import SearchHistory from "../../src/models/SearchHistory.js";
import { getAiConfig } from "../../src/ai/config.js";
import { createIndexer } from "../../src/services/ai/indexing.js";
import { createVectorStore } from "../../src/services/ai/vector-store.js";
import { createAiService } from "../../src/services/ai/service.js";
import { catalogue } from "../../src/services/ai/catalogue.js";
import { activity } from "../../src/services/ai/activity.js";
import { ids, content, selection } from "./fixtures.js";

let mongo, targetBook;
let embedCalls = 0,
  failEmbed = false;
const config = {
  ...getAiConfig({}),
  AI_VECTOR_MODE: "exact",
  AI_EMBEDDING_DIMENSIONS: 3,
};
const provider = {
  async embed(inputs) {
    embedCalls++;
    if (failEmbed) throw new Error("test provider offline");
    return inputs.map(() => [1, 0, 0]);
  },
  async select() {
    return selection;
  },
};
const indexer = createIndexer({ config, provider, catalogue });
const vectorStore = createVectorStore(config);
before(
  async () => {
    mongo = await MongoMemoryReplSet.create({
      binary: { downloadDir: join(tmpdir(), "biblio-mongodb-binaries") },
      replSet: { count: 1 },
    });
    await mongoose.connect(mongo.getUri());
    await Promise.all([Book.init(), BookChunk.init(), SearchHistory.init()]);
  },
  { timeout: 180000 },
);
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  failEmbed = false;
  embedCalls = 0;
  await Promise.all([
    Book.deleteMany({}),
    BookChunk.deleteMany({}),
    SearchHistory.deleteMany({}),
    ...["users", "savedbooks", "borrows"].map((name) =>
      mongoose.connection.db.collection(name).deleteMany({}),
    ),
  ]);
  targetBook = await Book.create({
    _id: ids.book,
    title: "Database Test Book",
    isbn: "TEST-DB-001",
    authors: ["Test Author"],
    category: "Engineering",
    description: content,
    totalCopies: 2,
    availableCopies: 2,
  });
});
test("catalogue indexing is idempotent and creates hidden, dimensioned embeddings for actual Book IDs", async () => {
  assert.equal((await indexer.indexCatalogue(ids.book)).indexed, true);
  assert.equal((await indexer.indexCatalogue(ids.book)).indexed, false);
  assert.equal(embedCalls, 1);
  const chunks = await BookChunk.find({ book: ids.book }).lean();
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].embedding, undefined);
  assert.equal(chunks[0].metadata.sourceType, "catalogue");
  assert.equal(
    (await BookChunk.findOne().select("+embedding")).embedding.length,
    3,
  );
});
test("atomic source replacement preserves other sources and leaves prior data intact on failure", async () => {
  await indexer.indexCatalogue(ids.book);
  await indexer.replaceSource(ids.book, {
    sourceId: "notes",
    sections: [{ chapter: "Chapter 2", content }],
  });
  const initial = await BookChunk.findOne({
    "metadata.sourceId": "notes",
  }).lean();
  failEmbed = true;
  await assert.rejects(
    indexer.replaceSource(ids.book, {
      sourceId: "notes",
      sections: [
        { content: "Replacement notes that should not be committed." },
      ],
    }),
  );
  assert.equal(
    String((await BookChunk.findOne({ "metadata.sourceId": "notes" }))._id),
    String(initial._id),
  );
  failEmbed = false;
  await indexer.replaceSource(ids.book, {
    sourceId: "notes",
    sections: [
      {
        content:
          "A successfully indexed replacement source about robot motion.",
      },
    ],
  });
  assert.equal(await BookChunk.countDocuments({}), 2);
  assert.equal((await indexer.deleteSource(ids.book, "notes")).deletedCount, 1);
  assert.equal(
    await BookChunk.countDocuments({ "metadata.sourceId": "catalogue" }),
    1,
  );
});
test("real exact vector retrieval and RAG resolve authoritative catalogue fields", async () => {
  await indexer.replaceSource(ids.book, {
    sourceId: "notes",
    sections: [{ chapter: "Chapter 2", section: "Frames", content }],
  });
  const service = createAiService({
    config,
    provider,
    vectorStore,
    catalogue,
    activity,
  });
  const result = await service.ask({
    query: "How do robots navigate?",
    contextBookIds: [],
  });
  assert.equal(result.books[0]._id.toString(), ids.book);
  assert.equal(result.sources[0].chapter, "Chapter 2");
  assert.equal(result.insufficientContext, false);
});
test("changed catalogue descriptions are excluded until reindexed; deleted books are never returned", async () => {
  await indexer.indexCatalogue(ids.book);
  const service = createAiService({
    config,
    provider,
    vectorStore,
    catalogue,
    activity,
  });
  await Book.updateOne(
    { _id: ids.book },
    {
      $set: {
        description: "Updated catalogue content that needs new embeddings.",
      },
    },
  );
  assert.equal(
    (await service.search({ q: "robotics", limit: 8 }, ids.user)).results
      .length,
    0,
  );
  await indexer.indexCatalogue(ids.book);
  assert.equal(
    (await service.search({ q: "robotics", limit: 8 }, ids.user)).results
      .length,
    1,
  );
  await Book.deleteOne({ _id: ids.book });
  assert.equal(
    (await service.search({ q: "robotics", limit: 8 }, ids.user)).results
      .length,
    0,
  );
});
test("bounded exact mode refuses overflow and filters incompatible embedding spaces", async () => {
  await indexer.indexCatalogue(ids.book);
  await indexer.replaceSource(ids.book, {
    sourceId: "notes",
    sections: [{ content }],
  });
  await assert.rejects(
    createVectorStore({ ...config, AI_EXACT_MAX_CHUNKS: 1 }).search([1, 0, 0]),
    (e) => e.status === 503,
  );
  const none = await createVectorStore({
    ...config,
    AI_EMBEDDING_MODEL: "a-different-model",
  }).search([1, 0, 0]);
  assert.deepEqual(none, []);
});
test("activity adapter isolates user signals and stores only Book references in history", async () => {
  const db = mongoose.connection.db,
    user = new mongoose.Types.ObjectId(ids.user),
    other = new mongoose.Types.ObjectId();
  await db.collection("users").insertMany([
    {
      _id: user,
      profile: { interests: ["robotics"] },
      password: "must-never-be-read",
    },
    { _id: other, interests: ["private"] },
  ]);
  await db.collection("savedbooks").insertMany([
    { user, book: targetBook._id, createdAt: new Date() },
    { user: other, book: other },
  ]);
  await db.collection("borrows").insertMany([
    { user, book: targetBook._id, status: "RETURNED", borrowedAt: new Date() },
    { user: other, book: other, status: "BORROWED" },
  ]);
  await activity.recordSearch(ids.user, "Robot navigation", [ids.book]);
  await activity.recordSearch(other.toString(), "Private search", []);
  const signals = await activity.getSignals(ids.user);
  assert.deepEqual(signals.interests, ["robotics"]);
  assert.deepEqual(signals.savedBookIds, [ids.book]);
  assert.deepEqual(signals.borrowedBookIds, [ids.book]);
  assert.deepEqual(signals.searches, ["Robot navigation"]);
  assert.deepEqual(
    (await SearchHistory.findOne({ user })).results.map(String),
    [ids.book],
  );
  await assert.rejects(
    activity.getSignals("not-a-user"),
    (e) => e.status === 401,
  );
});
test("indexer cannot create knowledge for a nonexistent book", async () => {
  await assert.rejects(
    indexer.indexCatalogue(ids.second),
    (e) => e.status === 404,
  );
  assert.equal(embedCalls, 0);
});
