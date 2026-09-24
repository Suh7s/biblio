// Read-only migration check. Run before deploying transaction-based circulation
// to an existing database. Repair discrepancies with library staff, not guesses.
import 'dotenv/config';
import mongoose from 'mongoose';
import Book from '../src/models/Book.js';
import Borrow from '../src/models/Borrow.js';
import Reservation from '../src/models/Reservation.js';
import BookChunk from '../src/models/BookChunk.js';
if (!process.env.MONGODB_URI) throw new Error('Configure MONGODB_URI.');
try {
  await mongoose.connect(process.env.MONGODB_URI);
  const issues = [];
  for await (const b of Book.find().lean().cursor()) {
    const loans = await Borrow.countDocuments({ book: b._id, status: { $in: ['BORROWED', 'OVERDUE'] } });
    const holds = await Reservation.countDocuments({ book: b._id, status: 'READY' });
    if (![b.totalCopies, b.availableCopies].every(Number.isInteger) || b.availableCopies < 0 || b.availableCopies + loans + holds > b.totalCopies) issues.push({ bookId: String(b._id), issue: 'invalid-inventory', total: b.totalCopies, available: b.availableCopies, loans, holds });
    const queue = await Reservation.find({ book: b._id, status: 'WAITING' }).sort({ position: 1, createdAt: 1 }).lean();
    if (queue.some((r, i) => r.position !== i + 1)) issues.push({ bookId: String(b._id), issue: 'queue-needs-compaction' });
  }
  for (const [model, filter] of [[Borrow, { status: { $in: ['BORROWED', 'OVERDUE'] } }], [Reservation, { status: { $in: ['WAITING', 'READY'] } }], [BookChunk, {}]]) {
    const orphans = await model.aggregate([{ $match: filter }, { $lookup: { from: 'books', localField: 'book', foreignField: '_id', as: 'bookRecord' } }, { $match: { bookRecord: { $size: 0 } } }, { $project: { _id: 1, book: 1 } }]);
    for (const row of orphans) issues.push({ collection: model.collection.name, id: String(row._id), bookId: String(row.book), issue: 'missing-book' });
  }
  for (const [model, statuses] of [[Borrow, ['BORROWED', 'OVERDUE']], [Reservation, ['WAITING', 'READY']]]) {
    const duplicates = await model.aggregate([{ $match: { status: { $in: statuses } } }, { $group: { _id: { user: '$user', book: '$book' }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]);
    for (const row of duplicates) issues.push({ collection: model.collection.name, userId: String(row._id.user), bookId: String(row._id.book), count: row.count, issue: 'duplicate-active-records' });
  }
  console.log(JSON.stringify({ issueCount: issues.length, issues }, null, 2));
  if (issues.length) process.exitCode = 1;
} finally { await mongoose.disconnect(); }
