import crypto from 'crypto';

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const SECRET = process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'samstore-local-secret';

export function signToken(payload, ttlMs = 1000 * 60 * 60 * 24 * 7) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getBearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

export function requireAdmin(req) {
  const p = verifyToken(getBearer(req));
  return p && p.role === 'admin' ? p : null;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  try {
    const hash = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(String(expectedHash), 'hex');
    return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

export function checkAdminCredentials(username, password) {
  const expectedUser = process.env.ADMIN_USERNAME || 'SamirBoulefaa';
  const expectedPass = process.env.ADMIN_PASSWORD || 'Samirsami9@';
  const digest = (s) => crypto.createHash('sha256').update(String(s ?? '')).digest();
  const uMatch = crypto.timingSafeEqual(digest(username), digest(expectedUser));
  const pMatch = crypto.timingSafeEqual(digest(password), digest(expectedPass));
  return uMatch && pMatch;
}
