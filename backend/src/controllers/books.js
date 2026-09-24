import { z } from 'zod';
import mongoose from 'mongoose';
import Book from '../models/Book.js';

const bookInput = z.object({
  title: z.string().trim().min(1).max(240), authors: z.array(z.string().trim().min(1)).min(1), isbn: z.string().trim().min(1).max(32),
  description: z.string().max(10000).optional(), category: z.string().trim().min(1), tags: z.array(z.string().trim()).optional(),
  publisher: z.string().trim().optional(), publicationYear: z.coerce.number().int().min(0).max(new Date().getFullYear() + 2).optional(),
  totalCopies: z.coerce.number().int().min(0), availableCopies: z.coerce.number().int().min(0), shelfLocation: z.string().trim().optional(), coverImage: z.string().optional()
});

function validateInput(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) { const err = new Error('Validation failed.'); err.status = 400; err.errors = result.error.flatten().fieldErrors; throw err; }
  if (result.data.availableCopies > result.data.totalCopies) { const err = new Error('availableCopies cannot exceed totalCopies.'); err.status = 400; err.errors = { availableCopies: ['Must not exceed totalCopies.'] }; throw err; }
  return result.data;
}

export async function listBooks(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.available === 'true') filter.availableCopies = { $gt: 0 };
  if (req.query.search?.trim()) {
    const term = req.query.search.trim();
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['title', 'authors', 'description', 'isbn', 'tags', 'publisher'].map(key => ({ [key]: { $regex: safe, $options: 'i' } }));
  }
  const sortMap = { title: { title: 1 }, '-title': { title: -1 }, year: { publicationYear: 1 }, '-year': { publicationYear: -1 }, newest: { createdAt: -1 } };
  const sort = sortMap[req.query.sort] || { title: 1 };
  const [items, total] = await Promise.all([Book.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(), Book.countDocuments(filter)]);
  res.json({ success: true, message: 'Books retrieved.', data: { books: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}

export async function getBook(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Book not found.' });
  const book = await Book.findById(req.params.id).lean();
  if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });
  const relatedBooks = await Book.find({ _id: { $ne: book._id }, category: book.category }).sort({ title: 1 }).limit(4).lean();
  res.json({ success: true, message: 'Book retrieved.', data: { book, relatedBooks } });
}

export async function createBook(req, res) {
  const data = validateInput(bookInput, req.body);
  const book = await Book.create(data);
  res.status(201).json({ success: true, message: 'Book created.', data: { book } });
}

export async function updateBook(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Book not found.' });
  const partialSchema = bookInput.partial().refine(v => Object.keys(v).length > 0, 'Provide at least one field to update.');
  const data = validateInput(partialSchema, req.body);
  const book = await Book.findById(req.params.id);
  if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });
  Object.assign(book, data);
  if (book.availableCopies > book.totalCopies) { const err = new Error('availableCopies cannot exceed totalCopies.'); err.status = 400; throw err; }
  await book.save();
  res.json({ success: true, message: 'Book updated.', data: { book } });
}

export async function deleteBook(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Book not found.' });
  const book = await Book.findById(req.params.id);
  if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });
  // Borrow and reservation models are owned by Developer 3; reject deletion if their collections contain a reference.
  const db = mongoose.connection.db;
  for (const name of ['borrows', 'reservations']) {
    const collection = db.collection(name);
    if (await collection.countDocuments({ book: book._id, ...(name === 'borrows' ? { status: { $in: ['BORROWED', 'OVERDUE'] } } : { status: { $in: ['ACTIVE', 'WAITING', 'PENDING', 'READY'] } }) })) {
      return res.status(409).json({ success: false, message: 'This book has active borrowings or reservations and cannot be deleted.' });
    }
  }
  await book.deleteOne();
  res.json({ success: true, message: 'Book deleted.', data: { id: book.id } });
}

export async function listCategories(req, res) {
  const categories = await Book.distinct('category');
  res.json({ success: true, message: 'Categories retrieved.', data: { categories: categories.sort((a, b) => a.localeCompare(b)) } });
}
