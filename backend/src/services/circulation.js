import mongoose from 'mongoose';
import Book from '../models/Book.js';
import Reservation from '../models/Reservation.js';
import Notification from '../models/Notification.js';
import { fail } from '../utils/errors.js';

export const ACTIVE_BORROW = ['BORROWED', 'OVERDUE'];
export const ACTIVE_RESERVATION = ['WAITING', 'READY'];
export const plusDays = (date, days) => new Date(date.getTime() + days * 86400000);
export async function notify(session, user, type, title, message, metadata = {}) {
  await Notification.create([{ user, type, title, message, metadata }], { session });
}
// Every stock/queue mutation first writes the same Book document. MongoDB retries
// conflicting transactions, so separate API instances serialize per book too.
export async function withBookTransaction(bookId, action) {
  if (!mongoose.isObjectIdOrHexString(bookId)) throw fail(404, 'Book not found.');
  return mongoose.connection.transaction(async session => {
    const book = await Book.findOneAndUpdate({ _id: bookId }, { $inc: { circulationVersion: 1 } }, { new: true, session });
    if (!book) throw fail(404, 'Book not found.');
    return action(book, session);
  });
}
export async function compactQueue(bookId, session) {
  const waiting = await Reservation.find({ book: bookId, status: 'WAITING' }).sort({ position: 1, createdAt: 1, _id: 1 }).session(session);
  for (let i = 0; i < waiting.length; i++) {
    if (waiting[i].position !== i + 1) { waiting[i].position = i + 1; await waiting[i].save({ session }); }
  }
}
export async function promoteReservations(book, session, now = new Date()) {
  const expired = await Reservation.find({ book: book._id, status: 'READY', expiresAt: { $lte: now } }).session(session);
  for (const hold of expired) {
    hold.status = 'EXPIRED'; hold.expiresAt = null; await hold.save({ session });
    book.availableCopies++;
    await notify(session, hold.user, 'RESERVATION_EXPIRED', 'Reservation expired', 'Your pickup window ended and the reserved copy was released.', { bookId: book._id, reservationId: hold._id });
  }
  while (book.availableCopies > 0) {
    const next = await Reservation.findOne({ book: book._id, status: 'WAITING' }).sort({ position: 1, createdAt: 1, _id: 1 }).session(session);
    if (!next) break;
    next.status = 'READY'; next.expiresAt = plusDays(now, Number(process.env.RESERVATION_HOLD_DAYS || 3));
    await next.save({ session }); book.availableCopies--;
    await notify(session, next.user, 'RESERVATION_READY', 'Your book is ready', `${book.title} is ready for pickup.`, { bookId: book._id, reservationId: next._id, expiresAt: next.expiresAt });
  }
  await compactQueue(book._id, session);
  await book.save({ session });
}
export async function expireReservations(user) {
  const books = await Reservation.distinct('book', { ...(user ? { user } : {}), status: 'READY', expiresAt: { $lte: new Date() } });
  for (const id of books) {
    try { await withBookTransaction(id, (book, session) => promoteReservations(book, session)); }
    catch (error) { if (error.status !== 404) throw error; }
  }
}
