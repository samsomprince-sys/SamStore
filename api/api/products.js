import supabase from './db-client.js';
import { setCors, requireAdmin, verifyToken, getBearer } from './_lib.js';
import { notifyProductNew, notifyProductEdit, notifyProductDeleted } from './_telegram.js';

const EDITABLE_FIELDS = ['name', 'description', 'category', 'price_dzd', 'image_url', 'panel', 'stock', 'min_qty', 'active', 'sort'];

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const panel = String((req.query && req.query.panel) || 'retail');

      if (panel === 'all') {
        if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
        const { data, error } = await supabase.from('products').select('*').order('id', { ascending: true });
        if (error) throw error;
        return res.status(200).json(data);
      }

      if (panel === 'wholesale') {
        const payload = verifyToken(getBearer(req));
        if (!payload || (payload.role !== 'merchant' && payload.role !== 'admin')) {
          return res.status(401).json({ error: 'Wholesale access requires a merchant account' });
        }
        if (payload.role === 'merchant') {
          const { data: m } = await supabase.from('merchants').select('status').eq('id', payload.mid).single();
          if (!m) return res.status(401).json({ error: 'Merchant not found' });
          if (m.status !== 'approved') {
            return res.status(403).json({ error: 'Your account is pending admin approval', status: m.status });
          }
        }
      }

      const allowed = panel === 'wholesale' ? ['wholesale', 'both'] : ['retail', 'both'];
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .in('panel', allowed)
        .order('sort', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
      const b = req.body || {};
      if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Product name is required' });
      const price = Number(b.price_dzd);
      if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'A valid price in DZD is required' });
      const panel = ['retail', 'wholesale', 'both'].includes(b.panel) ? b.panel : 'retail';
      const row = {
        name: String(b.name).trim(),
        description: String(b.description || ''),
        category: String(b.category || 'General').trim() || 'General',
        price_dzd: price,
        image_url: String(b.image_url || ''),
        panel,
        stock: Math.max(0, parseInt(b.stock, 10) || 0),
        min_qty: Math.max(1, parseInt(b.min_qty, 10) || 1),
        active: b.active !== false,
        sort: parseInt(b.sort, 10) || 0,
      };
      const { data, error } = await supabase.from('products').insert(row).select().single();
      if (error) throw error;
      let alertOk = false;
      try {
        alertOk = await notifyProductNew(supabase, data);
      } catch (e) {
        console.error('tg product alert', e);
      }
      return res.status(201).json({ ...data, alert_sent: alertOk });
    }

    if (req.method === 'PUT') {
      if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
      const b = req.body || {};
      const id = parseInt(b.id, 10);
      if (!id) return res.status(400).json({ error: 'Product id is required' });
      const update = {};
      for (const f of EDITABLE_FIELDS) {
        if (b[f] === undefined) continue;
        if (f === 'price_dzd') {
          const price = Number(b[f]);
          if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'Price must be a positive number' });
          update[f] = price;
        } else if (f === 'stock' || f === 'min_qty' || f === 'sort') {
          update[f] = Math.max(f === 'min_qty' ? 1 : 0, parseInt(b[f], 10) || 0);
        } else if (f === 'active') {
          update[f] = !!b[f];
        } else if (f === 'panel') {
          if (!['retail', 'wholesale', 'both'].includes(b[f])) return res.status(400).json({ error: 'Invalid panel' });
          update[f] = b[f];
        } else {
          update[f] = String(b[f]);
        }
      }
      if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nothing to update' });
      const { data, error } = await supabase.from('products').update(update).eq('id', id).select().single();
      if (error) throw error;
      let alertOk = false;
      try {
        alertOk = await notifyProductEdit(supabase, data, Object.keys(update));
      } catch (e) {
        console.error('tg product alert', e);
      }
      return res.status(200).json({ ...data, alert_sent: alertOk });
    }

    if (req.method === 'DELETE') {
      if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
      const id = parseInt((req.body || {}).id, 10);
      if (!id) return res.status(400).json({ error: 'Product id is required' });
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      let alertOk = false;
      try {
        alertOk = await notifyProductDeleted(supabase, id);
      } catch (e) {
        console.error('tg product alert', e);
      }
      return res.status(200).json({ ok: true, alert_sent: alertOk });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('products error', err);
    return res.status(500).json({ error: err.message });
  }
}
