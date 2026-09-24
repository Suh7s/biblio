import mongoose from 'mongoose';
import Book from '../models/Book.js';
import Borrow from '../models/Borrow.js';
import Reservation from '../models/Reservation.js';
import Fine from '../models/Fine.js';
import Notification from '../models/Notification.js';

const LOAN_DAYS = Number(process.env.LOAN_DAYS || 14);
const MAX_RENEWALS = Number(process.env.MAX_RENEWALS || 2);
const HOLD_DAYS = Number(process.env.RESERVATION_HOLD_DAYS || 3);
const FINE_PER_DAY = Number(process.env.FINE_PER_DAY || 1);
const ACTIVE_BORROW = ['BORROWED', 'OVERDUE'];
const ACTIVE_RESERVATION = ['WAITING', 'READY'];

const fail = (status, message) => Object.assign(new Error(message), { status });
const userId = req => req.user?._id || req.user?.id;
const validId = id => mongoose.isValidObjectId(id);
const plusDays = (date, days) => new Date(date.getTime() + days * 86400000);

async function notify(user, type, title, message, metadata = {}) {
  return Notification.create({ user, type, title, message, metadata });
}

// Hold copies are removed from public availability. Expired holds return to stock before the
// oldest waiting reservation is promoted. Atomic stock updates keep concurrent promotions safe.
async function promoteReservations(bookId) {
  const now = new Date();
  const expired = await Reservation.find({ book: bookId, status: 'READY', expiresAt: { $lte: now } }).select('_id user').lean();
  for (const hold of expired) {
    const released = await Reservation.findOneAndUpdate({ _id: hold._id, status: 'READY', expiresAt: { $lte: now } }, { $set: { status: 'EXPIRED' } });
    if (!released) continue;
    await Book.updateOne({ _id: bookId }, { $inc: { availableCopies: 1 } });
    await notify(hold.user, 'RESERVATION_EXPIRED', 'Reservation expired', 'Your reserved copy was released after the pickup window ended.', { bookId, reservationId: hold._id }).catch(() => {});
  }
  while (true) {
    const stock = await Book.findOneAndUpdate({ _id: bookId, availableCopies: { $gt: 0 } }, { $inc: { availableCopies: -1 } }, { new: true }).select('_id title');
    if (!stock) break;
    const next = await Reservation.findOneAndUpdate({ book: bookId, status: 'WAITING' }, { $set: { status: 'READY', expiresAt: plusDays(now, HOLD_DAYS) } }, { sort: { position: 1, createdAt: 1 }, new: true });
    if (!next) { await Book.updateOne({ _id: bookId }, { $inc: { availableCopies: 1 } }); break; }
    await notify(next.user, 'RESERVATION_READY', 'Your book is ready', `${stock.title} is ready for pickup. Please collect it within ${HOLD_DAYS} days.`, { bookId, reservationId: next._id, expiresAt: next.expiresAt }).catch(() => {});
  }
}

export async function borrowBook(req, res) {
  const uid = userId(req);
  if (!validId(req.params.bookId)) throw fail(404, 'Book not found.');
  await promoteReservations(req.params.bookId);
  const book = await Book.findById(req.params.bookId).select('title availableCopies totalCopies');
  if (!book) throw fail(404, 'Book not found.');
  if (await Borrow.exists({ user: uid, book: book._id, status: { $in: ACTIVE_BORROW } })) throw fail(409, 'You already have an active borrowing for this book.');
  const hold = await Reservation.findOne({ user: uid, book: book._id, status: 'READY', expiresAt: { $gt: new Date() } });
  if (!hold) {
    const stock = await Book.findOneAndUpdate({ _id: book._id, availableCopies: { $gt: 0 } }, { $inc: { availableCopies: -1 } }, { new: true }).select('_id');
    if (!stock) throw fail(409, 'No copies are currently available. Reserve this book to join the queue.');
  }
  const borrowedAt = new Date();
  let borrow;
  try {
    borrow = await Borrow.create({ user: uid, book: book._id, borrowedAt, dueDate: plusDays(borrowedAt, LOAN_DAYS), renewedCount: 0, status: 'BORROWED' });
  } catch (error) {
    // Restore a copy if creating the loan failed after stock was decremented.
    if (!hold) await Book.updateOne({ _id: book._id, availableCopies: { $lt: book.totalCopies } }, { $inc: { availableCopies: 1 } });
    if (error.code === 11000) throw fail(409, 'You already have an active borrowing for this book.');
    throw error;
  }
  if (hold) { hold.status = 'FULFILLED'; hold.expiresAt = null; await hold.save(); }
  await notify(uid, 'BORROWED', 'Book borrowed', `${book.title} is due on ${borrow.dueDate.toLocaleDateString()}.`, { bookId: book._id, borrowId: borrow._id, dueDate: borrow.dueDate }).catch(() => {});
  await borrow.populate('book');
  return res.status(201).json({ success: true, message: 'Book borrowed.', data: { borrow } });
}

