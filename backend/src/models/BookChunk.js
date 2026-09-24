import mongoose from "mongoose";

const metadataSchema = new mongoose.Schema(
  {
    sourceId: { type: String, required: true, maxlength: 80 },
    sourceType: {
      type: String,
      enum: ["catalogue", "excerpt"],
      required: true,
    },
    chunkIndex: { type: Number, required: true, min: 0 },
    contentHash: { type: String, required: true },
    catalogueFingerprint: String,
    pageStart: { type: Number, min: 1 },
    indexedAt: { type: Date, required: true },
  },
  { _id: false, strict: "throw" },
);

const schema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    chapter: { type: String, default: "", maxlength: 200 },
    section: { type: String, default: "", maxlength: 200 },
    content: { type: String, required: true, maxlength: 2400 },
    embedding: {
      type: [Number],
      required: true,
      select: false,
      validate: {
        validator(v) {
          return (
            v.length === this.embeddingDimensions &&
            v.every(Number.isFinite) &&
            v.some((n) => n !== 0)
          );
        },
        message: "Invalid embedding dimensions or values.",
      },
    },
    embeddingModel: { type: String, required: true },
    embeddingDimensions: { type: Number, required: true, min: 1, max: 3072 },
    metadata: { type: metadataSchema, required: true },
  },
  { timestamps: true, strict: "throw" },
);

// B-tree indexes support source replacement, references and the bounded local mode.
// Atlas vector search needs the separate index in backend/atlas-vector-index.json.
schema.index(
  { book: 1, "metadata.sourceId": 1, "metadata.chunkIndex": 1 },
  { unique: true },
);
schema.index({ embeddingModel: 1, embeddingDimensions: 1 });
export default mongoose.models.BookChunk || mongoose.model("BookChunk", schema);
