import supabase from './db-client.js';
import { setCors, requireAdmin } from './_lib.js';

// Lightweight real-time presence: heartbeat (public) + admin read of last-45s sessions.
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'POST') {
      const b = req.body || {};
      const sid = String(b.session_id || '').slice(0, 64);
      const role = ['guest', 'customer', 'merchant', 'admin'].includes(b.role) ? b.role : 'guest';
      const page = String(b.page || 'Store').slice(0, 80);
      const intent = Math.min(99, Math.max(0, parseInt(b.intent, 10) || 0));
      if (!sid) return res.status(400).json({ error: 'session_id required' });
      await supabase.from('live_sessions').delete().eq('session_id', sid);
      const { error } = await supabase
        .from('live_sessions')
        .insert({ session_id: sid, role, page, intent, updated_at: new Date().toISOString() });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
      if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });

      // purge stale heartbeat rows (> 3 min inactive)
      try {
        await supabase.from('live_sessions').delete().lt('updated_at', new Date(Date.now() - 3 * 60 * 1000).toISOString());
      } catch (e) {
        console.error('presence purge', e);
      }

      // HARD DEDUPE: keep exactly ONE row per session_id (the freshest) — removes any
      // duplicated rows left by old heartbeat race conditions.
      const { data: allRows, error: lErr } = await supabase.from('live_sessions').select('*').order('updated_at', { ascending: false }).limit(500);
      if (lErr) throw lErr;
      const seen = new Set();
      const dupeIds = [];
      for (const r of allRows || []) {
        if (seen.has(r.session_id)) dupeIds.push(r.id);
        else seen.add(r.session_id);
      }
      if (dupeIds.length) {
        try {
          await supabase.from('live_sessions').delete().in('id', dupeIds);
        } catch (e) {
          console.error('presence dedupe', e);
        }
      }

      // active window: last 45s — guaranteed unique sessions (one row per user)
      const fresh = (allRows || [])
        .filter((r) => !dupeIds.includes(r.id) && Date.parse(r.updated_at) > Date.now() - 45 * 1000)
        .sort((a, b) => b.intent - a.intent)
        .slice(0, 50);
      return res.status(200).json(fresh);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('presence error', err);
    return res.status(500).json({ error: err.message });
  }
}
