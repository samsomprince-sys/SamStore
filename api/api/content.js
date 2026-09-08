import supabase from './db-client.js';
import { setCors, requireAdmin } from './_lib.js';
import { notifyContentEdit } from './_telegram.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('site_content').select('key, value');
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'PUT') {
      if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
      const { key, value } = req.body || {};
      if (!key || !/^[a-z0-9_]{1,60}$/.test(String(key))) return res.status(400).json({ error: 'Invalid content key' });
      if (typeof value !== 'string' || value.length > 4000) return res.status(400).json({ error: 'Invalid value' });
      const { data, error } = await supabase
        .from('site_content')
        .upsert({ key: String(key), value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        .select()
        .single();
      if (error) throw error;
      // Awaited Telegram confirmation for every Super Edit content save
      let alertOk = false;
      if (String(key) !== 'admin_telegram_chat_id') {
        try {
          alertOk = await notifyContentEdit(supabase, String(key), value);
        } catch (e) {
          console.error('tg content alert', e);
        }
      }
      return res.status(200).json({ ...data, alert_sent: alertOk });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('content error', err);
    return res.status(500).json({ error: err.message });
  }
}
