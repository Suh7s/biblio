import "dotenv/config";
import mongoose from "mongoose";
import Book from "../src/models/Book.js";
import BookChunk from "../src/models/BookChunk.js";
import { getAiConfig } from "../src/ai/config.js";
import { createProvider } from "../src/services/ai/provider.js";
import { catalogue } from "../src/services/ai/catalogue.js";
import { createIndexer } from "../src/services/ai/indexing.js";

if (!process.env.MONGODB_URI)
  throw new Error("Configure MONGODB_URI in backend/.env.");
const config = getAiConfig();
const indexer = createIndexer({
  config,
  provider: createProvider(config),
  catalogue,
});
try {
  await mongoose.connect(process.env.MONGODB_URI);
  await BookChunk.init();
  let indexed = 0,
    unchanged = 0;
  for await (const book of Book.find({}).select("_id").cursor()) {
    const result = await indexer.indexCatalogue(String(book._id));
    result.indexed ? indexed++ : unchanged++;
  }
  console.log(JSON.stringify({ indexed, unchanged }));
} finally {
  await mongoose.disconnect();
}