export async function myBorrows(req, res) {
  const uid = userId(req); const now = new Date();
  await Borrow.updateMany({ user: uid, status: 'BORROWED', dueDate: { $lt: now } }, { $set: { status: 'OVERDUE' } });
  const borrows = await Borrow.find({ user: uid }).populate('book').sort({ borrowedAt: -1 }).lean();
  res.json({ success: true, message: 'Borrowing history retrieved.', data: { borrows } });
}

export async function returnBook(req, res) {
  const uid = userId(req); const id = req.params.id;
  if (!validId(id)) throw fail(404, 'Borrowing not found.');
  const borrow = await Borrow.findOne({ _id: id, user: uid, status: { $in: ACTIVE_BORROW } }).populate('book', 'title');
  if (!borrow) throw fail(404, 'Active borrowing not found for this user.');
  const returnedAt = new Date(); const wasOverdue = borrow.dueDate < returnedAt;
  const updated = await Borrow.findOneAndUpdate({ _id: id, user: uid, status: { $in: ACTIVE_BORROW } }, { $set: { status: 'RETURNED', returnedAt } }, { new: true }).populate('book');
  if (!updated) throw fail(409, 'This book has already been returned.');
  const inventory = await Book.findById(borrow.book._id).select('totalCopies');
  if (inventory) await Book.updateOne({ _id: inventory._id, availableCopies: { $lt: inventory.totalCopies } }, { $inc: { availableCopies: 1 } });
  let fine = null;
  if (wasOverdue) {
    const daysLate = Math.max(1, Math.ceil((returnedAt - borrow.dueDate) / 86400000));
    fine = await Fine.findOneAndUpdate({ borrow: borrow._id }, { $setOnInsert: { user: uid, borrow: borrow._id, amount: daysLate * FINE_PER_DAY, reason: `${daysLate} day${daysLate === 1 ? '' : 's'} overdue`, status: 'UNPAID', createdAt: returnedAt } }, { upsert: true, new: true });
    await notify(uid, 'FINE', 'Overdue fine added', `A fine of ${fine.amount} was added for returning ${borrow.book.title} late.`, { bookId: borrow.book._id, borrowId: borrow._id, fineId: fine._id }).catch(() => {});
  }
  await notify(uid, 'RETURNED', 'Book returned', `${borrow.book.title} has been checked in.`, { bookId: borrow.book._id, borrowId: borrow._id }).catch(() => {});
  await promoteReservations(borrow.book._id);
  res.json({ success: true, message: 'Book returned.', data: { borrow: updated, fine } });
}

export async function renewBook(req, res) {
  const uid = userId(req); const id = req.params.id;
  if (!validId(id)) throw fail(404, 'Borrowing not found.');
  const borrow = await Borrow.findOne({ _id: id, user: uid, status: 'BORROWED' }).populate('book', 'title');
  if (!borrow) throw fail(404, 'Active borrowing not found. Overdue or returned books cannot be renewed.');
  if (borrow.dueDate < new Date()) throw fail(409, 'This loan is overdue and cannot be renewed.');
  if (borrow.renewedCount >= MAX_RENEWALS) throw fail(409, `Renewal limit reached (${MAX_RENEWALS}).`);
  if (await Reservation.exists({ book: borrow.book._id, status: { $in: ['WAITING', 'READY'] } })) throw fail(409, 'This book has a reservation queue and cannot be renewed.');
  const updated = await Borrow.findOneAndUpdate({ _id: id, user: uid, status: 'BORROWED', renewedCount: { $lt: MAX_RENEWALS } }, { $inc: { renewedCount: 1 }, $set: { dueDate: plusDays(borrow.dueDate, LOAN_DAYS) } }, { new: true }).populate('book');
  if (!updated) throw fail(409, 'This loan has changed and can no longer be renewed.');
  await notify(uid, 'DUE_SOON', 'Loan renewed', `${borrow.book.title} is now due on ${updated.dueDate.toLocaleDateString()}.`, { bookId: borrow.book._id, borrowId: updated._id, dueDate: updated.dueDate }).catch(() => {});
  res.json({ success: true, message: 'Loan renewed.', data: { borrow: updated } });
}

