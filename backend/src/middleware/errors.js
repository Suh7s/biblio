export function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Route not found.', errors: {} });
}
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599 ? err.status : 500;
  let message = err.message || 'Request failed.', errors = err.errors || {};
  if (err.name === 'ValidationError') {
    status = 400; message = 'Validation failed.';
    errors = Object.fromEntries(Object.entries(err.errors).map(([key, value]) => [key, [value.message]]));
  } else if (err.name === 'CastError') {
    status = 400; message = 'Invalid resource ID or field value.'; errors = {};
  } else if (err.code === 11000) {
    status = 409; message = 'A matching record already exists.'; errors = {};
  } else if (err.type === 'entity.parse.failed') {
    status = 400; message = 'Request body must be valid JSON.'; errors = {};
  } else if (err.type === 'entity.too.large') {
    status = 413; message = 'Request body is too large.'; errors = {};
  } else if (['MongoServerSelectionError', 'MongoNetworkError'].includes(err.name)) {
    status = 503; message = 'The library database is temporarily unavailable.'; errors = {};
  }
  if (status === 500) { message = 'Internal server error.'; errors = {}; }
  res.status(status).json({ success: false, message, errors });
}
