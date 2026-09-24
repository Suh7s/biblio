import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { fail } from '../utils/errors.js';

export function readClaims(req) {
  const bearer = req.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const token = req.cookies?.token || bearer;
  if (!token) throw fail(401, 'Authentication required.');
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!mongoose.isObjectIdOrHexString(claims.id || claims.sub)) throw new Error('Invalid subject');
    return claims;
  } catch { throw fail(401, 'Invalid or expired authentication token.'); }
}
export async function authenticate(req, res, next) {
  try {
    const claims = readClaims(req);
    const user = await User.findById(claims.id || claims.sub).select('+tokenVersion');
    if (!user || (claims.version ?? 0) !== (user.tokenVersion ?? 0)) throw fail(401, 'Your session has ended. Please sign in again.');
    // Authorization comes from current database state, never a stale role claim.
    req.user = { _id: user._id, id: String(user._id), role: user.role };
    res.set('Cache-Control', 'no-store');
    next();
  } catch (error) { next(error); }
}
export const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(fail(401, 'Authentication required.'));
  if (!roles.includes(req.user.role)) return next(fail(403, 'You do not have permission to perform this action.'));
  next();
};