export async function reserveBook(req, res) {
  const uid = userId(req); const bookId = req.params.bookId;
  if (!validId(bookId)) throw fail(404, 'Book not found.');
  await promoteReservations(bookId);
  const book = await Book.findById(bookId).select('title availableCopies');
  if (!book) throw fail(404, 'Book not found.');
  if (book.availableCopies > 0) throw fail(409, 'A copy is available now. Borrow it instead of reserving.');
  if (await Reservation.exists({ user: uid, book: bookId, status: { $in: ACTIVE_RESERVATION } })) throw fail(409, 'You already have an active reservation for this book.');
  const last = await Reservation.findOne({ book: bookId, status: { $in: ACTIVE_RESERVATION } }).sort({ position: -1 }).select('position').lean();
  const position = (last?.position || 0) + 1;
  let reservation;
  try { [reservation] = await Reservation.create([{ user: uid, book: bookId, position, status: 'WAITING' }]); }
  catch (error) { if (error.code === 11000) throw fail(409, 'You already have an active reservation for this book.'); throw error; }
  await notify(uid, 'RESERVATION_PLACED', 'Reservation placed', `You are number ${position} in the queue for ${book.title}.`, { bookId: book._id, reservationId: reservation._id, position }).catch(() => {});
  await reservation.populate('book');
  res.status(201).json({ success: true, message: 'Reservation placed.', data: { reservation } });
}

export async function myReservations(req, res) {
  const expiredBookIds = await Reservation.distinct('book', { user: userId(req), status: 'READY', expiresAt: { $lte: new Date() } });
  for (const bookId of expiredBookIds) await promoteReservations(bookId);
  const reservations = await Reservation.find({ user: userId(req) }).populate('book').sort({ createdAt: -1 }).lean();
  res.json({ success: true, message: 'Reservations retrieved.', data: { reservations } });
}

export async function cancelReservation(req, res) {
  const id = req.params.id; if (!validId(id)) throw fail(404, 'Reservation not found.');
  const reservation = await Reservation.findOneAndUpdate({ _id: id, user: userId(req), status: { $in: ACTIVE_RESERVATION } }, { $set: { status: 'CANCELLED', expiresAt: null } }, { new: false });
  if (!reservation) throw fail(404, 'Active reservation not found for this user.');
  const wasReady = reservation.status === 'READY';
  if (wasReady) { await Book.updateOne({ _id: reservation.book }, { $inc: { availableCopies: 1 } }); await promoteReservations(reservation.book); }
  res.json({ success: true, message: 'Reservation cancelled.', data: { reservation } });
}

export async function myFines(req, res) {
  const fines = await Fine.find({ user: userId(req) }).populate({ path: 'borrow', populate: { path: 'book', select: 'title authors isbn' } }).sort({ createdAt: -1 }).lean();
  const totalUnpaid = fines.filter(f => f.status === 'UNPAID').reduce((sum, f) => sum + f.amount, 0);
  res.json({ success: true, message: 'Fines retrieved.', data: { fines, totalUnpaid } });
}

export async function listNotifications(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1); const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const [notifications, total, unread] = await Promise.all([Notification.find({ user: userId(req) }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Notification.countDocuments({ user: userId(req) }), Notification.countDocuments({ user: userId(req), read: false })]);
  res.json({ success: true, message: 'Notifications retrieved.', data: { notifications, unread, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}

export async function markNotificationRead(req, res) {
  if (!validId(req.params.id)) throw fail(404, 'Notification not found.');
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, user: userId(req) }, { $set: { read: true } }, { new: true });
  if (!notification) throw fail(404, 'Notification not found.');
  res.json({ success: true, message: 'Notification marked as read.', data: { notification } });
}
