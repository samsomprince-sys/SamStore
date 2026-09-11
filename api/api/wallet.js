import supabase from './db-client.js';
import { setCors, requireAdmin, verifyToken, getBearer, refCodeFor, getClientIp, isFrozen, velocityHit, getSecurityConfig } from './_lib.js';
import { notifyDepositRequest, notifyDepositHandled } from './_telegram.js';

const CRYPTO_FEE_USD = 2.0;

async function getMerchantRow(req) {
  const payload = verifyToken(getBearer(req));
  if (!payload || payload.role !== 'merchant') return null;
  const { data } = await supabase
    .from('merchants')
    .select('id, first_name, last_name, status')
    .eq('id', payload.mid)
    .single();
  return data || null;
}

// Dual-actor wallet access: approved merchants AND retail customers share the same wallet engine.
async function getWalletActor(req) {
  const payload = verifyToken(getBearer(req));
  if (!payload) return null;
  if (payload.role === 'merchant') {
    const { data } = await supabase
      .from('merchants')
      .select('id, first_name, last_name, status')
      .eq('id', payload.mid)
      .single();
    if (!data) return null;
    return {
      kind: 'merchant',
      id: data.id,
      name: `${data.first_name} ${data.last_name}`,
      approved: data.status === 'approved',
      merchantRow: data,
    };
  }
  if (payload.role === 'customer') {
    const { data } = await supabase.from('customers').select('id, name, username').eq('id', payload.cid).single();
    if (!data) return null;
    return { kind: 'customer', id: data.id, name: data.name, approved: true, customerRow: data };
  }
  return null;
}

// table/column mapping per actor kind
const WALLET_MAP = {
  merchant: { walletTable: 'wallets', depositTable: 'deposits', idCol: 'merchant_id', nameTable: 'merchants' },
  customer: { walletTable: 'customer_wallets', depositTable: 'customer_deposits', idCol: 'customer_id', nameTable: 'customers' },
};

