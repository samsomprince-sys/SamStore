import supabase from './db-client.js';
import { setCors } from './_lib.js';

// 5-minute anti-hoarding cart hold: reserves stock while the buyer pays.
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const b = req.body || {};
    const productId = parseInt(b.product_id, 10);
    const qty = Math.max(1, parseInt(b.qty, 10) || 1);
    const fp = String(b.fp || '').slice(0, 64);
    if (!productId || !fp) return res.status(400).json({ error: 'product_id and fp are required' });

    const { data: product, error: pErr } = await supabase.from('products').select('*').eq('id', productId).single();
    if (pErr || !product || !product.active) return res.status(404).json({ error: 'Product unavailable' });

    // Housekeeping: drop expired holds so they never block stock
    try {
      await supabase.from('holds').delete().lt('expires_at', new Date().toISOString());
    } catch (e) {
      console.error('holds cleanup', e);
    }

    // Stock reserved by OTHER sessions right now
    const { data: active } = await supabase
      .from('holds')
      .select('qty, fp')
      .eq('product_id', productId)
      .gt('expires_at', new Date().toISOString());
    const heldByOthers = (active || []).reduce((s, h) => (h.fp === fp ? s : s + Number(h.qty || 0)), 0);
    const available = Number(product.stock || 0) - heldByOthers;
    if (available < qty) {
      return res.status(409).json({ error: 'Not enough stock right now — some pieces are reserved for 5 minutes by other buyers.' });
    }

    // Refresh this session's hold for the product (one active hold per session per product)
    await supabase.from('holds').delete().eq('product_id', productId).eq('fp', fp);
    const { data, error } = await supabase
      .from('holds')
      .insert({ product_id: productId, qty, fp, expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) {
    console.error('holds error', err);
    return res.status(500).json({ error: err.message });
  }
}
