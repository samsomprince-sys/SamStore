import supabase from './db-client.js';
import { setCors } from './_lib.js';
import { notifyDispute } from './_telegram.js';

// Buyer protection: flag a delivered order as disputed ("Request Safe Replacement").
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const b = req.body || {};
    const orderId = parseInt(b.order_id, 10);
    const tg = String(b.telegram || '').trim().replace(/^@+/, '').toLowerCase();
    if (!orderId || tg.length < 3) return res.status(400).json({ error: 'order_id and telegram are required' });

    const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if (error || !order) return res.status(404).json({ error: 'Order not found' });
    if (String(order.buyer_telegram || '').toLowerCase() !== tg) {
      return res.status(403).json({ error: 'This order does not belong to this Telegram account' });
    }
    if (order.status === 'disputed') return res.status(409).json({ error: 'This order already has a pending replacement request' });
    if (!['delivered', 'paid_wallet'].includes(order.status)) {
      return res.status(400).json({ error: 'Replacement can only be requested for delivered orders' });
    }

    const { data, error: uErr } = await supabase
      .from('orders')
      .update({ status: 'disputed' })
      .eq('id', orderId)
      .select()
      .single();
    if (uErr) throw uErr;

    let alertOk = false;
    try {
      alertOk = await notifyDispute(supabase, data);
    } catch (e) {
      console.error('tg dispute alert', e);
    }
    return res.status(200).json({ ...data, alert_sent: alertOk });
  } catch (err) {
    console.error('dispute error', err);
    return res.status(500).json({ error: err.message });
  }
}
