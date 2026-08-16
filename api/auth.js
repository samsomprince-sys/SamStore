import supabase from './db-client.js';
import { setCors, signToken, verifyToken, getBearer, checkAdminCredentials, verifyPassword } from './_lib.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { type } = req.body || {};

    if (type === 'admin') {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
      if (!checkAdminCredentials(username, password)) {
        return res.status(401).json({ error: 'Invalid admin credentials' });
      }
      return res.status(200).json({ token: signToken({ role: 'admin', name: 'SamirBoulefaa' }), role: 'admin' });
    }

    if (type === 'merchant') {
      const { first_name, last_name, password } = req.body || {};
      if (!first_name || !last_name || !password) return res.status(400).json({ error: 'First name, last name and password are required' });
      const { data: merchants, error } = await supabase
        .from('merchants')
        .select('*')
        .ilike('first_name', String(first_name).trim())
        .ilike('last_name', String(last_name).trim())
        .limit(1);
      if (error) throw error;
      const m = merchants && merchants[0];
      if (!m || !verifyPassword(password, m.salt, m.password_hash)) {
        return res.status(401).json({ error: 'Invalid name or password' });
      }
      const token = signToken({ role: 'merchant', mid: m.id });
      return res.status(200).json({
        token,
        role: 'merchant',
        merchant: { id: m.id, first_name: m.first_name, last_name: m.last_name, status: m.status },
      });
    }

    if (type === 'verify') {
      const payload = verifyToken(getBearer(req));
      if (!payload) return res.status(401).json({ valid: false });
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
