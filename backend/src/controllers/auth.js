import jwt from 'jsonwebtoken';
import { z } from 'zod';
import User from '../models/User.js';
import { publicUser, cookieOptions } from '../utils/user.js';
import { readClaims } from '../middleware/auth.js';
import { parse, fail } from '../utils/errors.js';

const password = z.string().min(8).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.');
const registerSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254), password, interests: z.array(z.string().trim().min(1).max(80)).max(30).optional() }).strict();
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long.') }).strict();
export async function register(req, res) {
  const { name, email, password, interests = [] } = parse(registerSchema, req.body);
  const user = await User.create({ name, email, password, interests });
  res.status(201).json({ success: true, message: 'Account created. Please sign in.', data: { user: publicUser(user) } });
}
export async function login(req, res) {
  const input = parse(loginSchema, req.body);
  const user = await User.findOne({ email: input.email.toLowerCase() }).select('+password +tokenVersion');
  if (!user || !(await user.comparePassword(input.password))) throw fail(401, 'Email or password is incorrect.');
  const token = jwt.sign({ id: user.id, version: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
  res.cookie('token', token, { ...cookieOptions(), maxAge: 7 * 86400000 });
  res.set('Cache-Control', 'no-store').json({ success: true, message: 'Signed in successfully.', data: { user: publicUser(user) } });
}
export async function logout(req, res) {
  let claims;
  try { claims = readClaims(req); } catch (err) { if (err.status !== 401) throw err; }
  if (claims) await User.updateOne({ _id: claims.id || claims.sub, ...((claims.version ?? 0) === 0 ? { $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] } : { tokenVersion: claims.version }) }, { $inc: { tokenVersion: 1 } });
  res.clearCookie('token', cookieOptions());
  res.set('Cache-Control', 'no-store').json({ success: true, message: 'Signed out on all devices.', data: {} });
}
export async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user) throw fail(401, 'Authentication required.');
  res.json({ success: true, message: 'Current user retrieved.', data: { user: publicUser(user) } });
}
