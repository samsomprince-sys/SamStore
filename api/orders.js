import supabase from './db-client.js';
import { setCors, requireAdmin, verifyToken, getBearer, parseRefCode, getClientIp, parseChallengeCode, isFrozen, velocityHit, isVpnIp, getSecurityConfig } from './_lib.js';
import { notifyNewOrder, notifyWalletOrder, notifyReferralCredited } from './_telegram.js';
import { maybeDrawGiftAudited } from './challenge.js';

const STATUSES = ['pending', 'reviewing', 'delivered', 'cancelled', 'paid_wallet', 'disputed'];

// CUSTOM BACKEND WEBHOOK: fires instantly (awaited async POST) whenever the admin
// approves / delivers an order — payload: { productUrl, telegramId, orderId }.
const PURCHASE_WEBHOOK_URL = 'https://f9kwhr-o7u2cvl5z-arcadawebapps2.vercel.app/api/process-purchase';
const PURCHASE_WEBHOOK_SECRET = 'SamirSecretSecureKey123!';

async function firePurchaseWebhook(order) {
  try {
    let productUrl = '';
    let telegramId = null;
    try {
      const { data: cRow } = await supabase
        .from('site_content')
        .select('value')
        .eq('key', `supplier_url_${order.product_id}`)
        .maybeSingle();
      productUrl = (cRow && cRow.value) || '';
    } catch (e) {
      console.error('webhook productUrl lookup', e);
    }
    try {
      const { data: tRow } = await supabase
        .from('tg_chat_ids')
        .select('chat_id')
        .eq('username', String(order.buyer_telegram || '').toLowerCase())
        .maybeSingle();
      telegramId = tRow ? tRow.chat_id : null;
    } catch (e) {
      console.error('webhook telegramId lookup', e);
    }
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 6000);
    await fetch(PURCHASE_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': PURCHASE_WEBHOOK_SECRET,
      },
      body: JSON.stringify({ productUrl, telegramId, orderId: order.id }),
      signal: controller.signal,
    });
    clearTimeout(to);
    console.log('purchase webhook fired for order', order.id);
  } catch (e) {
    console.error('purchase webhook failed', e);
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
      const { data, error } = await supabase.from('orders').select('*').order('id', { ascending: false }).limit(300);
      if (error) throw error;
      let out = data || [];
      // Attach referral commission info (trader + escrow status) to each order
      try {
        const { data: refs } = await supabase.from('referral_events').select('order_id, merchant_id, commission_usd, status');
        const mids = [...new Set((refs || []).map((r) => r.merchant_id))];
        const names = {};
        if (mids.length) {
          const { data: ms } = await supabase.from('merchants').select('id, first_name, last_name').in('id', mids);
          (ms || []).forEach((m) => (names[m.id] = `${m.first_name} ${m.last_name}`));
        }
        const byOrder = {};
        (refs || []).forEach((r) => (byOrder[r.order_id] = { commission_usd: r.commission_usd, status: r.status, merchant: names[r.merchant_id] || null }));
        out = out.map((o) => ({ ...o, referral: byOrder[o.id] || null }));
      } catch (e) {
        console.error('referral attach', e);
      }
      return res.status(200).json(out);
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const productId = parseInt(b.product_id, 10);
      let buyerName = String(b.buyer_name || '').trim();
      let buyerTelegram = String(b.buyer_telegram || '').trim().replace(/^@+/, '');
      const paymentMethod = String(b.payment_method || '');
      const buyerType = b.buyer_type === 'wholesale' ? 'wholesale' : 'retail';
      const fp = String(b.fp || '').slice(0, 64);
      const hw = String(b.hw || '').slice(0, 64);
      const refCode = String(b.ref_code || '').slice(0, 32);
      const holdId = parseInt(b.hold_id, 10) || null;
      const tgChatId = String(b.tg_chat_id || '').slice(0, 32);

      // Identity slots are ALWAYS declared+initialized before any gate runs —
      // prevents any 'Cannot access before initialization' crash, whatever the flow order.
      let merchantId = null;
      let customerId = null;

      if (!productId) return res.status(400).json({ error: 'Product is required' });
      if (!['baridimob', 'usdt', 'wallet'].includes(paymentMethod)) return res.status(400).json({ error: 'Invalid payment method' });


      if (buyerType === 'wholesale') {
        const payload = verifyToken(getBearer(req));
        if (!payload || payload.role !== 'merchant') return res.status(401).json({ error: 'Merchant login required for wholesale orders' });
        const { data: m } = await supabase.from('merchants').select('id, status, first_name, last_name').eq('id', payload.mid).single();
        if (!m || m.status !== 'approved') return res.status(403).json({ error: 'Your account is pending admin approval' });
        merchantId = m.id || payload.mid;
        buyerName = `${m.first_name} ${m.last_name}`; // identity comes from the verified merchant account
        buyerTelegram = buyerTelegram || '';
      }

      /* ---------- GLOBAL ANTI-FRAUD GATE (frozen? velocity? VPN?) — admin-tunable ---------- */
      const sec = await getSecurityConfig(supabase);
      const reqIp = getClientIp(req);
      const frozen = await isFrozen(supabase, fp, hw, reqIp);
      if (frozen) {
        return res.status(423).json({ error: 'Suspicious Behavior — هذا الجهاز مجمّد مؤقتًا. Your actions are frozen for 24 hours.' });
      }
      const vel = await velocityHit(supabase, {
        fp,
        hw,
        ip: reqIp,
        bucket: 'order',
        limit: sec.limit,
        windowMs: 60 * 1000,
        actorType: buyerType,
        actorId: merchantId || customerId || null,
        reason: 'rapid-fire orders (bot velocity)',
      });
      if (vel.frozen) {
        return res.status(423).json({ error: 'Suspicious Behavior — هذا الجهاز مجمّد مؤقتًا. Your actions are frozen for 24 hours.' });
      }
      if (sec.vpn && (await isVpnIp(reqIp))) {
        return res.status(403).json({ error: 'VPN/Proxy detected — أوقف الـ VPN للمتابعة. Please disable your VPN to continue.' });
      }

      const { data: product, error: pErr } = await supabase.from('products').select('*').eq('id', productId).single();
      if (pErr || !product || !product.active) return res.status(404).json({ error: 'Product not found or unavailable' });

      const allowedPanels = buyerType === 'wholesale' ? ['wholesale', 'both'] : ['retail', 'both'];
      if (!allowedPanels.includes(product.panel)) return res.status(400).json({ error: 'This product is not available in your panel' });

      let qty = parseInt(b.quantity, 10) || 1;
      const minQty = buyerType === 'wholesale' ? Math.max(1, product.min_qty || 1) : 1;
      if (qty < minQty) return res.status(400).json({ error: `Minimum quantity is ${minQty}` });
      if (qty > 500) return res.status(400).json({ error: 'Quantity too large' });
      // ANTI-HOARDING: stock reserved by other sessions' 5-minute holds is unavailable
      const { data: act } = await supabase
        .from('holds')
        .select('qty, fp')
        .eq('product_id', product.id)
        .gt('expires_at', new Date().toISOString());
      const heldByOthers = (act || []).reduce((s, h) => (h.fp === fp ? s : s + Number(h.qty || 0)), 0);
      const availableNow = Number(product.stock || 0) - heldByOthers;
      if (availableNow < qty)
        return res.status(400).json({ error: 'Not enough stock right now — some pieces are reserved for 5 minutes by other buyers.' });
      if (holdId) {
        const { data: hold } = await supabase.from('holds').select('*').eq('id', holdId).maybeSingle();
        if (!hold || hold.product_id !== product.id || (fp && hold.fp !== fp)) return res.status(400).json({ error: 'Invalid reservation' });
        if (Date.parse(hold.expires_at) < Date.now()) {
          await supabase.from('holds').delete().eq('id', holdId);
          return res.status(400).json({ error: 'Reservation expired — the product was released to the store. Please re-order quickly.' });
        }
      }

      let receiptUrl = b.receipt_url ? String(b.receipt_url) : null;
      if (receiptUrl && !/^https?:\/\//.test(receiptUrl)) receiptUrl = null;
      // MANDATORY RETAIL LOGIN: retail purchases require a customer account (server-trusted identity)
      if (buyerType === 'retail') {
        const payload = verifyToken(getBearer(req));
        if (!payload || payload.role !== 'customer') {
          return res.status(401).json({ error: 'Please log in or register to purchase', code: 'AUTH_REQUIRED' });
        }
        const { data: c } = await supabase.from('customers').select('id, name, username').eq('id', payload.cid).single();
        if (!c) return res.status(401).json({ error: 'Customer session invalid — please log in again', code: 'AUTH_REQUIRED' });
        customerId = c.id;
        buyerName = c.name;
        buyerTelegram = c.username;
      }

      // Identity fields validated AFTER session overrides (server-trusted names)
      if (buyerName.length < 2) return res.status(400).json({ error: 'Please enter your full name' });
      if (buyerTelegram.length > 0 && buyerTelegram.length < 3) return res.status(400).json({ error: 'Invalid Telegram username' });

      if (paymentMethod === 'baridimob' && !receiptUrl) {
        return res.status(400).json({ error: 'Please upload your Baridimob receipt screenshot' });
      }

      let unit = Number(product.price_dzd);
      // FLASH HAPPY HOUR: live temporary discount on retail prices (server-authoritative)
      if (buyerType === 'retail') {
        const { data: frows } = await supabase.from('site_content').select('key, value').in('key', ['flash_discount_pct', 'flash_ends_at']);
        const fm = {};
        (frows || []).forEach((r) => (fm[r.key] = r.value));
        const fpct = Number(fm.flash_discount_pct) || 0;
        const fends = Date.parse(fm.flash_ends_at || '') || 0;
        if (fpct > 0 && fends > Date.now()) unit = Math.max(1, Math.round(unit * (1 - fpct / 100)));
      }
      let usdCharged = null;
      let newBalance = null;
      let notes = null;
      let status = 'pending';

      if (paymentMethod === 'wallet') {
        const wTable = buyerType === 'wholesale' ? 'wallets' : 'customer_wallets';
        const wKey = buyerType === 'wholesale' ? 'merchant_id' : 'customer_id';
        const wId = buyerType === 'wholesale' ? merchantId : customerId;
        if (!wId) return res.status(401).json({ error: 'Login required for wallet payment' });
        // Convert the DZD total to USD at the admin exchange rate, then deduct atomically
        const { data: rateRow } = await supabase.from('site_content').select('value').eq('key', 'usd_dzd_rate').maybeSingle();
        const rawRate = Number(rateRow && rateRow.value);
        const finalRate = Number.isFinite(rawRate) && rawRate > 0 ? rawRate : 270;
        usdCharged = Math.round(((unit * qty) / finalRate) * 100) / 100;

        const { data: w } = await supabase.from(wTable).select('*').eq(wKey, wId).maybeSingle();
        const balance = Number((w && w.balance_usd) || 0);
        if (!w || balance + 1e-9 < usdCharged) {
          return res.status(400).json({
            error: 'Insufficient wallet balance — please deposit first',
            required_usd: usdCharged,
            balance_usd: balance,
          });
        }
        // Conditional deduction (guards against concurrent purchases)
        const { data: wu, error: wErr } = await supabase
          .from(wTable)
          .update({ balance_usd: Math.round((balance - usdCharged) * 100) / 100, updated_at: new Date().toISOString() })
          .eq(wKey, wId)
          .gte('balance_usd', usdCharged)
          .select();
        if (wErr) throw wErr;
        if (!wu || wu.length === 0) {
          return res.status(400).json({ error: 'Insufficient wallet balance — please deposit first' });
        }
        newBalance = Math.round((balance - usdCharged) * 100) / 100;
        status = 'paid_wallet';
        notes = `Paid via wallet: -$${usdCharged.toFixed(2)} (rate ${finalRate}) — balance $${newBalance.toFixed(2)}`;
      }

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
        status,
        notes,
      };
      const { data, error } = await supabase.from('orders').insert(row).select().single();
      if (error) {
        // Refund the wallet if the order could not be created
        if (paymentMethod === 'wallet' && usdCharged !== null && buyerType) {
          try {
            const wTable2 = buyerType === 'wholesale' ? 'wallets' : 'customer_wallets';
            const wKey2 = buyerType === 'wholesale' ? 'merchant_id' : 'customer_id';
            const wId2 = buyerType === 'wholesale' ? merchantId : customerId;
            const { data: w2 } = await supabase.from(wTable2).select('balance_usd').eq(wKey2, wId2).single();
            await supabase
              .from(wTable2)
              .update({ balance_usd: Math.round((Number(w2.balance_usd) + usdCharged) * 100) / 100, updated_at: new Date().toISOString() })
              .eq(wKey2, wId2);
          } catch (re) {
            console.error('wallet refund failed', re);
          }
        }
        throw error;
      }
      // Consume real stock + release the 5-minute hold
      try {
        await supabase.from('products').update({ stock: Math.max(0, Number(product.stock || 0) - qty) }).eq('id', product.id);
      } catch (e) {
        console.error('stock decrement', e);
      }
      if (holdId) {
        try {
          await supabase.from('holds').delete().eq('id', holdId);
        } catch (e) {
          /* consumed */
        }
      }

      // Remember the buyer's numeric Telegram chat ID (only knowable inside the Mini App)
      if (tgChatId && buyerTelegram) {
        try {
          await supabase.from('tg_chat_ids').delete().eq('username', buyerTelegram.toLowerCase());
          await supabase
            .from('tg_chat_ids')
            .insert({ username: buyerTelegram.toLowerCase(), chat_id: tgChatId, updated_at: new Date().toISOString() });
        } catch (e) {
          console.error('tg chat id save', e);
        }
      }

      // VIRAL REFERRAL (escrow): retail order via a trader link → PENDING commission, anti-fraud checked
      let refExtra = '';
      const refMid = parseRefCode(refCode);
      if (refMid && buyerType === 'retail') {
        try {
          const { data: rm } = await supabase.from('merchants').select('id, first_name, last_name, status').eq('id', refMid).maybeSingle();
          if (rm && rm.status === 'approved') {
            const buyerIp = getClientIp(req);
            const { data: sec } = await supabase.from('merchant_security').select('ip, fp').eq('merchant_id', rm.id).maybeSingle();
            let blocked = false;
            let reason = '';
            if (sec && sec.fp && fp && sec.fp === fp) {
              blocked = true;
              reason = 'same device fingerprint';
            } else if (sec && sec.ip && buyerIp && sec.ip === buyerIp) {
              blocked = true;
              reason = 'same IP address';
            }
            const { data: rateRow } = await supabase.from('site_content').select('value').eq('key', 'usd_dzd_rate').maybeSingle();
            const rr = Number(rateRow && rateRow.value);
            const finalRate = Number.isFinite(rr) && rr > 0 ? rr : 270;
            const { data: pctRow } = await supabase.from('site_content').select('value').eq('key', 'ref_commission_pct').maybeSingle();
            const rp = Number(pctRow && pctRow.value);
            const pct = Number.isFinite(rp) && rp > 0 ? rp : 5;
            const totalNow = unit * qty;
            const commission = Math.round(((totalNow / finalRate) * pct) / 100 * 100) / 100;
            await supabase.from('referral_events').insert({
              merchant_id: rm.id,
              order_id: data.id,
              buyer_telegram: buyerTelegram,
              amount_dzd: totalNow,
              commission_usd: blocked ? 0 : commission,
              pct,
              status: blocked ? 'blocked' : 'pending',
              reason: reason || null,
            });
            const rmName = `${rm.first_name} ${rm.last_name}`;
            refExtra = blocked
              ? `\n🚫 ANTI-FRAUD: referral BLOCKED (${reason}) for trader ${rmName}`
              : `\n🤝 Referral: ${rmName} — $${commission.toFixed(2)} PENDING (escrow until delivery)`;
          }
        } catch (e) {
          console.error('referral create', e);
        }
      }

      // FREE-PRODUCT CHALLENGE: retail order via an invite link → PENDING credit (credited only on admin approval)
      const ch = parseChallengeCode(refCode);
      if (ch && buyerType === 'retail') {
        try {
          let valid = true;
          let reason = '';
          const { data: ident } = await supabase
            .from('challenge_identities')
            .select('fp, ip')
            .eq('inviter_type', ch.type)
            .eq('inviter_id', ch.id)
            .maybeSingle();
          if (ch.type === 'merchant' && merchantId === ch.id) {
            valid = false;
            reason = 'self referral';
          }
          if (ch.type === 'customer' && customerId === ch.id) {
            valid = false;
            reason = 'self referral';
          }
          const { data: inv } =
            ch.type === 'merchant'
              ? await supabase.from('merchants').select('id, first_name, last_name, status').eq('id', ch.id).maybeSingle()
              : await supabase.from('customers').select('id, name').eq('id', ch.id).maybeSingle();
          if (!inv) {
            valid = false;
            reason = 'inviter not found';
          } else if (ch.type === 'merchant' && inv.status !== 'approved') {
            valid = false;
            reason = 'inviter not approved';
          }
          if (valid && ident) {
            const bIp = getClientIp(req);
            const sig = hw || fp;
            if (ident.fp && sig && ident.fp === sig) {
              valid = false;
              reason = 'same device fingerprint (hardware)';
            } else if (ident.ip && bIp && ident.ip === bIp) {
              valid = false;
              reason = 'same network IP';
            }
          }
          await supabase.from('challenge_refs').insert({
            inviter_type: ch.type,
            inviter_id: ch.id,
            inviter_fp: (ident && ident.fp) || null,
            inviter_ip: (ident && ident.ip) || null,
            invitee_order_id: data.id,
            invitee_fp: hw || fp || null,
            invitee_ip: getClientIp(req) || null,
            invitee_name: buyerName,
            status: valid ? 'pending' : 'blocked',
            reason: valid ? null : reason,
          });
        } catch (e) {
          console.error('challenge ref', e);
        }
      }

      // Awaited so the serverless runtime cannot freeze the delivery mid-flight
      let alertOk = false;
      try {
        alertOk =
          paymentMethod === 'wallet'
            ? await notifyWalletOrder(supabase, data, usdCharged, newBalance)
            : await notifyNewOrder(supabase, data, refExtra);
      } catch (e) {
        console.error('tg order alert', e);
      }
      return res.status(201).json({ ...data, alert_sent: alertOk, usd_charged: usdCharged, new_balance: newBalance });
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
      // LIVRAISON DES PRODUITS: uploading the delivery screenshot marks the order as Delivered
      if (b.delivery_image_url !== undefined) {
        const url = String(b.delivery_image_url || '');
        if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: 'Invalid delivery image URL' });
        const { error: dErr } = await supabase.from('deliveries').insert({ order_id: id, image_url: url });
        if (dErr) throw dErr;
        update.status = 'delivered';
      }
      if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nothing to update' });
      const { data, error } = await supabase.from('orders').update(update).eq('id', id).select().single();
      if (error) throw error;
      // INSTANT AUTOMATION WEBHOOK on admin approval (status → delivered)
      if (update.status === 'delivered') {
        await firePurchaseWebhook(data);
      }

      // ESCROW RELEASE: delivering an order credits its pending referral commission to the trader's USD wallet
      if (update.status === 'delivered') {
        try {
          const { data: refs } = await supabase.from('referral_events').select('*').eq('order_id', id).eq('status', 'pending');
          for (const r of refs || []) {
            const { data: w } = await supabase.from('wallets').select('*').eq('merchant_id', r.merchant_id).maybeSingle();
            const nb = Math.round((Number((w && w.balance_usd) || 0) + Number(r.commission_usd || 0)) * 100) / 100;
            if (w) {
              await supabase.from('wallets').update({ balance_usd: nb, updated_at: new Date().toISOString() }).eq('merchant_id', r.merchant_id);
            } else {
              await supabase.from('wallets').insert({ merchant_id: r.merchant_id, balance_usd: nb, updated_at: new Date().toISOString() });
            }
            await supabase.from('referral_events').update({ status: 'credited' }).eq('id', r.id);
            const { data: mrow } = await supabase.from('merchants').select('first_name, last_name').eq('id', r.merchant_id).maybeSingle();
            const nm = mrow ? `${mrow.first_name} ${mrow.last_name}` : `#${r.merchant_id}`;
            notifyReferralCredited(supabase, nm, r.commission_usd, id).catch(() => {});
          }
        } catch (e) {
          console.error('referral credit error', e);
        }
      }
      // CHALLENGE (independent path): counter advances ONLY on admin-approved orders,
      // and works even when the order has NO commission row (retail friend links C-…).
      if (update.status === 'delivered') {
        try {
          const { data: crs } = await supabase.from('challenge_refs').select('*').eq('invitee_order_id', id).eq('status', 'pending');
          for (const cr of crs || []) {
            await supabase.from('challenge_refs').update({ status: 'credited' }).eq('id', cr.id);
            await maybeDrawGiftAudited(cr.inviter_type, cr.inviter_id); // coherence audit → reaching 3/3 delivers or suspends
          }
        } catch (e) {
          console.error('challenge credit', e);
        }
      }
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('orders error', err);
    return res.status(500).json({ error: err.message });
  }
}
