import supabase from './db-client.js';
import { setCors, requireAdmin } from './_lib.js';

function riskOf(reason) {
  const r = String(reason || '').toLowerCase();
  if (r.includes('coherence') || r.includes('high fraud')) return 95;
  if (r.includes('device') || r.includes('fingerprint')) return 85;
  if (r.includes('velocity') || r.includes('rapid') || r.includes('bot')) return 70;
  if (r.includes('vpn') || r.includes('proxy')) return 65;
  return 50;
}

// Sécurité AI journal: enriched live list + freeze / whitelist controls.
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('fraud_flags').select('*').order('id', { ascending: false }).limit(50);
      if (error) throw error;

      // resolve actor display names
      const cids = [...new Set((data || []).filter((f) => f.actor_type === 'customer' && f.actor_id).map((f) => f.actor_id))];
      const mids = [...new Set((data || []).filter((f) => f.actor_type === 'merchant' && f.actor_id).map((f) => f.actor_id))];
      const names = {};
      if (cids.length) {
        const { data: cs } = await supabase.from('customers').select('id, name, username').in('id', cids);
        (cs || []).forEach((c) => (names[`customer:${c.id}`] = `${c.name} (@${c.username})`));
      }
      if (mids.length) {
        const { data: ms } = await supabase.from('merchants').select('id, first_name, last_name').in('id', mids);
        (ms || []).forEach((m) => (names[`merchant:${m.id}`] = `${m.first_name} ${m.last_name}`));
      }

      return res.status(200).json(
        (data || []).map((f) => ({
          ...f,
          actor_name: f.actor_id ? names[`${f.actor_type}:${f.actor_id}`] || `#${f.actor_id}` : null,
          risk: riskOf(f.reason),
        }))
      );
    }

    if (req.method === 'PUT') {
      const b = req.body || {};
      const id = parseInt(b.id, 10);
      if (!id) return res.status(400).json({ error: 'id required' });
      if (b.action === 'freeze') {
        const { data, error } = await supabase
          .from('fraud_flags')
          .update({ frozen_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (b.action === 'whitelist') {
        const { error } = await supabase.from('fraud_flags').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
      if (b.action === 'unfreeze') {
        const { data, error } = await supabase.from('fraud_flags').update({ frozen_until: null }).eq('id', id).select().single();
        if (error) throw error;
        return res.status(200).json(data);
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('fraud api error', err);
    return res.status(500).json({ error: err.message });
  }
}
