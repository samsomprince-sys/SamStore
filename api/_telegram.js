// Telegram Bot alerting for the Super Admin (Samir).
// Token is read from TELEGRAM_BOT_TOKEN env when present, else the provided bot token.
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8801939814:AAGEAAHKkoRbNlFHfXOI6gONJ_ssAMWnNr8';
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function tgApi(method, payload) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function getBotInfo() {
  try {
    const r = await tgApi('getMe', {});
    return r && r.ok ? r.result : null;
  } catch {
    return null;
  }
}

// All instant alerts are routed directly to the admin (Samir).
// Priority: ADMIN_TELEGRAM_CHAT_ID env var -> the fixed chat id provided for Samir.
// (The 'admin_telegram_chat_id' content key remains as an extra manual override.)
const DEFAULT_ADMIN_CHAT_ID = '2093073123';

export async function getAdminChatId(supabase) {
  if (process.env.ADMIN_TELEGRAM_CHAT_ID) return process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (DEFAULT_ADMIN_CHAT_ID) return DEFAULT_ADMIN_CHAT_ID;
  try {
    const { data } = await supabase
      .from('site_content')
      .select('value')
      .eq('key', 'admin_telegram_chat_id')
      .maybeSingle();
    return (data && data.value) || null;
  } catch {
    return null;
  }
}

export async function sendAdminAlert(supabase, text, photoUrl = null) {
  try {
    const chatId = await getAdminChatId(supabase);
    if (!chatId) return false;
    if (photoUrl) {
      const r = await tgApi('sendPhoto', {
        chat_id: chatId,
        photo: photoUrl,
        caption: text.length > 1000 ? text.slice(0, 1000) : text,
        parse_mode: 'HTML',
      });
      if (r && r.ok) return true; // fall through to text-only if the photo fetch failed
    }
    const r = await tgApi('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    return !!(r && r.ok);
  } catch (e) {
    console.error('telegram alert failed', e);
    return false;
  }
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const money = (n) => `${Number(n || 0).toLocaleString('fr-FR')} DZD`;

export function notifyNewOrder(supabase, o) {
  const method =
    o.payment_method === 'usdt'
      ? 'USDT (TRC20) — buyer confirmed payment'
      : 'Baridimob (CCP RIP) — receipt attached';
  const tg = esc(o.buyer_telegram);
  const text =
    `🛒 <b>New Order #${o.id}</b> ${o.buyer_type === 'wholesale' ? '(WHOLESALE / B2B)' : '(RETAIL)'}\n` +
    `📦 ${esc(o.product_name)}\n` +
    `🔢 Qty: ${o.quantity} × ${money(o.unit_price)}\n` +
    `💰 Total: <b>${money(o.total_dzd)}</b>\n` +
    `💳 ${esc(method)}\n` +
    `👤 ${esc(o.buyer_name)}\n` +
    `✈️ Buyer Telegram: <a href="https://t.me/${tg}">@${tg}</a>\n` +
    `👉 Open the Admin Dashboard to review & deliver manually.`;
  return sendAdminAlert(supabase, text, o.receipt_url || null);
}

export function notifyNewMerchant(supabase, m, cniSignedUrl) {
  const text =
    `🧾 <b>New Wholesaler Application</b>\n` +
    `👤 ${esc(m.first_name)} ${esc(m.last_name)}\n` +
    `🆔 Application #${m.id}\n` +
    `📎 National ID (CNI) photo attached${cniSignedUrl ? ' below' : ''}\n` +
    `👉 Admin Dashboard → Merchants to approve or reject.`;
  return sendAdminAlert(supabase, text, cniSignedUrl || null);
}

export function notifyContentEdit(supabase, key, value) {
  const v = String(value ?? '');
  const short = v.length > 140 ? `${v.slice(0, 140)}…` : v;
  const text =
    `✏️ <b>Super Edit — content saved</b>\n` +
    `🔑 Key: <code>${esc(key)}</code>\n` +
    `🆕 New value: ${esc(short)}`;
  return sendAdminAlert(supabase, text);
}

export function notifyProductNew(supabase, p) {
  const text =
    `➕ <b>Product added to the store</b>\n` +
    `📦 ${esc(p.name)}\n` +
    `💰 ${money(p.price_dzd)} — panel: ${esc(p.panel)}`;
  return sendAdminAlert(supabase, text);
}

export function notifyProductEdit(supabase, p, fields) {
  const text =
    `✏️ <b>Super Edit — product updated</b>\n` +
    `📦 ${esc(p.name || `#${p.id}`)} (#${p.id})\n` +
    `🛠 Saved fields: <code>${esc(fields.join(', '))}</code>\n` +
    `💰 Current price: ${money(p.price_dzd)}`;
  return sendAdminAlert(supabase, text);
}

export function notifyProductDeleted(supabase, id) {
  return sendAdminAlert(supabase, `🗑 <b>Product deleted</b> — ID #${id}`);
}
