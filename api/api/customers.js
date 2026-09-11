import supabase from './db-client.js';
import { setCors, hashPassword, signToken, cleanName, requireAdmin, getClientIp, isFrozen, velocityHit, isVpnIp, getSecurityConfig } from './_lib.js';

// Retail customers: registration (public) + admin listing with full profile details.
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    /* ---------------- GET: admin — full client list (like Marchands) ---------------- */
    if (req.method === 'GET') {
      if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
      const { data: customers, error } = await supabase
        .from('customers')
        .select('id, name, username, fp, created_at')
        .order('id', { ascending: false })
        .limit(500);
      if (error) throw error;
      const { data: profiles } = await supabase.from('customer_profiles').select('*');
      const profMap = {};
      (profiles || []).forEach((p) => (profMap[p.customer_id] = p));
      // orders count per client (by telegram username)
      const { data: ords } = await supabase.from('orders').select('buyer_telegram').limit(2000);
      const counts = {};
      (ords || []).forEach((o) => {
        const k = String(o.buyer_telegram || '').toLowerCase();
        counts[k] = (counts[k] || 0) + 1;
      });
      const out = (customers || []).map((c) => {
        const p = profMap[c.id] || {};
        return {
          id: c.id,
          name: c.name,
          username: c.username,
          phone: p.phone || null,
          wilaya: p.wilaya || null,
          fp: c.fp || null,
          created_at: c.created_at,
          orders_count: counts[String(c.username).toLowerCase()] || 0,
        };
      });
      return res.status(200).json(out);
    }

    /* ---------------- POST: public registration ---------------- */
    if (req.method === 'POST') {
      const b = req.body || {};
      const name = cleanName(b.name);
      // Identity = exact Name + Password (phone field removed globally)
      const username = (cleanName(b.username) || name).toLowerCase().replace(/\s+/g, ' ');
      const password = String(b.password || '');
      const wilaya = String(b.wilaya || '').trim();
      const fp = String(b.fp || '').slice(0, 64) || null;
      if (username.length < 2) return res.status(400).json({ error: 'Please enter your real name' });
      const hw = String(b.hw || '').slice(0, 64) || null;

      /* ---------- GLOBAL ANTI-FRAUD GATE: frozen? velocity? VPN? same physical device? ---------- */
      const secReg = await getSecurityConfig(supabase);
      const regIp = getClientIp(req);
      const frozenReg = await isFrozen(supabase, fp, hw, regIp);
      if (frozenReg) return res.status(423).json({ error: 'Suspicious Behavior — هذا الجهاز مجمّد مؤقتًا. Actions frozen for 24 hours.' });
      const velReg = await velocityHit(supabase, {
        fp,
        hw,
        ip: regIp,
        bucket: 'register',
        limit: secReg.limit,
        windowMs: 5 * 60 * 1000,
        actorType: 'customer',
        actorId: null,
        reason: 'rapid-fire registrations (bot velocity)',
      });
      if (velReg.frozen) return res.status(423).json({ error: 'Suspicious Behavior — هذا الجهاز مجمّد مؤقتًا. Actions frozen for 24 hours.' });
      if (secReg.vpn && (await isVpnIp(regIp))) {
        return res.status(403).json({ error: 'VPN/Proxy detected — أوقف الـ VPN ثم أعد التسجيل. Please disable your VPN.' });
      }
      if (fp) {
        const { data: dev } = await supabase.from('customers').select('id').eq('fp', fp).limit(1);
        if (dev && dev.length > 0) {
          if (secReg.level === 'low') {
            await supabase.from('fraud_flags').insert({ actor_type: 'customer', fp, hw, ip: regIp, reason: 'device fingerprint audit — duplicate account device (low sensitivity: flagged only)', frozen_until: null });
          } else {
            if (secReg.level === 'high') {
              await supabase.from('fraud_flags').insert({ actor_type: 'customer', fp, hw, ip: regIp, reason: 'device fingerprint audit — duplicate account device (high sensitivity)', frozen_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString() });
            }
            return res.status(409).json({ error: 'This device already has a registered account — يوجد حساب مسجل على هذا الجهاز بالفعل.' });
          }
        }
      }

      if (name.length < 2) return res.status(400).json({ error: 'Please enter your real name' });
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

      const { data: dup } = await supabase.from('customers').select('id').ilike('username', username).limit(1);
      if (dup && dup.length > 0) return res.status(409).json({ error: 'This username is already taken — try logging in' });

      const { salt, hash } = hashPassword(password);
      const { data, error } = await supabase
        .from('customers')
        .insert({ name, username, password_hash: hash, salt, fp })
        .select('id, name, username')
        .single();
      if (error) throw error;

      if (wilaya) {
        try {
          await supabase.from('customer_profiles').insert({ customer_id: data.id, phone: null, wilaya: wilaya || null });
        } catch (e) {
          console.error('profile save', e);
        }
      }

      const token = signToken({ role: 'customer', cid: data.id });
      return res.status(201).json({ token, customer: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('customers error', err);
    return res.status(500).json({ error: err.message });
  }
}
