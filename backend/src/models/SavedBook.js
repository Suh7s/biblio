import mongoose from 'mongoose';
const savedBookSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  createdAt: { type: Date, default: Date.now }
});
savedBookSchema.index({ user: 1, book: 1 }, { unique: true });
savedBookSchema.index({ user: 1, createdAt: -1 });
export default mongoose.model('SavedBook', savedBookSchema);
