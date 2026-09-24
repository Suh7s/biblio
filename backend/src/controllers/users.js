import { z } from 'zod';
import User from '../models/User.js';
import Borrow from '../models/Borrow.js';
import { publicUser } from '../utils/user.js';
import SavedBook from '../models/SavedBook.js';
import { withBookTransaction } from '../services/circulation.js';
import { parse, objectId, pagination, fail } from '../utils/errors.js';

const profileSchema = z.object({ name: z.string().trim().min(2).max(100).optional(), interests: z.array(z.string().trim().min(1).max(80)).max(30).optional() }).strict().refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.');

export async function getProfile(req, res) {
  const user = await User.findById(req.user._id);
  if (!user) throw fail(404, 'User not found.');
  res.json({ success: true, message: 'Profile retrieved.', data: { user: publicUser(user) } });
}

export async function updateProfile(req, res) {
  const data = parse(profileSchema, req.body);
  const user = await User.findByIdAndUpdate(req.user._id, { $set: data }, { new: true, runValidators: true });
  if (!user) throw fail(404, 'User not found.');
  res.json({ success: true, message: 'Profile updated.', data: { user: publicUser(user) } });
}

export async function history(req, res) {
  const borrows = await Borrow.find({ user: req.user._id }).populate('book').sort({ borrowedAt: -1 }).lean();
  res.json({ success: true, message: 'Reading history retrieved.', data: { history: borrows } });
}

export async function savedBooks(req, res) {
  const { page, limit } = parse(z.object(pagination).strict(), req.query);
  const filter = { user: req.user.id };
  const [items, total] = await Promise.all([
    SavedBook.find(filter).populate('book').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    SavedBook.countDocuments(filter)
  ]);
  res.json({ success: true, message: 'Saved books retrieved.', data: { savedBooks: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}
export async function saveBook(req, res) {
  const id = parse(objectId, req.params.bookId);
  const savedBook = await withBookTransaction(id, (book, session) => SavedBook.findOneAndUpdate(
    { user: req.user.id, book: book._id }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true, new: true, session, runValidators: true }
  ));
  res.json({ success: true, message: 'Book saved.', data: { savedBook } });
}
export async function unsaveBook(req, res) {
  const id = parse(objectId, req.params.bookId);
  await SavedBook.deleteOne({ user: req.user.id, book: id });
  res.json({ success: true, message: 'Book removed from saved books.', data: { bookId: id } });
}
