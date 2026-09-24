import mongoose from 'mongoose';
import Book from '../models/Book.js';
import Borrow from '../models/Borrow.js';
import Reservation from '../models/Reservation.js';
import Fine from '../models/Fine.js';

const ACTIVE_BORROW = ['BORROWED', 'OVERDUE'];
const ACTIVE_RESERVATION = ['WAITING', 'READY'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pageArgs = query => ({
  page: clamp(Number.parseInt(query.page, 10) || 1, 1, 1000000),
  limit: clamp(Number.parseInt(query.limit, 10) || 25, 1, 100)
});
const fail = (status, message) => Object.assign(new Error(message), { status });
const validId = id => mongoose.isValidObjectId(id);
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toMonth = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
function monthBuckets(months = 12) {
  const now = new Date();
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - index - 1), 1));
    return { month: toMonth(date), count: 0 };
  });
}

export async function dashboard(req, res) {
  const now = new Date();
  const lowAvailabilityLimit = clamp(Number.parseInt(req.query.lowAvailability, 10) || 2, 0, 50);
  const [totalBooks, totalUsers, activeBorrowings, overdue, activeReservations, fines, popularBooks, popularCategories, recentActivity, overdueBooks, lowInventory] = await Promise.all([
    Book.countDocuments(),
    mongoose.connection.db.collection('users').countDocuments(),
    Borrow.countDocuments({ status: { $in: ACTIVE_BORROW } }),
    Borrow.countDocuments({ $or: [{ status: 'OVERDUE' }, { status: 'BORROWED', dueDate: { $lt: now } }] }),
    Reservation.countDocuments({ status: { $in: ACTIVE_RESERVATION } }),
    Fine.aggregate([{ $match: { status: 'UNPAID' } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Borrow.aggregate([
      { $group: { _id: '$book', borrowCount: { $sum: 1 } } }, { $sort: { borrowCount: -1 } }, { $limit: 5 },
      { $lookup: { from: 'books', localField: '_id', foreignField: '_id', as: 'book' } }, { $unwind: '$book' },
      { $project: { _id: '$book._id', title: '$book.title', authors: '$book.authors', category: '$book.category', borrowCount: 1 } }
    ]),
    Borrow.aggregate([
      { $lookup: { from: 'books', localField: 'book', foreignField: '_id', as: 'book' } }, { $unwind: '$book' },
      { $group: { _id: '$book.category', borrowCount: { $sum: 1 } } }, { $sort: { borrowCount: -1 } }, { $limit: 6 },
      { $project: { _id: 0, category: '$_id', borrowCount: 1 } }
    ]),
    Borrow.aggregate([
      { $sort: { borrowedAt: -1 } }, { $limit: 8 },
      { $lookup: { from: 'books', localField: 'book', foreignField: '_id', as: 'book' } }, { $unwind: { path: '$book', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'user' } }, { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, status: 1, borrowedAt: 1, dueDate: 1, returnedAt: 1, book: { _id: '$book._id', title: '$book.title' }, user: { _id: '$user._id', name: '$user.name', email: '$user.email' } } }
    ]),
    Borrow.aggregate([
      { $match: { $or: [{ status: 'OVERDUE' }, { status: 'BORROWED', dueDate: { $lt: now } }] } }, { $sort: { dueDate: 1 } }, { $limit: 8 },
      { $lookup: { from: 'books', localField: 'book', foreignField: '_id', as: 'book' } }, { $unwind: { path: '$book', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'user' } }, { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, status: 1, borrowedAt: 1, dueDate: 1, book: { _id: '$book._id', title: '$book.title' }, user: { _id: '$user._id', name: '$user.name', email: '$user.email' } } }
    ]),
    Book.find({ availableCopies: { $lte: lowAvailabilityLimit } }).select('title authors category availableCopies totalCopies shelfLocation').sort({ availableCopies: 1, title: 1 }).limit(8).lean()
  ]);
  const outstandingFines = fines[0] || { total: 0, count: 0 };
  res.json({ success: true, message: 'Admin dashboard retrieved.', data: {
    totalBooks, totalUsers, activeBorrowings, overdue, activeReservations, reservations: activeReservations,
    outstandingFines: outstandingFines.total, unpaidFineCount: outstandingFines.count,
    popularBooks, popularCategories, recentActivity, overdueBooks, lowInventory
  } });
}

export async function listUsers(req, res) {
  const { page, limit } = pageArgs(req.query);
  const collection = mongoose.connection.db.collection('users');
  const filter = {};
  if (typeof req.query.role === 'string' && ['USER', 'ADMIN'].includes(req.query.role.toUpperCase())) filter.role = req.query.role.toUpperCase();
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
  if (search) {
    const term = escapeRegex(search);
    filter.$or = [{ name: { $regex: term, $options: 'i' } }, { email: { $regex: term, $options: 'i' } }];
  }
  const [users, total] = await Promise.all([
    collection.find(filter, { projection: { name: 1, email: 1, role: 1, profile: 1, interests: 1, createdAt: 1, updatedAt: 1 } }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
    collection.countDocuments(filter)
  ]);
  res.json({ success: true, message: 'Users retrieved.', data: { users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}

export async function listBorrowings(req, res) {
  const { page, limit } = pageArgs(req.query);
  const filter = {};
  if (['BORROWED', 'OVERDUE', 'RETURNED'].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.userId) {
    if (!validId(req.query.userId)) throw fail(400, 'userId must be a valid id.');
    filter.user = new mongoose.Types.ObjectId(req.query.userId);
  }
  const [borrowings, total] = await Promise.all([
    Borrow.find(filter).populate('book', 'title authors isbn category').sort({ borrowedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Borrow.countDocuments(filter)
  ]);
  const userIds = [...new Set(borrowings.map(item => String(item.user)))].map(id => new mongoose.Types.ObjectId(id));
  const users = await mongoose.connection.db.collection('users').find({ _id: { $in: userIds } }, { projection: { name: 1, email: 1, role: 1 } }).toArray();
  const userMap = new Map(users.map(user => [String(user._id), user]));
  const rows = borrowings.map(item => ({ ...item, user: userMap.get(String(item.user)) || { _id: item.user } }));
  res.json({ success: true, message: 'Borrowings retrieved.', data: { borrowings: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}

export async function listReservations(req, res) {
  const { page, limit } = pageArgs(req.query);
  const filter = {};
  if (['WAITING', 'READY', 'FULFILLED', 'CANCELLED', 'EXPIRED'].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.bookId) {
    if (!validId(req.query.bookId)) throw fail(400, 'bookId must be a valid id.');
    filter.book = new mongoose.Types.ObjectId(req.query.bookId);
  }
  const [reservations, total] = await Promise.all([
    Reservation.find(filter).populate('book', 'title authors isbn category').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Reservation.countDocuments(filter)
  ]);
  const userIds = [...new Set(reservations.map(item => String(item.user)))].map(id => new mongoose.Types.ObjectId(id));
  const users = await mongoose.connection.db.collection('users').find({ _id: { $in: userIds } }, { projection: { name: 1, email: 1, role: 1 } }).toArray();
  const userMap = new Map(users.map(user => [String(user._id), user]));
  const rows = reservations.map(item => ({ ...item, user: userMap.get(String(item.user)) || { _id: item.user } }));
  res.json({ success: true, message: 'Reservations retrieved.', data: { reservations: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}

export async function analytics(req, res) {
  const now = new Date();
  const months = monthBuckets(12);
  const since = new Date(`${months[0].month}-01T00:00:00.000Z`);
  const lowAvailabilityLimit = clamp(Number.parseInt(req.query.lowAvailability, 10) || 2, 0, 50);
  const [borrowTrend, overdueTrend, reservationTrend, popularBooks, popularCategories, lowAvailability, inactiveInventory] = await Promise.all([
    Borrow.aggregate([{ $match: { borrowedAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$borrowedAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Borrow.aggregate([{ $match: { $or: [{ status: 'OVERDUE' }, { status: 'BORROWED', dueDate: { $lt: now } }] } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$dueDate' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Reservation.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Borrow.aggregate([{ $group: { _id: '$book', borrowCount: { $sum: 1 } } }, { $sort: { borrowCount: -1 } }, { $limit: 10 }, { $lookup: { from: 'books', localField: '_id', foreignField: '_id', as: 'book' } }, { $unwind: '$book' }, { $project: { _id: '$book._id', title: '$book.title', authors: '$book.authors', category: '$book.category', borrowCount: 1 } }]),
    Borrow.aggregate([{ $lookup: { from: 'books', localField: 'book', foreignField: '_id', as: 'book' } }, { $unwind: '$book' }, { $group: { _id: '$book.category', borrowCount: { $sum: 1 } } }, { $sort: { borrowCount: -1 } }, { $limit: 10 }, { $project: { _id: 0, category: '$_id', borrowCount: 1 } }]),
    Book.find({ availableCopies: { $lte: lowAvailabilityLimit } }).select('title authors category availableCopies totalCopies shelfLocation').sort({ availableCopies: 1, title: 1 }).limit(50).lean(),
    Book.aggregate([
      { $lookup: { from: 'borrows', let: { bookId: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$book', '$$bookId'] }, { $gte: ['$borrowedAt', since] }] } } }, { $limit: 1 }, { $project: { _id: 1 } }], as: 'recentBorrows' } },
      { $match: { recentBorrows: { $size: 0 } } }, { $project: { recentBorrows: 0 } }, { $sort: { updatedAt: -1, title: 1 } }, { $limit: 50 }
    ])
  ]);
  const fill = rows => { const map = new Map(rows.map(row => [row._id, row.count])); return months.map(bucket => ({ ...bucket, count: map.get(bucket.month) || 0 })); };
  res.json({ success: true, message: 'Analytics retrieved.', data: {
    borrowingTrends: fill(borrowTrend), overdueTrends: fill(overdueTrend), reservationDemand: fill(reservationTrend),
    mostBorrowedBooks: popularBooks, popularCategories, lowAvailability, inactiveInventory
  } });
}
