import supabase from './db-client.js';
import { setCors, verifyToken, getBearer } from './_lib.js';

// Public order tracking: buyers view their own orders by Telegram username.
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const tg = String((req.query && req.query.tg) || '').trim().replace(/^@+/, '');
    // Optional merchant identity: traders see their own wholesale orders too
    let merchantId = null;
    const payload = verifyToken(getBearer(req));
    if (payload && payload.role === 'merchant') merchantId = payload.mid;
    if (tg.length < 3 && !merchantId) return res.status(400).json({ error: 'Telegram username required' });

    let rows = [];
    if (tg.length >= 3) {
      const { data, error } = await supabase
        .from('orders')
        .select('id, product_name, quantity, total_dzd, payment_method, status, created_at')
        .ilike('buyer_telegram', tg)
        .order('id', { ascending: false })
        .limit(20);
      if (error) throw error;
      rows = data || [];
    }
    if (merchantId) {
      const { data: mrows } = await supabase
        .from('orders')
        .select('id, product_name, quantity, total_dzd, payment_method, status, created_at')
        .eq('merchant_id', merchantId)
        .order('id', { ascending: false })
        .limit(20);
      const have = new Set(rows.map((r) => r.id));
      rows = [...rows, ...(mrows || []).filter((r) => !have.has(r.id))].sort((a, b) => b.id - a.id);
    }

    // attach in-app delivery images
    const ids = rows.map((r) => r.id);
    let dmap = {};
    if (ids.length) {
      const { data: ds } = await supabase.from('deliveries').select('order_id, image_url').in('order_id', ids).order('id', { ascending: false });
      (ds || []).forEach((d) => {
        if (!dmap[d.order_id]) dmap[d.order_id] = d.image_url;
      });
    }
    return res.status(200).json(rows.map((r) => ({ ...r, delivery_image: dmap[r.id] || null })));
  } catch (err) {
    console.error('orders-public error', err);
    return res.status(500).json({ error: err.message });
  }
}
