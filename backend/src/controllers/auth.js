import jwt from 'jsonwebtoken';
import { z } from 'zod';
import User from '../models/User.js';

const COOKIE = 'token';
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 });
const publicUser = user => ({ _id: user._id, name: user.name, email: user.email, role: user.role, interests: user.interests, createdAt: user.createdAt, updatedAt: user.updatedAt });
const registerSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254), password: z.string().min(8).max(128), interests: z.array(z.string().trim().min(1).max(80)).max(30).optional() }).strict();
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1) }).strict();
const invalid = (res, result) => res.status(400).json({ success: false, message: 'Request validation failed.', errors: result.error.flatten().fieldErrors });

export async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  const { name, email, password, interests = [] } = parsed.data;
  const user = await User.create({ name, email, password, interests });
  res.status(201).json({ success: true, message: 'Account created. Please sign in.', data: { user: publicUser(user) } });
}

export async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(parsed.data.password))) return res.status(401).json({ success: false, message: 'Email or password is incorrect.' });
  const token = jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, cookieOptions());
  res.json({ success: true, message: 'Signed in successfully.', data: { user: publicUser(user) } });
}

export function logout(_req, res) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
  res.json({ success: true, message: 'Signed out successfully.', data: {} });
}

export async function me(req, res) {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(401).json({ success: false, message: 'Authentication required.' });
  res.json({ success: true, message: 'Current user retrieved.', data: { user: publicUser(user) } });
}