async function getContentNum(key, fallback) {
  const { data } = await supabase.from('site_content').select('value').eq('key', key).maybeSingle();
  const n = Number(data && data.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const round2 = (n) => Math.round(n * 100) / 100;

async function buildLeaderboard() {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: deps } = await supabase
    .from('deposits')
    .select('merchant_id, usd_credited')
    .eq('status', 'approved')
    .gte('created_at', since);
  const sums = {};
  (deps || []).forEach((d) => {
    sums[d.merchant_id] = Math.round(((sums[d.merchant_id] || 0) + Number(d.usd_credited || 0)) * 100) / 100;
  });
  const ids = Object.keys(sums).map(Number);
  const names = {};
  if (ids.length) {
    const { data: ms } = await supabase.from('merchants').select('id, first_name, last_name').in('id', ids);
    (ms || []).forEach((m) => (names[m.id] = `${m.first_name} ${m.last_name}`));
  }
  return ids
    .map((id) => ({ merchant_id: id, name: names[id] || `#${id}`, total_usd: sums[id] }))
    .sort((a, b) => b.total_usd - a.total_usd)
    .slice(0, 10);
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    /* ---------------- GET ---------------- */
    if (req.method === 'GET') {
      const mode = String((req.query && req.query.mode) || 'merchant');
      const rate = await getContentNum('usd_dzd_rate', 270);
      const feeDzd = await getContentNum('baridimob_fee_dzd', 50);

      if (mode === 'admin') {
        if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
        const { data: deposits, error } = await supabase
          .from('deposits')
          .select('*')
          .order('id', { ascending: false })
          .limit(200);
        if (error) throw error;
        const ids = [...new Set((deposits || []).map((d) => d.merchant_id))];
        let merchants = [];
        if (ids.length > 0) {
          const { data: ms } = await supabase.from('merchants').select('id, first_name, last_name').in('id', ids);
          merchants = ms || [];
        }
        const nameOf = (id) => {
          const m = merchants.find((x) => x.id === id);
          return m ? `${m.first_name} ${m.last_name}` : `#${id}`;
        };

        // Retail customer deposits (same review workflow)
        const { data: retailDeps } = await supabase
          .from('customer_deposits')
          .select('*')
          .order('id', { ascending: false })
          .limit(200);
        const cids = [...new Set((retailDeps || []).map((d) => d.customer_id))];
        let customers = [];
        if (cids.length > 0) {
          const { data: cs } = await supabase.from('customers').select('id, name, username').in('id', cids);
          customers = cs || [];
        }
        const cNameOf = (id) => {
          const c = customers.find((x) => x.id === id);
          return c ? `${c.name} (@${c.username})` : `#${id}`;
        };

        return res.status(200).json({
          deposits: (deposits || []).map((d) => ({ ...d, merchant_name: nameOf(d.merchant_id) })),
          retailDeposits: (retailDeps || []).map((d) => ({ ...d, merchant_name: cNameOf(d.customer_id), kind: 'customer' })),
          rate,
          feeDzd,
          leaderboard: await buildLeaderboard(),
        });
      }

      const actor = await getWalletActor(req);
      if (!actor) return res.status(401).json({ error: 'Login required' });
      if (!actor.approved) return res.status(403).json({ error: 'Account not approved yet' });
      const mw = WALLET_MAP[actor.kind];
      const { data: w } = await supabase.from(mw.walletTable).select('*').eq(mw.idCol, actor.id).maybeSingle();
      const { data: deps } = await supabase
        .from(mw.depositTable)
        .select('*')
        .eq(mw.idCol, actor.id)
        .order('id', { ascending: false })
        .limit(10);

      if (actor.kind === 'customer') {
        return res.status(200).json({
          balance: Number((w && w.balance_usd) || 0),
          rate,
          feeDzd,
          deposits: deps || [],
        });
      }

      // Merchant: referral identity + pending/credited commission stats (escrow ledger)
      let refStats = { pending_usd: 0, credited_usd: 0, sales: 0 };
      try {
        const { data: refs } = await supabase.from('referral_events').select('status, commission_usd').eq('merchant_id', actor.id);
        (refs || []).forEach((r) => {
          if (r.status === 'pending') refStats.pending_usd = Math.round((refStats.pending_usd + Number(r.commission_usd || 0)) * 100) / 100;
          if (r.status === 'credited') refStats.credited_usd = Math.round((refStats.credited_usd + Number(r.commission_usd || 0)) * 100) / 100;
          if (r.status !== 'blocked') refStats.sales += 1;
        });
      } catch (e) {
        console.error('ref stats', e);
      }
      return res.status(200).json({
        balance: Number((w && w.balance_usd) || 0),
        rate,
        feeDzd,
        deposits: deps || [],
        refCode: refCodeFor(actor.id),
        refStats,
        leaderboard: await buildLeaderboard(),
      });
    }

    /* ---------------- POST: merchant OR retail customer creates a deposit request ---------------- */
    if (req.method === 'POST') {
      const actor = await getWalletActor(req);
      if (!actor) return res.status(401).json({ error: 'Login required' });
      if (!actor.approved) return res.status(403).json({ error: 'Account not approved yet' });
      const md = WALLET_MAP[actor.kind];

      // request body decoded FIRST so no gate can hit a temporal-dead-zone reference error
      const b = req.body || {};

      // ---------- ANTI-FRAUD GATE (frozen? velocity of empty-proof submissions?) ----------
      const fp = String(b.fp || '').slice(0, 64) || null;
      const hw = String(b.hw || '').slice(0, 64) || null;
      const reqIp = getClientIp(req);
      const frozenGate = await isFrozen(supabase, fp, hw, reqIp);
      if (frozenGate) return res.status(423).json({ error: 'Suspicious Behavior — حسابك مجمّد مؤقتًا لمدة 24 ساعة.' });
      const secDep = await getSecurityConfig(supabase);
      const vel2 = await velocityHit(supabase, {
        fp,
        hw,
        ip: reqIp,
        bucket: 'deposit',
        limit: secDep.limit,
        windowMs: 10 * 60 * 1000,
        actorType: actor.kind,
        actorId: actor.id,
        reason: '3+ rapid deposit submissions (possible empty-proof bot)',
      });
      if (vel2.frozen) return res.status(423).json({ error: 'Suspicious Behavior — حسابك مجمّد مؤقتًا لمدة 24 ساعة.' });

      const method = String(b.method || '');
      const amount = Number(b.amount_input);
      const proof = b.proof_url ? String(b.proof_url) : null;
      if (!['usdt', 'baridimob'].includes(method)) return res.status(400).json({ error: 'Invalid payment method' });
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000)
        return res.status(400).json({ error: 'Invalid amount' });
      if (!proof || !/^https?:\/\//.test(proof))
        return res.status(400).json({ error: 'Transaction proof image is required' });

      const rate = await getContentNum('usd_dzd_rate', 270);
      const feeDzd = await getContentNum('baridimob_fee_dzd', 50);

      let fee, credit;
      if (method === 'usdt') {
        fee = CRYPTO_FEE_USD; // Total to Pay = amount + $2.00 fixed fee (displayed to merchant)
        credit = round2(amount); // credited USD = deposited USD amount
      } else {
        fee = feeDzd; // fixed Baridimob fee in DZD (displayed separately)
        credit = round2(amount / rate); // USD Credited = DZD amount / admin exchange rate
      }

      const row = {
        [md.idCol]: actor.id,
        method,
        amount_input: amount,
        fee,
        usd_credited: credit,
        rate: method === 'baridimob' ? rate : null,
        proof_url: proof,
        status: 'pending',
      };
      const { data, error } = await supabase.from(md.depositTable).insert(row).select().single();
      if (error) throw error;

      let alertOk = false;
      try {
        alertOk = await notifyDepositRequest(
          supabase,
          data,
          `${actor.name}${actor.kind === 'customer' ? ' (retail buyer)' : ''}`
        );
      } catch (e) {
        console.error('tg deposit alert', e);
      }
      return res.status(201).json({ ...data, alert_sent: alertOk });
    }

    /* ---------------- PUT: admin approves / rejects (trader or retail) ---------------- */
    if (req.method === 'PUT') {
      if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
      const b = req.body || {};
      const id = parseInt(b.id, 10);
      const action = b.action === 'approve' ? 'approved' : b.action === 'reject' ? 'rejected' : null;
      const kind = b.kind === 'customer' ? 'customer' : 'merchant';
      const mp = WALLET_MAP[kind];
      if (!id || !action) return res.status(400).json({ error: 'id and valid action are required' });

      const { data: upd, error: uErr } = await supabase
        .from(mp.depositTable)
        .update({ status: action })
        .eq('id', id)
        .eq('status', 'pending')
        .select()
        .single();
      if (uErr || !upd) return res.status(409).json({ error: 'Deposit missing or already processed' });

      const ownerId = mp.idCol === 'merchant_id' ? upd.merchant_id : upd.customer_id;
      let newBalance = null;
      if (action === 'approved') {
        // Instantly credit the owner's virtual USD wallet
        const { data: w } = await supabase.from(mp.walletTable).select('*').eq(mp.idCol, ownerId).maybeSingle();
        newBalance = round2(Number((w && w.balance_usd) || 0) + Number(upd.usd_credited || 0));
        if (w) {
          const { error: wErr } = await supabase
            .from(mp.walletTable)
            .update({ balance_usd: newBalance, updated_at: new Date().toISOString() })
            .eq(mp.idCol, ownerId);
          if (wErr) throw wErr;
        } else {
          const { error: wErr } = await supabase
            .from(mp.walletTable)
            .insert({ [mp.idCol]: ownerId, balance_usd: newBalance, updated_at: new Date().toISOString() });
          if (wErr) throw wErr;
        }
      }

      let name = `#${ownerId}`;
      if (kind === 'merchant') {
        const { data: mrow } = await supabase.from('merchants').select('first_name, last_name').eq('id', ownerId).maybeSingle();
        if (mrow) name = `${mrow.first_name} ${mrow.last_name}`;
      } else {
        const { data: crow } = await supabase.from('customers').select('name, username').eq('id', ownerId).maybeSingle();
        if (crow) name = `${crow.name} (@${crow.username})`;
      }

      let alertOk = false;
      try {
        alertOk = await notifyDepositHandled(supabase, upd, name, newBalance);
      } catch (e) {
        console.error('tg deposit handled alert', e);
      }
      return res.status(200).json({ ...upd, merchant_name: name, new_balance: newBalance, alert_sent: alertOk });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('wallet error', err);
    return res.status(500).json({ error: err.message });
  }
}
