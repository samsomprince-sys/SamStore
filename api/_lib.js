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

/* ================= GLOBAL ANTI-FRAUD ENGINE ================= */

// Admin-tunable security knobs (persisted in site_content, read live before every gate)
export async function getSecurityConfig(supabase) {
  const fallback = { vpn: true, level: 'medium', limit: 3 };
  try {
    const { data } = await supabase.from('site_content').select('key, value').in('key', ['sec_vpn_block', 'sec_fp_level', 'sec_velocity_limit']);
    const m = {};
    (data || []).forEach((r) => (m[r.key] = r.value));
    return {
      vpn: m.sec_vpn_block !== '0',
      level: ['low', 'medium', 'high'].includes(m.sec_fp_level) ? m.sec_fp_level : 'medium',
      limit: Math.max(1, parseInt(m.sec_velocity_limit, 10) || 3),
    };
  } catch {
    return fallback;
  }
}

// Is this device/session currently frozen (24h) for suspicious behavior?
export async function isFrozen(supabase, fp, hw, ip) {
  try {
    const ors = [];
    if (fp) ors.push(`fp.eq.${fp}`);
    if (hw) ors.push(`hw.eq.${hw}`);
    if (ip) ors.push(`ip.eq.${ip}`);
    if (!ors.length) return null;
    const { data } = await supabase
      .from('fraud_flags')
      .select('*')
      .gt('frozen_until', new Date().toISOString())
      .or(ors.join(','))
      .limit(1);
    return (data && data[0]) || null;
  } catch (e) {
    console.error('frozen check', e);
    return null;
  }
}

// Behavioural velocity: counts events per bucket within a window; exceeding the limit freezes the actor 24h.
export async function velocityHit(supabase, { fp, hw, ip, bucket, limit, windowMs, actorType, actorId, reason }) {
  try {
    await supabase.from('fraud_events').insert({ fp: fp || null, hw: hw || null, ip: ip || null, bucket });
    const ors = [];
    if (fp) ors.push(`fp.eq.${fp}`);
    if (hw) ors.push(`hw.eq.${hw}`);
    if (ip) ors.push(`ip.eq.${ip}`);
    if (!ors.length) return { frozen: false };
    const since = new Date(Date.now() - windowMs).toISOString();
    const { data } = await supabase.from('fraud_events').select('id').eq('bucket', bucket).gt('created_at', since).or(ors.join(','));
    if ((data || []).length > limit) {
      await supabase.from('fraud_flags').insert({
        actor_type: actorType || null,
        actor_id: actorId || null,
        fp: fp || null,
        hw: hw || null,
        ip: ip || null,
        reason: reason || `rapid-fire velocity limit (${bucket})`,
        frozen_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      });
      return { frozen: true };
    }
  } catch (e) {
    console.error('velocity', e);
  }
  return { frozen: false };
}

// Free IP intelligence lookup: true when the connection route is a proxy/VPN/hosted node.
export async function isVpnIp(ip) {
  if (!ip || ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.16.') || ip === '::1') return false;
  try {
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`, {
      signal: AbortSignal.timeout(3500),
    });
    const j = await r.json();
    return j && j.status === 'success' ? !!(j.proxy || j.hosting) : false;
  } catch {
    return false; // fail-open: never block a legit user over a lookup outage
  }
}

// Locale-proof name matcher: NFC/NFD-safe, strips Arabic + Latin diacritics, collapses spaces.
export function normalizeName(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Canonical storage form for names (keeps display case, collapses odd spacing/encoding)
export function cleanName(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

// Deterministic referral code per merchant: M<id>-<6 hex>
export function refCodeFor(merchantId) {
  const h = crypto.createHash('sha256').update(`ref-salt-${merchantId}`).digest('hex').slice(0, 6);
  return `M${merchantId}-${h}`;
}

export function parseRefCode(code) {
  const m = /^M(\d+)-([a-f0-9]{6})$/i.exec(String(code || '').trim());
  if (!m) return null;
  const id = parseInt(m[1], 10);
  if (!id) return null;
  return refCodeFor(id).toLowerCase() === String(code).trim().toLowerCase() ? id : null;
}

// Retail customer challenge code: C<id>-<6 hex>
export function challengeCodeForCustomer(customerId) {
  const h = crypto.createHash('sha256').update(`chal-salt-${customerId}`).digest('hex').slice(0, 6);
  return `C${customerId}-${h}`;
}

// Unified invite link parser:
//  - M<id>-<hash6> (trader), C<id>-<hash6> (legacy buyer), or plain numeric <id> (current buyer format)
export function parseChallengeCode(code) {
  const raw = String(code || '').trim();
  // plain numeric database user id (retail buyer)
  const plain = /^(\d{1,10})$/.exec(raw);
  if (plain) return { type: 'customer', id: parseInt(plain[1], 10) };
  const m = /^([CM])(\d+)-([a-f0-9]{6})$/i.exec(raw);
  if (!m) return null;
  const type = m[1].toUpperCase() === 'M' ? 'merchant' : 'customer';
  const id = parseInt(m[2], 10);
  if (!id) return null;
  const expected = type === 'merchant' ? refCodeFor(id) : challengeCodeForCustomer(id);
  return expected.toLowerCase() === raw.toLowerCase() ? { type, id } : null;
}

export function getClientIp(req) {
  const h = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  return String(Array.isArray(h) ? h[0] : h).split(',')[0].trim();
}

// Password-only admin verification (constant-time)
export function checkAdminPassword(password) {
  const expected = process.env.ADMIN_PASSWORD || 'Samirsami9@';
  const digest = (s) => crypto.createHash('sha256').update(String(s ?? '')).digest();
  return crypto.timingSafeEqual(digest(password), digest(expected));
}

export function checkAdminCredentials(username, password) {
  const expectedUser = process.env.ADMIN_USERNAME || 'SamirBoulefaa';
  const expectedPass = process.env.ADMIN_PASSWORD || 'Samirsami9@';
  const digest = (s) => crypto.createHash('sha256').update(String(s ?? '')).digest();
  const uMatch = crypto.timingSafeEqual(digest(username), digest(expectedUser));
  const pMatch = crypto.timingSafeEqual(digest(password), digest(expectedPass));
  return uMatch && pMatch;
}
