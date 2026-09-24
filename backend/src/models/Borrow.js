import mongoose from 'mongoose';

const borrowSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
  borrowedAt: { type: Date, required: true, default: Date.now },
  dueDate: { type: Date, required: true },
  returnedAt: { type: Date, default: null },
  renewedCount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['BORROWED', 'RETURNED', 'OVERDUE'], default: 'BORROWED', index: true }
}, { timestamps: true });

borrowSchema.index({ user: 1, book: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['BORROWED', 'OVERDUE'] } } });
export default mongoose.model('Borrow', borrowSchema);
