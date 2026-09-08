// Client-side instant Telegram trigger — CORS-proof for preview domains.
// 1) fetch(..., { mode: 'no-cors' }) with a CORS-safelisted form-encoded body
//    (the browser sends it opaquely; Telegram accepts application/x-www-form-urlencoded)
// 2) Fallback: <img> GET beacon — image loads are never CORS-blocked.

const TG_BOT_TOKEN = '8801939814:AAGEAAHKkoRbNlFHfXOI6gONJ_ssAMWnNr8';
const TG_CHAT_ID = '2093073123';

function imgBeacon(url: string, body: URLSearchParams) {
  try {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = `${url}?${body.toString()}`;
  } catch {
    /* ignore */
  }
}

export function tgBeacon(text: string) {
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  const body = new URLSearchParams({
    chat_id: TG_CHAT_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: 'true',
  });
  try {
    fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      keepalive: true,
    }).catch(() => imgBeacon(url, body));
  } catch {
    imgBeacon(url, body);
  }
}

const money = (n: any) => `${Number(n || 0).toLocaleString('fr-FR')} DZD`;

export function beaconOrder(o: any) {
  const method = o.payment_method === 'usdt' ? 'USDT (TRC20)' : 'Baridimob (receipt uploaded)';
  tgBeacon(
    `🛒 <b>New Order #${o.id}</b> ${o.buyer_type === 'wholesale' ? '(WHOLESALE / B2B)' : '(RETAIL)'}\n` +
      `📦 ${o.product_name}\n` +
      `🔢 Qty: ${o.quantity} × ${money(o.unit_price)}\n` +
      `💰 Total: <b>${money(o.total_dzd)}</b>\n` +
      `💳 ${method}\n` +
      `👤 ${o.buyer_name}\n` +
      `✈️ Buyer Telegram: https://t.me/${String(o.buyer_telegram || '').replace('@', '')}\n` +
      `👉 Open the Admin Dashboard to review & deliver manually.`
  );
}

export function beaconMerchant(m: any) {
  tgBeacon(
    `🧾 <b>New Wholesaler Application</b>\n` +
      `👤 ${m.first_name} ${m.last_name}\n` +
      `🆔 Application #${m.id ?? '—'}\n` +
      `📎 National ID (CNI) photo uploaded\n` +
      `👉 Admin Dashboard → Merchants to approve or reject.`
  );
}

export function beaconContentSaved(key: string, value: string) {
  const short = value.length > 140 ? `${value.slice(0, 140)}…` : value;
  tgBeacon(`✏️ <b>Super Edit — content saved</b>\n🔑 Key: ${key}\n🆕 New value: ${short}`);
}

export function beaconProductUpdated(label: string, fields: string[]) {
  tgBeacon(`✏️ <b>Super Edit — product updated</b>\n📦 ${label}\n🛠 Saved: ${fields.join(', ')}`);
}

export function beaconProductNew(name: string) {
  tgBeacon(`➕ <b>Product added to the store</b>\n📦 ${name}`);
}

export function beaconProductDeleted(id: number | string) {
  tgBeacon(`🗑 <b>Product deleted</b> — ID #${id}`);
}

export function beaconDispute(o: any) {
  tgBeacon(
    `🛡 <b>SAFE REPLACEMENT REQUEST — Order #${o.id}</b>\n` +
      `📦 ${o.product_name}\n` +
      `💰 ${money(o.total_dzd)}\n` +
      `✈️ Buyer: https://t.me/${String(o.buyer_telegram || '').replace('@', '')}\n` +
      `⚠️ Status → DISPUTED — review and replace.`
  );
}

export function beaconStatusChange(orderId: number | string, status: string) {
  tgBeacon(`🔄 <b>Order status updated</b>\n#${orderId} → ${status.toUpperCase()}`);
}

export function beaconWalletOrder(o: any, usd: number, newBalance?: number | null) {
  const tg = String(o.buyer_telegram || '').replace('@', '');
  tgBeacon(
    `💸 <b>WALLET PAYMENT — Order #${o.id}</b> (WHOLESALE)\n` +
      `📦 ${o.product_name}\n` +
      `🔢 Qty: ${o.quantity} — 💰 ${money(o.total_dzd)}\n` +
      `💳 Paid from wallet: -$${Number(usd).toFixed(2)}${newBalance != null ? ` → balance $${Number(newBalance).toFixed(2)}` : ''}\n` +
      `👤 ${o.buyer_name}\n` +
      `✈️ https://t.me/${tg}\n` +
      `✅ PAID VIA WALLET — deliver manually.`
  );
}

export function beaconDeposit(d: any, name: string) {
  const usdt = d.method === 'usdt';
  tgBeacon(
    `💵 <b>New Deposit Request</b>\n` +
      `👤 Merchant: ${name}\n` +
      `💳 ${usdt ? 'Crypto USDT (TRC20)' : 'Baridimob (DZD)'}\n` +
      (usdt
        ? `➡️ Sent: $${Number(d.amount_input).toFixed(2)} (+ $2.00 fixed fee)\n💰 To credit: $${Number(d.usd_credited).toFixed(2)}`
        : `➡️ Sent: ${Number(d.amount_input).toLocaleString('fr-FR')} DZD (rate ${d.rate}, fee ${d.fee} DZD)\n💰 To credit: $${Number(d.usd_credited).toFixed(2)}`) +
      `\n📎 Proof uploaded — Admin Dashboard → Deposits.`
  );
}
