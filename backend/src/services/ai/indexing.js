import { withBookTransaction } from "../circulation.js";
import BookChunk from "../../models/BookChunk.js";
import { catalogueText, catalogueFingerprint, hash } from "./catalogue.js";
import { aiError } from "../../ai/config.js";

// Overlap preserves context at boundaries; all offsets refer to submitted text.
export function splitText(text, size = 1800, overlap = 200) {
  if (!Number.isInteger(size) || size < 2 || overlap < 0 || overlap >= size)
    throw new Error("Invalid chunk settings.");
  const parts = [];
  for (let start = 0; start < text.length; ) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf(" ", end);
      if (boundary > start + size / 2) end = boundary;
    }
    const content = text.slice(start, end).trim();
    if (content) parts.push(content);
    if (end === text.length) break;
    start = end - overlap;
  }
  return parts;
}

export function createIndexer({ config, provider, catalogue }) {
  async function replace(book, sourceId, sections, sourceType) {
    const chunks = sections.flatMap((section) =>
      splitText(section.content).map((content) => ({
        book: book._id,
        chapter: section.chapter || "",
        section: section.section || "",
        content,
        embeddingModel: config.AI_EMBEDDING_MODEL,
        embeddingDimensions: config.AI_EMBEDDING_DIMENSIONS,
        metadata: {
          sourceId,
          sourceType,
          contentHash: hash(content),
          indexedAt: new Date(),
          ...(sourceType === "catalogue"
            ? { catalogueFingerprint: catalogueFingerprint(book) }
            : {}),
          ...(section.pageStart ? { pageStart: section.pageStart } : {}),
        },
      })),
    );
    if (chunks.length > 80)
      throw aiError(
        400,
        "This source creates too many chunks. Split it into smaller sources.",
      );
    for (let start = 0; start < chunks.length; start += 32) {
      const batch = chunks.slice(start, start + 32);
      // Include actual catalogue concepts for semantic matching, never copy inventory into embeddings.
      const inputs = batch.map((c) =>
        [
          book.title,
          book.category,
          ...(book.tags || []).slice(0, 20),
          c.chapter,
          c.section,
          c.content,
        ]
          .join("\n")
          .slice(0, 6000),
      );
      const embeddings = await provider.embed(inputs);
      batch.forEach((chunk, i) => {
        chunk.embedding = embeddings[i];
        chunk.metadata.chunkIndex = start + i;
      });
    }
    // Embedding failure leaves the old source intact. Replacement is atomic on Atlas/replica sets.
    await withBookTransaction(book._id, async (currentBook, session) => {
      if (catalogueFingerprint(currentBook) !== catalogueFingerprint(book))
        throw aiError(409, "Book metadata changed during indexing. Retry with the current book.");
      await BookChunk.deleteMany({ book: book._id, "metadata.sourceId": sourceId }, { session });
      await BookChunk.insertMany(chunks, { session });
    });
    return {
      bookId: String(book._id),
      sourceId,
      chunks: chunks.length,
      indexed: true,
    };
  }
  async function requireBook(id) {
    const book = await catalogue.getBook(id);
    if (!book) throw aiError(404, "Book not found.");
    return book;
  }
  return {
    async indexCatalogue(id) {
      const book = await requireBook(id);
      const current = await BookChunk.findOne({
        book: id,
        "metadata.sourceId": "catalogue",
      }).lean();
      if (
        current?.metadata.catalogueFingerprint === catalogueFingerprint(book) &&
        current.embeddingModel === config.AI_EMBEDDING_MODEL &&
        current.embeddingDimensions === config.AI_EMBEDDING_DIMENSIONS
      ) {
        return {
          bookId: id,
          sourceId: "catalogue",
          indexed: false,
          message: "Catalogue content is unchanged.",
        };
      }
      return replace(
        book,
        "catalogue",
        [{ section: "Catalogue description", content: catalogueText(book) }],
        "catalogue",
      );
    },
    async replaceSource(id, { sourceId, sections }) {
      return replace(await requireBook(id), sourceId, sections, "excerpt");
    },
    async deleteSource(id, sourceId) {
      const { deletedCount } = await withBookTransaction(id, (_book, session) => BookChunk.deleteMany({ book: id, "metadata.sourceId": sourceId }, { session }));
      return { bookId: id, sourceId, deletedCount };
    },
  };
}
