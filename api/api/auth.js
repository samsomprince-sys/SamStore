import supabase from './db-client.js';
import { setCors, signToken, verifyToken, getBearer, checkAdminPassword, verifyPassword, normalizeName } from './_lib.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { type } = req.body || {};

    if (type === 'admin') {
      // PASSWORD-ONLY gate: no username is required or checked anymore
      const { password } = req.body || {};
      if (!password) return res.status(400).json({ error: 'Password is required' });
      if (!checkAdminPassword(password)) {
        return res.status(401).json({ error: 'Invalid admin password' });
      }
      return res.status(200).json({ token: signToken({ role: 'admin', name: 'SamirBoulefaa' }), role: 'admin' });
    }

    if (type === 'merchant') {
      const { first_name, last_name, password } = req.body || {};
      if (!first_name || !last_name || !password) return res.status(400).json({ error: 'First name, last name and password are required' });
      // Tolerant match: normalize case / accents (Arabic & Latin) / spacing on BOTH sides,
      // so names typed slightly differently at login still match the registered row.
      const targetF = normalizeName(first_name);
      const targetL = normalizeName(last_name);
      const { data: merchants, error } = await supabase.from('merchants').select('*').limit(1000);
      if (error) throw error;
      const m = (merchants || []).find(
        (x) => normalizeName(x.first_name) === targetF && normalizeName(x.last_name) === targetL
      );
      if (!m || !verifyPassword(password, m.salt, m.password_hash)) {
        return res.status(401).json({ error: 'Invalid name or password' });
      }
      const token = signToken({ role: 'merchant', mid: m.id });
      return res.status(200).json({
        token,
        role: 'merchant',
        merchant: { id: m.id, first_name: m.first_name, last_name: m.last_name, status: m.status },
        // Clear pending-approval notice instead of any credential-looking error
        status_notice:
          m.status !== 'approved' ? "Votre compte est en attente d'approbation (قيد المراجعة للأدمن)" : null,
      });
    }

    if (type === 'customer') {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
      // Name-based identity: tolerant match (case / accents / spacing) on name OR stored username
      const targetU = normalizeName(String(username).replace(/^@+/, ''));
      const { data: rows, error } = await supabase.from('customers').select('*').limit(2000);
      if (error) throw error;
      const c = (rows || []).find(
        (x) => normalizeName(x.username) === targetU || normalizeName(x.name) === targetU
      );
      if (!c || !verifyPassword(password, c.salt, c.password_hash)) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      const token = signToken({ role: 'customer', cid: c.id });
      return res.status(200).json({ token, role: 'customer', customer: { id: c.id, name: c.name, username: c.username } });
    }

    if (type === 'verify') {
      const payload = verifyToken(getBearer(req));
      if (!payload) return res.status(401).json({ valid: false });
      if (payload.role === 'customer') {
        const { data: c, error: cErr } = await supabase
          .from('customers')
          .select('id, name, username')
          .eq('id', payload.cid)
          .single();
        if (cErr || !c) return res.status(401).json({ valid: false });
        return res.status(200).json({ valid: true, role: 'customer', customer: c });
      }
      if (payload.role === 'merchant') {
        const { data: m, error } = await supabase
          .from('merchants')
          .select('id, first_name, last_name, status')
          .eq('id', payload.mid)
          .single();
        if (error || !m) return res.status(401).json({ valid: false });
        return res.status(200).json({ valid: true, role: 'merchant', merchant: m });
      }
      return res.status(200).json({ valid: true, role: payload.role });
    }

    return res.status(400).json({ error: 'Unknown auth type' });
  } catch (err) {
    console.error('auth error', err);
    return res.status(500).json({ error: err.message });
  }
}
