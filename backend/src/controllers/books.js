import { z } from 'zod';
import mongoose from 'mongoose';
import Book from '../models/Book.js';
import Borrow from '../models/Borrow.js';
import Reservation from '../models/Reservation.js';
import SavedBook from '../models/SavedBook.js';
import BookChunk from '../models/BookChunk.js';
import { parse, fail, pagination } from '../utils/errors.js';
import { withBookTransaction, promoteReservations, ACTIVE_BORROW, ACTIVE_RESERVATION } from '../services/circulation.js';

const bookInput = z.object({
  title: z.string().trim().min(1).max(240), authors: z.array(z.string().trim().min(1).max(200)).min(1).max(30), isbn: z.string().trim().min(1).max(32),
  description: z.string().max(10000).optional(), category: z.string().trim().min(1).max(120), tags: z.array(z.string().trim().max(80)).max(40).optional(),
  publisher: z.string().trim().optional(), publicationYear: z.coerce.number().int().min(0).max(new Date().getFullYear() + 2).optional(),
  totalCopies: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER), availableCopies: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER), shelfLocation: z.string().trim().optional(), coverImage: z.union([z.literal(''), z.string().url().max(2000).refine(v => /^https?:/.test(v), 'Use an HTTP or HTTPS image URL.')]).optional()
}).strict();

function validateInput(schema, input) {
  const data = parse(schema, input);
  if (data.availableCopies > data.totalCopies) throw fail(400, 'availableCopies cannot exceed totalCopies.', { availableCopies: ['Must not exceed totalCopies.'] });
  return data;
}

export async function listBooks(req, res) {
  const query = parse(z.object({ ...pagination, limit: pagination.limit.default(12), category: z.string().max(120).optional(), available: z.enum(['true', 'false']).optional(), search: z.string().trim().max(200).optional(), sort: z.enum(['title', '-title', 'year', '-year', 'newest']).optional() }).strict(), req.query);
  const { page, limit } = query;
  const filter = {};
  if (query.category) filter.category = query.category;
  if (query.available === 'true') filter.availableCopies = { $gt: 0 };
  if (query.search?.trim()) {
    const term = query.search.trim();
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['title', 'authors', 'description', 'isbn', 'tags', 'publisher'].map(key => ({ [key]: { $regex: safe, $options: 'i' } }));
  }
  const sortMap = { title: { title: 1 }, '-title': { title: -1 }, year: { publicationYear: 1 }, '-year': { publicationYear: -1 }, newest: { createdAt: -1 } };
  const sort = sortMap[query.sort] || { title: 1 };
  const [items, total] = await Promise.all([Book.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(), Book.countDocuments(filter)]);
  res.json({ success: true, message: 'Books retrieved.', data: { books: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}

export async function getBook(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(404, 'Book not found.');
  const book = await Book.findById(req.params.id).lean();
  if (!book) throw fail(404, 'Book not found.');
  const relatedBooks = await Book.find({ _id: { $ne: book._id }, category: book.category }).sort({ title: 1 }).limit(4).lean();
  res.json({ success: true, message: 'Book retrieved.', data: { book, relatedBooks } });
}

export async function createBook(req, res) {
  const data = validateInput(bookInput, req.body);
  const book = await Book.create(data);
  res.status(201).json({ success: true, message: 'Book created.', data: { book } });
}

export async function updateBook(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(404, 'Book not found.');
  const partialSchema = bookInput.partial().refine(v => Object.keys(v).length > 0, 'Provide at least one field to update.');
  const data = validateInput(partialSchema, req.body);
  const book = await withBookTransaction(req.params.id, async (book, session) => {
    const loans = await Borrow.countDocuments({ book: book._id, status: { $in: ACTIVE_BORROW } }).session(session);
    const holds = await Reservation.countDocuments({ book: book._id, status: 'READY' }).session(session);
    const total = data.totalCopies ?? book.totalCopies;
    // Unavailable copies can also represent damaged/withdrawn stock. Preserve that
    // allocation when only totalCopies changes; never overwrite committed loans/holds.
    const available = data.availableCopies ?? (book.availableCopies + total - book.totalCopies);
    if (available < 0 || available > total || total - available < loans + holds) throw fail(409, 'Inventory cannot remove copies that are on loan or held for reservations.');
    Object.assign(book, data, { totalCopies: total, availableCopies: available });
    await promoteReservations(book, session);
    return book;
  });
  res.json({ success: true, message: 'Book updated.', data: { book } });
}

export async function deleteBook(req, res) {
  const id = await withBookTransaction(req.params.id, async (book, session) => {
    const activeLoan = await Borrow.exists({ book: book._id, status: { $in: ACTIVE_BORROW } }).session(session);
    const activeHold = await Reservation.exists({ book: book._id, status: { $in: ACTIVE_RESERVATION } }).session(session);
    if (activeLoan || activeHold) throw fail(409, 'This book has active borrowings or reservations and cannot be deleted.');
    await BookChunk.deleteMany({ book: book._id }, { session });
    await SavedBook.deleteMany({ book: book._id }, { session });
    await book.deleteOne({ session });
    return String(book._id);
  });
  res.json({ success: true, message: 'Book deleted.', data: { id } });
}

export async function listCategories(req, res) {
  const categories = await Book.distinct('category');
  res.json({ success: true, message: 'Categories retrieved.', data: { categories: categories.sort((a, b) => a.localeCompare(b)) } });
}
