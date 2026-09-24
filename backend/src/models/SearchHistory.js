import mongoose from "mongoose";
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  query: { type: String, required: true, maxlength: 2000 },
  searchType: { type: String, enum: ["semantic", "keyword"], required: true },
  results: [{ type: mongoose.Schema.Types.ObjectId, ref: "Book" }],
  createdAt: { type: Date, default: Date.now },
});
schema.index({ user: 1, createdAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
export default mongoose.models.SearchHistory ||
  mongoose.model("SearchHistory", schema);
