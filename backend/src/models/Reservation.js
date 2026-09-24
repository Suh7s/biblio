import mongoose from 'mongoose';

const reservationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
  position: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['WAITING', 'READY', 'FULFILLED', 'CANCELLED', 'EXPIRED'], default: 'WAITING', index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, default: null }
}, { timestamps: true });

reservationSchema.index({ user: 1, book: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['WAITING', 'READY'] } } });
reservationSchema.index({ status: 1, expiresAt: 1, book: 1 });
reservationSchema.index({ book: 1, status: 1, position: 1 });
export default mongoose.model('Reservation', reservationSchema);
