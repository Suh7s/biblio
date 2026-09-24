import { getAiConfig } from "../../src/ai/config.js";
import { createAiService } from "../../src/services/ai/service.js";
import { hash, catalogueFingerprint } from "../../src/services/ai/catalogue.js";

export const ids = {
  user: "aaaaaaaaaaaaaaaaaaaaaaaa",
  book: "111111111111111111111111",
  second: "222222222222222222222222",
  chunk: "333333333333333333333333",
  otherChunk: "444444444444444444444444",
};
export const book = {
  _id: ids.book,
  title: "Test Robotics Resource",
  authors: ["Test Author"],
  description: "Coordinate frames and motion planning for autonomous robots.",
  category: "Engineering",
  tags: ["robotics"],
  availableCopies: 2,
  totalCopies: 3,
};
export const content =
  "Coordinate frames describe the position and orientation of a robot. Motion planning connects configurations through a collision-free path.";
export function chunk(overrides = {}) {
  return {
    _id: ids.chunk,
    book: ids.book,
    chapter: "Chapter 2",
    section: "Motion planning",
    content,
    relevance: 0.94,
    metadata: {
      sourceType: "excerpt",
      sourceId: "licensed-notes",
      contentHash: hash(content),
    },
    ...overrides,
  };
}
export const selection = {
  insufficientContext: false,
  selections: [
    {
      sourceId: "S1",
      excerpt:
        "Coordinate frames describe the position and orientation of a robot.",
      role: "foundation",
    },
  ],
};
export function harness(overrides = {}) {
  const calls = { embed: [], select: [], books: [], history: [], signals: [] };
  const config = { ...getAiConfig({}), AI_EMBEDDING_DIMENSIONS: 3 };
  const dependencies = {
    config,
    provider: {
      async embed(input) {
        calls.embed.push(input);
        return [[1, 0, 0]];
      },
      async select(input) {
        calls.select.push(input);
        return selection;
      },
    },
    vectorStore: {
      async search() {
        return [chunk()];
      },
      async currentIds(ids) {
        return ids;
      },
    },
    catalogue: {
      async getBooks(ids) {
        calls.books.push(ids);
        return [book];
      },
    },
    activity: {
      async recordSearch(...args) {
        calls.history.push(args);
        return true;
      },
      async getSignals(id) {
        calls.signals.push(id);
        return {
          interests: [],
          borrowedBookIds: [],
          savedBookIds: [],
          searches: [],
        };
      },
    },
    ...overrides,
  };
  return { service: createAiService(dependencies), calls, dependencies };
}
export const catalogueChunk = chunk({
  section: "Catalogue description",
  metadata: {
    sourceType: "catalogue",
    sourceId: "catalogue",
    contentHash: hash(content),
    catalogueFingerprint: catalogueFingerprint(book),
  },
});
