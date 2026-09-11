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

const WHITELIST_NOTE =
  'PROTECTED & whitelisted: merchant accounts, retail buyer accounts, admin credentials, products & settings';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
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

    /* ------------------------------------------------------------------
       INTELLIGENT SELECTIVE RESET — transactional data ONLY.
       Whitelisted (NEVER touched): merchants, merchant_security, customers,
       products, site_content (settings). User accounts are fully protected.
       ------------------------------------------------------------------ */

    const count = async (table, col = 'id') => {
      const { data } = await supabase.from(table).select(col).limit(5000);
      return (data || []).length;
    };

    const ordersCount = await count('orders');
    const holdsCount = await count('holds');
    const depositsCount = await count('deposits');
    const retailDepositsCount = await count('customer_deposits');
    const referralsCount = await count('referral_events');
    const traderWallets = await count('wallets');
    const buyerWallets = await count('customer_wallets');

    // 1) All product orders (pending / reviewing / delivered / paid via wallet / disputed / cancelled)
    const { error: oErr } = await supabase.from('orders').delete().neq('id', 0);
    if (oErr) throw oErr;

    // 2) All 5-minute shopping cart holds (cleared instantly)
    const { error: hErr } = await supabase.from('holds').delete().neq('id', 0);
    if (hErr) throw hErr;

    // 3) All deposit approvals — trader + retail buyer (pending & completed)
    const { error: dErr } = await supabase.from('deposits').delete().neq('id', 0);
    if (dErr) throw dErr;
    const { error: rdErr } = await supabase.from('customer_deposits').delete().neq('id', 0);
    if (rdErr) throw rdErr;

    // 4) Referral commission ledger (transactional escrow records tied to the deleted orders)
    const { error: rErr } = await supabase.from('referral_events').delete().neq('id', 0);
    if (rErr) throw rErr;

    // 5) Virtual USD wallet balances → $0.00 (accounts themselves are never deleted)
    const { error: wErr } = await supabase.from('wallets').update({ balance_usd: 0, updated_at: new Date().toISOString() }).gt('id', 0);
    if (wErr) throw wErr;
    const { error: cwErr } = await supabase
      .from('customer_wallets')
      .update({ balance_usd: 0, updated_at: new Date().toISOString() })
      .gt('id', 0);
    if (cwErr) throw cwErr;

    // Telegram audit alert (never blocks the response)
    sendAdminAlert(
      supabase,
      `🧹 <b>SELECTIVE DATABASE RESET COMPLETED</b>\n` +
        `🧾 Orders wiped: ${ordersCount}\n` +
        `🛒 Cart holds cleared: ${holdsCount}\n` +
        `💵 Deposits wiped (trader + buyer): ${depositsCount} + ${retailDepositsCount}\n` +
        `🤝 Referral ledger cleared: ${referralsCount}\n` +
        `🏦 Wallets zeroed → $0.00: ${traderWallets} trader + ${buyerWallets} buyer wallets\n` +
        `🔐 ${WHITELIST_NOTE}\n` +
        `✅ Test transactions fully separated — no account was touched.`
    ).catch((e) => console.error('tg reset alert', e));

    return res.status(200).json({
      ok: true,
      orders_deleted: ordersCount,
      holds_cleared: holdsCount,
      deposits_deleted: depositsCount + retailDepositsCount,
      referrals_cleared: referralsCount,
      wallets_zeroed: traderWallets + buyerWallets,
      accounts_protected: true,
    });
  } catch (err) {
    console.error('reset error', err);
    return res.status(500).json({ error: err.message });
  }
}
