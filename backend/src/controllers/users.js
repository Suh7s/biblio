import { z } from 'zod';
import User from '../models/User.js';
import Borrow from '../models/Borrow.js';

const profileSchema = z.object({ name: z.string().trim().min(2).max(100).optional(), interests: z.array(z.string().trim().min(1).max(80)).max(30).optional() }).strict().refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.');
const publicUser = user => ({ _id: user._id, name: user.name, email: user.email, role: user.role, interests: user.interests, createdAt: user.createdAt, updatedAt: user.updatedAt });

export async function getProfile(req, res) {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
  res.json({ success: true, message: 'Profile retrieved.', data: { user: publicUser(user) } });
}

export async function updateProfile(req, res) {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Request validation failed.', errors: parsed.error.flatten().fieldErrors });
  const user = await User.findByIdAndUpdate(req.user._id, { $set: parsed.data }, { new: true, runValidators: true });
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
  res.json({ success: true, message: 'Profile updated.', data: { user: publicUser(user) } });
}

export async function history(req, res) {
  const borrows = await Borrow.find({ user: req.user._id }).populate('book').sort({ borrowedAt: -1 }).lean();
  res.json({ success: true, message: 'Reading history retrieved.', data: { history: borrows } });
}
