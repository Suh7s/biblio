import { z } from 'zod';
import Borrow from '../models/Borrow.js';
import Reservation from '../models/Reservation.js';
import Fine from '../models/Fine.js';
import Notification from '../models/Notification.js';
import { fail, parse, objectId, pagination } from '../utils/errors.js';
import { ACTIVE_BORROW, ACTIVE_RESERVATION, plusDays, notify, withBookTransaction, promoteReservations, compactQueue, expireReservations } from '../services/circulation.js';

const uid = req => req.user.id;
const loanDays = () => Number(process.env.LOAN_DAYS || 14);
export async function borrowBook(req, res) {
  // Expiration commits even if the later borrowing request is rejected.
  await withBookTransaction(req.params.bookId, (book, session) => promoteReservations(book, session));
  const borrow = await withBookTransaction(req.params.bookId, async (book, session) => {
    await promoteReservations(book, session);
    if (await Borrow.exists({ user: uid(req), book: book._id, status: { $in: ACTIVE_BORROW } }).session(session)) throw fail(409, 'You already have an active borrowing for this book.');
    const hold = await Reservation.findOne({ user: uid(req), book: book._id, status: 'READY', expiresAt: { $gt: new Date() } }).session(session);
    if (!hold && book.availableCopies < 1) throw fail(409, 'No copies are currently available. Reserve this book to join the queue.');
    if (hold) { hold.status = 'FULFILLED'; hold.expiresAt = null; await hold.save({ session }); }
    else { book.availableCopies--; await book.save({ session }); }
    const borrowedAt = new Date();
    const [loan] = await Borrow.create([{ user: uid(req), book: book._id, borrowedAt, dueDate: plusDays(borrowedAt, loanDays()), status: 'BORROWED' }], { session });
    await notify(session, uid(req), 'BORROWED', 'Book borrowed', `${book.title} is due on ${loan.dueDate.toISOString().slice(0, 10)}.`, { bookId: book._id, borrowId: loan._id });
    await loan.populate('book'); return loan;
  });
  res.status(201).json({ success: true, message: 'Book borrowed.', data: { borrow } });
}
export async function myBorrows(req, res) {
  await Borrow.updateMany({ user: uid(req), status: 'BORROWED', dueDate: { $lt: new Date() } }, { $set: { status: 'OVERDUE' } });
  const borrows = await Borrow.find({ user: uid(req) }).populate('book').sort({ borrowedAt: -1 }).lean();
  res.json({ success: true, message: 'Borrowing history retrieved.', data: { borrows } });
}
async function findOwnedLoan(req) {
  const id = parse(objectId, req.params.id);
  const loan = await Borrow.findOne({ _id: id, user: uid(req) }).select('book');
  if (!loan) throw fail(404, 'Borrowing not found for this user.');
  return loan;
}
export async function returnBook(req, res) {
  const found = await findOwnedLoan(req);
  const data = await withBookTransaction(found.book, async (book, session) => {
    const loan = await Borrow.findOne({ _id: found._id, user: uid(req), status: { $in: ACTIVE_BORROW } }).session(session);
    if (!loan) throw fail(409, 'This loan has already been returned.');
    const returnedAt = new Date(); loan.status = 'RETURNED'; loan.returnedAt = returnedAt;
    await loan.save({ session }); book.availableCopies++;
    let fine = null;
    if (loan.dueDate < returnedAt) {
      const days = Math.max(1, Math.ceil((returnedAt - loan.dueDate) / 86400000));
      const amount = Math.round(days * Number(process.env.FINE_PER_DAY ?? 1) * 100) / 100;
      [fine] = await Fine.create([{ user: uid(req), borrow: loan._id, amount, reason: `${days} day(s) overdue`, status: 'UNPAID' }], { session });
      await notify(session, uid(req), 'FINE', 'Overdue fine added', `A fine of ${amount} was added for ${book.title}.`, { bookId: book._id, borrowId: loan._id, fineId: fine._id });
    }
    await notify(session, uid(req), 'RETURNED', 'Book returned', `${book.title} has been checked in.`, { bookId: book._id, borrowId: loan._id });
    await promoteReservations(book, session);
    await loan.populate('book'); return { borrow: loan, fine };
  });
  res.json({ success: true, message: 'Book returned.', data });
}
export async function renewBook(req, res) {
  const found = await findOwnedLoan(req);
  const borrow = await withBookTransaction(found.book, async (book, session) => {
    const loan = await Borrow.findOne({ _id: found._id, user: uid(req), status: 'BORROWED' }).session(session);
    if (!loan || loan.dueDate < new Date()) throw fail(409, 'Only an active, non-overdue loan can be renewed.');
    if (loan.renewedCount >= Number(process.env.MAX_RENEWALS ?? 2)) throw fail(409, 'Renewal limit reached.');
    if (await Reservation.exists({ book: book._id, status: { $in: ACTIVE_RESERVATION } }).session(session)) throw fail(409, 'This book has a reservation queue and cannot be renewed.');
    loan.renewedCount++; loan.dueDate = plusDays(loan.dueDate, loanDays()); await loan.save({ session });
    await notify(session, uid(req), 'DUE_SOON', 'Loan renewed', `${book.title} is now due on ${loan.dueDate.toISOString().slice(0, 10)}.`, { bookId: book._id, borrowId: loan._id });
    await loan.populate('book'); return loan;
  });
  res.json({ success: true, message: 'Loan renewed.', data: { borrow } });
}
export async function reserveBook(req, res) {
  await withBookTransaction(req.params.bookId, (book, session) => promoteReservations(book, session));
  const reservation = await withBookTransaction(req.params.bookId, async (book, session) => {
    if (book.availableCopies > 0) throw fail(409, 'A copy is available. Borrow it instead of reserving.');
    if (await Borrow.exists({ book: book._id, user: uid(req), status: { $in: ACTIVE_BORROW } }).session(session)) throw fail(409, 'You already have this book on loan.');
    if (await Reservation.exists({ book: book._id, user: uid(req), status: { $in: ACTIVE_RESERVATION } }).session(session)) throw fail(409, 'You already have an active reservation.');
    const waiting = await Reservation.countDocuments({ book: book._id, status: 'WAITING' }).session(session);
    const [entry] = await Reservation.create([{ book: book._id, user: uid(req), position: waiting + 1, status: 'WAITING' }], { session });
    await notify(session, uid(req), 'RESERVATION_PLACED', 'Reservation placed', `You are number ${entry.position} in the queue for ${book.title}.`, { bookId: book._id, reservationId: entry._id });
    await entry.populate('book'); return entry;
  });
  res.status(201).json({ success: true, message: 'Reservation placed.', data: { reservation } });
}
export async function myReservations(req, res) {
  await expireReservations(uid(req));
  const reservations = await Reservation.find({ user: uid(req) }).populate('book').sort({ createdAt: -1 }).lean();
  res.json({ success: true, message: 'Reservations retrieved.', data: { reservations } });
}
export async function cancelReservation(req, res) {
  const id = parse(objectId, req.params.id);
  const found = await Reservation.findOne({ _id: id, user: uid(req) }).select('book');
  if (!found) throw fail(404, 'Reservation not found for this user.');
  const reservation = await withBookTransaction(found.book, async (book, session) => {
    const entry = await Reservation.findOne({ _id: id, user: uid(req), status: { $in: ACTIVE_RESERVATION } }).session(session);
    if (!entry) throw fail(409, 'This reservation is already closed.');
    if (entry.status === 'READY') book.availableCopies++;
    entry.status = 'CANCELLED'; entry.expiresAt = null; await entry.save({ session });
    await compactQueue(book._id, session); await promoteReservations(book, session);
    return entry;
  });
  res.json({ success: true, message: 'Reservation cancelled.', data: { reservation } });
}
export async function myFines(req, res) {
  const fines = await Fine.find({ user: uid(req) }).populate({ path: 'borrow', populate: { path: 'book', select: 'title authors isbn' } }).sort({ createdAt: -1 }).lean();
  const totalUnpaid = Math.round(fines.filter(f => f.status === 'UNPAID').reduce((sum, f) => sum + f.amount, 0) * 100) / 100;
  res.json({ success: true, message: 'Fines retrieved.', data: { fines, totalUnpaid } });
}
export async function listNotifications(req, res) {
  const { page, limit } = parse(z.object(pagination).strict(), req.query);
  const [notifications, total, unread] = await Promise.all([Notification.find({ user: uid(req) }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Notification.countDocuments({ user: uid(req) }), Notification.countDocuments({ user: uid(req), read: false })]);
  res.json({ success: true, message: 'Notifications retrieved.', data: { notifications, unread, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}
export async function markNotificationRead(req, res) {
  const id = parse(objectId, req.params.id);
  const notification = await Notification.findOneAndUpdate({ _id: id, user: uid(req) }, { $set: { read: true } }, { new: true });
  if (!notification) throw fail(404, 'Notification not found for this user.');
  res.json({ success: true, message: 'Notification marked as read.', data: { notification } });
}
