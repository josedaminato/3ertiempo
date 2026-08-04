export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ ok: false, error: 'No autenticado' });
  }
  next();
}

export function sessionUser(req) {
  return req.session?.user || null;
}
