import supabase from './db-client.js';
import { setCors } from './_lib.js';

// Public, anonymized activity feed for the live social-proof popup (no personal data).
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const events = [];

    const { data: orders } = await supabase
      .from('orders')
      .select('id, product_name, created_at')
      .order('id', { ascending: false })
      .limit(15);
    (orders || []).forEach((o) => events.push({ id: `p${o.id}`, type: 'purchase', product: o.product_name, at: o.created_at }));

    const { data: customers } = await supabase.from('customers').select('id, created_at').order('id', { ascending: false }).limit(10);
    (customers || []).forEach((c) => events.push({ id: `r${c.id}`, type: 'register', at: c.created_at }));

    const { data: merchants } = await supabase.from('merchants').select('id, created_at').order('id', { ascending: false }).limit(10);
    (merchants || []).forEach((m) => events.push({ id: `rm${m.id}`, type: 'register', at: m.created_at }));

    const { data: deps } = await supabase
      .from('deposits')
      .select('id, method, created_at')
      .eq('status', 'approved')
      .order('id', { ascending: false })
      .limit(8);
    (deps || []).forEach((d) => events.push({ id: `d${d.id}`, type: 'deposit', method: d.method, at: d.created_at }));

    const { data: cdeps } = await supabase
      .from('customer_deposits')
      .select('id, method, created_at')
      .eq('status', 'approved')
      .order('id', { ascending: false })
      .limit(8);
    (cdeps || []).forEach((d) => events.push({ id: `dc${d.id}`, type: 'deposit', method: d.method, at: d.created_at }));

    events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return res.status(200).json(events.slice(0, 30));
  } catch (err) {
    console.error('activity error', err);
    return res.status(200).json([]);
  }
}
