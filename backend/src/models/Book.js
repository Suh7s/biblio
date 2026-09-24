import mongoose from 'mongoose';

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 240, index: true },
  authors: { type: [String], required: true, validate: v => v.length > 0 },
  isbn: { type: String, required: true, unique: true, trim: true, uppercase: true },
  description: { type: String, default: '', maxlength: 10000 },
  category: { type: String, required: true, trim: true, index: true },
  tags: { type: [String], default: [] },
  publisher: { type: String, default: '', trim: true },
  publicationYear: { type: Number, min: 0 },
  totalCopies: { type: Number, required: true, min: 0, default: 0 },
  availableCopies: { type: Number, required: true, min: 0, default: 0 },
  shelfLocation: { type: String, default: '', trim: true },
  coverImage: { type: String, default: '' }
}, { timestamps: true });

bookSchema.pre('validate', function () {
  if (this.availableCopies > this.totalCopies) this.invalidate('availableCopies', 'Available copies cannot exceed total copies.');
});

bookSchema.index({ title: 'text', authors: 'text', description: 'text', tags: 'text', publisher: 'text' });
bookSchema.index({ category: 1, title: 1 });

export default mongoose.model('Book', bookSchema);
