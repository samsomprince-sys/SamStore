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

// Default storefront content restored by the "content" section reset (chat-id key intentionally NOT reset)
const DEFAULT_CONTENT = {
  store_name: 'SamStore DZ',
  announcement: 'Fast manual delivery on Telegram — usually 5 to 30 minutes after payment.',
  show_announcement: '1',
  show_features: '1',
  show_payments: '1',
  show_about: '1',
  hero_badge: 'Trusted digital store in Algeria',
  hero_title: 'Digital cards, accounts & top-ups, delivered on Telegram.',
  hero_subtitle:
    'Netflix, Steam, PlayStation, PUBG UC, IPTV and more. Pay with Baridimob or USDT (TRC20) and receive your product as a photo in chat.',
  hero_cta: 'Browse products',
  stat_1_value: '500+',
  stat_1_label: 'Orders delivered',
  stat_2_value: '24/7',
  stat_2_label: 'Telegram support',
  stat_3_value: '100%',
  stat_3_label: 'Manual & verified',
  shop_title: 'Retail Store',
  shop_subtitle: 'Single pieces, fair DZD prices, manual verified delivery',
  feature_1_title: 'Manual Verified Delivery',
  feature_1_text: 'Every order is reviewed by a human. We contact you on Telegram and send your product as a clear image.',
  feature_2_title: 'Local Payments',
  feature_2_text: 'Pay with Baridimob CCP RIP or USDT TRC20 — no bank card needed.',
  feature_3_title: 'Wholesale Ready',
  feature_3_text: 'Merchants get bulk DZD pricing after a quick National ID verification.',
  payments_title: 'Payment Methods',
  baridimob_rip: '00799999002478845197',
  usdt_trc20: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
  delivery_notice: 'All deliveries are 100% manual: after payment we contact you on Telegram and deliver your product as an image.',
  about_title: 'About SamStore DZ',
  about_text:
    'We are an Algerian digital goods shop. Everything is delivered manually by our team on Telegram: you pay by Baridimob or USDT, we verify, and you receive a photo of your card, code or account credentials.',
  support_telegram: 'SamStoreDZ',
  b2b_title: 'Wholesaler / Trader Zone',
  b2b_subtitle:
    'Bulk pricing for verified Algerian resellers. Register with your real name and a photo of your National ID card (CNI) to unlock wholesale prices.',
  footer_text: 'SamStore DZ — Digital products delivered manually on Telegram. Baridimob & USDT accepted.',
  usd_dzd_rate: '270',
  baridimob_fee_dzd: '50',
  ref_commission_pct: '5',
  flash_discount_pct: '0',
  flash_ends_at: '',
};

async function wipe(table) {
  const { error } = await supabase.from(table).delete().neq('id', 0);
  if (error) throw error;
}

const ACTIONS = {
  // Commandes: order histories + their cart holds + referral ledger rows (all transactional)
  orders: async () => {
    await wipe('orders');
    await wipe('holds');
    await wipe('referral_events');
    return 'orders, cart holds and referral ledger cleared';
  },
  // Dépôts: deposit history only (wallets are NOT touched)
  deposits: async () => {
    await wipe('deposits');
    await wipe('customer_deposits');
    return 'all deposit requests cleared (trader + retail buyer)';
  },
  // Marchands: merchant TEST profiles + security snapshots + CNI photos (isolated)
  merchants: async () => {
    const { data: ms } = await supabase.from('merchants').select('cni_path');
    const paths = (ms || []).map((m) => m.cni_path).filter(Boolean);
    await wipe('merchants');
    await wipe('merchant_security');
    if (paths.length) {
      try {
        await supabase.storage.from('cni-photos').remove(paths);
      } catch (e) {
        console.error('cni purge', e);
      }
    }
    return `merchant profiles cleared (+ ${paths.length} CNI photos purged)`;
  },
  // Clients: retail buyer TEST profiles (+ their public profile rows) — isolated
  customers: async () => {
    await wipe('customer_profiles');
    await wipe('customers');
    return 'retail buyer profiles cleared';
  },
  // Produits: inventory only — stock counters back to 0, catalog kept intact
  products: async () => {
    const { error } = await supabase.from('products').update({ stock: 0 }).gt('id', 0);
    if (error) throw error;
    return 'product inventory (stock) reset to 0 — products kept';
  },
  // Contenu: storefront text/settings restored to defaults (Telegram chat-id link preserved)
  content: async () => {
    for (const [key, value] of Object.entries(DEFAULT_CONTENT)) {
      const { error } = await supabase
        .from('site_content')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
    }
    return 'site content restored to default starter texts';
  },
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });

  try {
    const { section, password } = req.body || {};
    if (!section || !ACTIONS[section]) return res.status(400).json({ error: 'Unknown section' });
    if (!password || typeof password !== 'string') return res.status(400).json({ error: 'Password confirmation is required' });
    if (!passwordMatchesAdmin(password)) return res.status(403).json({ error: 'Incorrect admin password — action aborted' });

    const summary = await ACTIONS[section]();
    sendAdminAlert(supabase, `🧹 <b>SECTION RESET</b> — <code>${section}</code>\n${summary}`).catch((e) => console.error('tg section alert', e));
    return res.status(200).json({ ok: true, section, summary });
  } catch (err) {
    console.error('reset-section error', err);
    return res.status(500).json({ error: err.message });
  }
}
