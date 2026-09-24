import jwt from 'jsonwebtoken';

// Shared contract: attach the authenticated identity to req.user; modules can reuse these exports.
export function authenticate(req, res, next) {
  const token = req.cookies?.token || req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required.' });
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: claims.id || claims.sub, role: claims.role };
    if (!req.user.id) throw new Error('Missing subject');
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication token.' });
  }
}

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required.' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ success: false, message: 'You do not have permission to perform this action.' });
  next();
};
