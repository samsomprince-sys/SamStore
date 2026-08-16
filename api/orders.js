import supabase from './db-client.js';
import { setCors, requireAdmin, verifyToken, getBearer } from './_lib.js';
import { notifyNewOrder } from './_telegram.js';

const STATUSES = ['pending', 'reviewing', 'delivered', 'cancelled'];

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
      const { data, error } = await supabase.from('orders').select('*').order('id', { ascending: false }).limit(300);
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const productId = parseInt(b.product_id, 10);
      const buyerName = String(b.buyer_name || '').trim();
      const buyerTelegram = String(b.buyer_telegram || '').trim().replace(/^@+/, '');
      const paymentMethod = String(b.payment_method || '');
      const buyerType = b.buyer_type === 'wholesale' ? 'wholesale' : 'retail';

      if (!productId) return res.status(400).json({ error: 'Product is required' });
      if (buyerName.length < 2) return res.status(400).json({ error: 'Please enter your full name' });
      if (buyerTelegram.length < 3) return res.status(400).json({ error: 'A valid Telegram username is required for delivery' });
      if (!['baridimob', 'usdt'].includes(paymentMethod)) return res.status(400).json({ error: 'Invalid payment method' });

      let merchantId = null;
      if (buyerType === 'wholesale') {
        const payload = verifyToken(getBearer(req));
        if (!payload || payload.role !== 'merchant') return res.status(401).json({ error: 'Merchant login required for wholesale orders' });
        const { data: m } = await supabase.from('merchants').select('status').eq('id', payload.mid).single();
        if (!m || m.status !== 'approved') return res.status(403).json({ error: 'Your account is pending admin approval' });
        merchantId = m.id || payload.mid;
      }

      const { data: product, error: pErr } = await supabase.from('products').select('*').eq('id', productId).single();
      if (pErr || !product || !product.active) return res.status(404).json({ error: 'Product not found or unavailable' });

      const allowedPanels = buyerType === 'wholesale' ? ['wholesale', 'both'] : ['retail', 'both'];
      if (!allowedPanels.includes(product.panel)) return res.status(400).json({ error: 'This product is not available in your panel' });

      let qty = parseInt(b.quantity, 10) || 1;
      const minQty = buyerType === 'wholesale' ? Math.max(1, product.min_qty || 1) : 1;
      if (qty < minQty) return res.status(400).json({ error: `Minimum quantity is ${minQty}` });
      if (qty > 500) return res.status(400).json({ error: 'Quantity too large' });
      if ((product.stock ?? 0) < qty) return res.status(400).json({ error: 'Not enough stock available' });

      let receiptUrl = b.receipt_url ? String(b.receipt_url) : null;
      if (receiptUrl && !/^https?:\/\//.test(receiptUrl)) receiptUrl = null;
      if (paymentMethod === 'baridimob' && !receiptUrl) {
        return res.status(400).json({ error: 'Please upload your Baridimob receipt screenshot' });
      }

      const unit = Number(product.price_dzd);
      const row = {
        product_id: product.id,
        product_name: product.name,
        buyer_type: buyerType,
        merchant_id: merchantId,
        buyer_name: buyerName,
        buyer_telegram: buyerTelegram,
        quantity: qty,
        unit_price: unit,
        total_dzd: unit * qty,
        payment_method: paymentMethod,
        receipt_url: receiptUrl,
        status: 'pending',
        notes: null,
      };
      const { data, error } = await supabase.from('orders').insert(row).select().single();
      if (error) throw error;
      // Awaited so the serverless runtime cannot freeze the delivery mid-flight
      let alertOk = false;
      try {
        alertOk = await notifyNewOrder(supabase, data);
      } catch (e) {
        console.error('tg order alert', e);
      }
      return res.status(201).json({ ...data, alert_sent: alertOk });
    }

    if (req.method === 'PUT') {
      if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
      const b = req.body || {};
      const id = parseInt(b.id, 10);
      if (!id) return res.status(400).json({ error: 'Order id is required' });
      const update = {};
      if (b.status !== undefined) {
        if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
        update.status = b.status;
      }
      if (b.notes !== undefined) update.notes = String(b.notes).slice(0, 1000);
      if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nothing to update' });
      const { data, error } = await supabase.from('orders').update(update).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('orders error', err);
    return res.status(500).json({ error: err.message });
  }
}
