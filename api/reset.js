import crypto from 'crypto';
import supabase from './db-client.js';
import { setCors, requireAdmin } from './_lib.js';
import { sendAdminAlert } from './_telegram.js';

function passwordMatchesAdmin(password) {
  const expected = process.env.ADMIN_PASSWORD || 'Samirsami9@';
  const digest = (s) => crypto.createHash('sha256').update(String(s ?? '')).digest();
  const a = digest(password);
  const b = digest(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'POST' && req.query && req.query.confirm === 'dry') {
    // reserved for future dry-run support
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });

  try {
    const { password } = req.body || {};
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password confirmation is required' });
    }
    if (!passwordMatchesAdmin(password)) {
      return res.status(403).json({ error: 'Incorrect admin password — reset aborted' });
    }

    // Count + collect for reporting and storage purge
    const { data: orderRows } = await supabase.from('orders').select('id');
    const ordersCount = (orderRows || []).length;
    const { data: merchantRows } = await supabase.from('merchants').select('id, cni_path');
    const merchantsCount = (merchantRows || []).length;
    const cniPaths = (merchantRows || []).map((m) => m.cni_path).filter(Boolean);

    // Wipe all orders (pending, reviewing, delivered, cancelled)
    const { error: oErr } = await supabase.from('orders').delete().neq('id', 0);
    if (oErr) throw oErr;

    // Delete all merchant accounts
    const { error: mErr } = await supabase.from('merchants').delete().neq('id', 0);
    if (mErr) throw mErr;

    // Reset all product stock to zero
    const { error: pErr } = await supabase.from('products').update({ stock: 0 }).gt('id', 0);
    if (pErr) throw pErr;

    // Purge merchant CNI photos from encrypted storage (best effort)
    if (cniPaths.length > 0) {
      try {
        await supabase.storage.from('cni-photos').remove(cniPaths);
      } catch (e) {
        console.error('cni purge failed', e);
      }
    }

    // Telegram audit alert of the reset (never blocks the response)
    sendAdminAlert(
      supabase,
      `🧹 <b>DATABASE RESET COMPLETED</b>\n` +
        `🗑 Orders deleted: ${ordersCount}\n` +
        `👥 Merchant accounts deleted: ${merchantsCount}\n` +
        `📦 Product stock reset to 0\n` +
        `🖼 CNI photos purged: ${cniPaths.length}\n` +
        `✅ Store is clean — test data fully separated from real customers.`
    ).catch((e) => console.error('tg reset alert', e));

    return res.status(200).json({
      ok: true,
      orders_deleted: ordersCount,
      merchants_deleted: merchantsCount,
      stock_reset: true,
      cni_purged: cniPaths.length,
    });
  } catch (err) {
    console.error('reset error', err);
    return res.status(500).json({ error: err.message });
  }
}
