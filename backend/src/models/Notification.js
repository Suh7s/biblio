import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true, enum: ['BORROWED', 'DUE_SOON', 'OVERDUE', 'RETURNED', 'FINE', 'RESERVATION_PLACED', 'RESERVATION_READY', 'RESERVATION_EXPIRED'] },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  read: { type: Boolean, default: false, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

notificationSchema.index({ user: 1, createdAt: -1 });
export default mongoose.model('Notification', notificationSchema);
