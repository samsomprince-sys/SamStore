import supabase from './db-client.js';
import { setCors, requireAdmin } from './_lib.js';
import { notifyFlashStarted, notifyFlashStopped } from './_telegram.js';

async function readFlash() {
  const { data } = await supabase.from('site_content').select('key, value').in('key', ['flash_discount_pct', 'flash_ends_at']);
  const map = {};
  (data || []).forEach((r) => (map[r.key] = r.value));
  const pct = Number(map.flash_discount_pct) || 0;
  const endsAt = Date.parse(map.flash_ends_at || '') || 0;
  const active = pct > 0 && endsAt > Date.now();
  return { active, pct: active ? pct : 0, ends_at: active ? map.flash_ends_at : null };
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await readFlash());
    }

    if (req.method === 'POST') {
      if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
      const b = req.body || {};
      if (b.action === 'stop') {
        await supabase.from('site_content').upsert({ key: 'flash_discount_pct', value: '0', updated_at: new Date().toISOString() }, { onConflict: 'key' });
        await supabase.from('site_content').upsert({ key: 'flash_ends_at', value: '', updated_at: new Date().toISOString() }, { onConflict: 'key' });
        notifyFlashStopped(supabase).catch(() => {});
        return res.status(200).json(await readFlash());
      }
      const pct = Math.min(90, Math.max(1, Number(b.pct) || 0));
      const minutes = Math.min(1440, Math.max(5, parseInt(b.minutes, 10) || 30));
      const endsAt = new Date(Date.now() + minutes * 60000).toISOString();
      const { error: e1 } = await supabase.from('site_content').upsert({ key: 'flash_discount_pct', value: String(pct), updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('site_content').upsert({ key: 'flash_ends_at', value: endsAt, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (e2) throw e2;
      notifyFlashStarted(supabase, pct, minutes).catch(() => {});
      return res.status(200).json(await readFlash());
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('flash error', err);
    return res.status(500).json({ error: err.message });
  }
}
