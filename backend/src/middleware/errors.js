export function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err.status || (err.name === 'ValidationError' ? 400 : err.code === 11000 ? 409 : 500);
  const message = status === 500 ? 'Internal server error.' : (err.message || 'Request failed.');
  res.status(status).json({ success: false, message, ...(err.errors ? { errors: err.errors } : {}) });
}
