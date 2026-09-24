import mongoose from "mongoose";
import BookChunk from "../../models/BookChunk.js";
import { aiError } from "../../ai/config.js";
import { validVector } from "./provider.js";

export function cosineScore(a, b) {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    !validVector(a, b.length) ||
    !validVector(b, a.length)
  )
    return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return Math.max(0, Math.min(1, (1 + dot / Math.sqrt(aa * bb)) / 2));
}
export function vectorPipeline(
  vector,
  config,
  { limit = 60, bookIds = [] } = {},
) {
  const filter = {
    embeddingModel: config.AI_EMBEDDING_MODEL,
    embeddingDimensions: config.AI_EMBEDDING_DIMENSIONS,
  };
  if (bookIds.length)
    filter.book = { $in: bookIds.map((id) => new mongoose.Types.ObjectId(id)) };
  return [
    {
      $vectorSearch: {
        index: config.AI_VECTOR_INDEX,
        path: "embedding",
        queryVector: vector,
        numCandidates: Math.min(10000, limit * 20),
        limit,
        filter,
      },
    },
    { $project: { embedding: 0 } },
    { $set: { relevance: { $meta: "vectorSearchScore" } } },
  ];
}
export function createVectorStore(config) {
  return {
    async currentIds(ids) {
      return (
        await BookChunk.find({ _id: { $in: ids } })
          .select("_id")
          .lean()
      ).map((c) => String(c._id));
    },
    async search(vector, { limit = 60, bookIds = [] } = {}) {
      if (!validVector(vector, config.AI_EMBEDDING_DIMENSIONS))
        throw aiError(502, "Invalid query embedding.");
      if (config.AI_VECTOR_MODE === "atlas") {
        try {
          return await BookChunk.aggregate(
            vectorPipeline(vector, config, { limit, bookIds }),
          ).option({ maxTimeMS: 10000 });
        } catch {
          throw aiError(
            503,
            "Library vector search is unavailable. Ask the administrator to check the vector index.",
          );
        }
      }
      const filter = {
        embeddingModel: config.AI_EMBEDDING_MODEL,
        embeddingDimensions: config.AI_EMBEDDING_DIMENSIONS,
      };
      if (bookIds.length) filter.book = { $in: bookIds };
      // Fetch one extra to detect overflow; never silently search an arbitrary subset.
      const chunks = await BookChunk.find(filter)
        .select("+embedding")
        .limit(config.AI_EXACT_MAX_CHUNKS + 1)
        .lean()
        .maxTimeMS(10000);
      if (chunks.length > config.AI_EXACT_MAX_CHUNKS)
        throw aiError(
          503,
          "The local search limit was reached. Configure the Atlas vector index.",
        );
      return chunks
        .map(({ embedding, ...chunk }) => ({
          ...chunk,
          relevance: cosineScore(vector, embedding),
        }))
        .sort(
          (a, b) =>
            b.relevance - a.relevance ||
            String(a._id).localeCompare(String(b._id)),
        )
        .slice(0, limit);
    },
  };
}
