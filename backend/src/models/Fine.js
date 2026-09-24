import mongoose from 'mongoose';

const fineSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  borrow: { type: mongoose.Schema.Types.ObjectId, ref: 'Borrow', required: true, unique: true },
  amount: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ['UNPAID', 'PAID'], default: 'UNPAID', index: true },
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model('Fine', fineSchema);
