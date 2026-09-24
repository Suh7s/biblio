import "dotenv/config";
import mongoose from "mongoose";
import { getAiConfig } from "../src/ai/config.js";
import BookChunk from "../src/models/BookChunk.js";
const config = getAiConfig();
try {
  await mongoose.connect(process.env.MONGODB_URI);
  await BookChunk.init();
  const definition = {
    fields: [
      {
        type: "vector",
        path: "embedding",
        numDimensions: config.AI_EMBEDDING_DIMENSIONS,
        similarity: "cosine",
      },
      ...["embeddingModel", "embeddingDimensions", "book"].map((path) => ({
        type: "filter",
        path,
      })),
    ],
  };
  const existing = await BookChunk.collection
    .listSearchIndexes(config.AI_VECTOR_INDEX)
    .toArray();
  if (existing.length)
    console.log(
      "Index already exists. Inspect its dimensions/model filters before indexing.",
    );
  else
    console.log(
      await BookChunk.collection.createSearchIndex({
        name: config.AI_VECTOR_INDEX,
        type: "vectorSearch",
        definition,
      }),
    );
  console.log(
    "Wait for the Atlas index to become queryable before serving searches.",
  );
} finally {
  await mongoose.disconnect();
}
