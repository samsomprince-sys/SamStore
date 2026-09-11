import supabase from './db-client.js';
import { setCors, requireAdmin, verifyToken, getBearer, refCodeFor, challengeCodeForCustomer, getSecurityConfig } from './_lib.js';
import { sendAdminAlert } from './_telegram.js';

const GOAL = 3;

// LIVE MILESTONE CONFIGURATOR — admin-editable anytime via site_content
async function getMilestoneCfg() {
  const fallback = { smallNeed: 5, grandNeed: 300, smallAmount: '500', grandAmount: '10000' };
  try {
    const { data } = await supabase
      .from('site_content')
      .select('key, value')
      .in('key', ['cash_small_need', 'cash_small_amount', 'cash_grand_need', 'cash_grand_amount']);
    const m = {};
    (data || []).forEach((r) => (m[r.key] = r.value));
    return {
      smallNeed: Math.max(1, parseInt(m.cash_small_need, 10) || 5),
      grandNeed: Math.max(1, parseInt(m.cash_grand_need, 10) || 300),
      smallAmount: String(m.cash_small_amount || '500').trim(),
      grandAmount: String(m.cash_grand_amount || '10000').trim(),
    };
  } catch {
    return fallback;
  }
}

// Draw one unused gift screenshot from the pool and auto-deliver it in-app.
// REW_CHALLENGE coherence auditor: frauds trying to farm 3/3 fast get auto-suspended for manual review.
export async function maybeDrawGiftAudited(inviterType, inviterId) {
  try {
    const { data: credits } = await supabase
      .from('challenge_refs')
      .select('created_at, invitee_fp, invitee_ip')
      .eq('inviter_type', inviterType)
      .eq('inviter_id', inviterId)
      .eq('status', 'credited');
    const rows = credits || [];
    if (rows.length < GOAL) return false;

    const times = rows.map((r) => Date.parse(r.created_at)).sort((a, b) => a - b);
    const cluster = times.length >= 3 && times[times.length - 1] - times[0] <= 5 * 60 * 1000;
    const fps = new Set(rows.map((r) => r.invitee_fp).filter(Boolean));
    const ips = new Set(rows.map((r) => r.invitee_ip).filter(Boolean));
    const correlated = rows.length >= 3 && (fps.size === 1 || ips.size === 1);

    if (cluster || correlated) {
      const secAud = await getSecurityConfig(supabase);
      const why = `${cluster ? '5-minute purchase cluster' : ''}${cluster && correlated ? ' + ' : ''}${correlated ? 'correlated device fingerprints / IPs' : ''}`;
      // Sécurité AI sensitivity: low = flag only (gift still delivers), medium = suspend + flag, high = suspend + 24h freeze
      const high = secAud.level === 'high';
      await supabase.from('fraud_flags').insert({
        actor_type: inviterType,
        actor_id: inviterId,
        reason: `High Fraud Risk: challenge coherence audit (${why})`,
        frozen_until: high ? new Date(Date.now() + 24 * 3600 * 1000).toISOString() : null,
      });
      sendAdminAlert(
        supabase,
        `🚨 <b>${high ? 'HIGH FRAUD RISK — actor FROZEN 24h' : secAud.level === 'medium' ? 'HIGH FRAUD RISK — challenge gift SUSPENDED' : 'FRAUD SIGNAL (low sensitivity)'}</b>\n👤 ${inviterType} #${inviterId}\n🧠 Audit: ${why}\n👉 Review in Admin → Sécurité AI.`
      ).catch(() => {});
      if (secAud.level === 'low') return false; // cash milestones: audit-only, never auto-credit
      return false;
    }
    return false; // cash milestones: rewards are manual admin cash payouts via Telegram alerts
  } catch (e) {
    console.error('challenge audit', e);
    return false;
  }
}

export async function maybeDrawGift(inviterType, inviterId) {
  try {
    const { data: credits } = await supabase
      .from('challenge_refs')
      .select('id')
      .eq('inviter_type', inviterType)
      .eq('inviter_id', inviterId)
      .eq('status', 'credited');
    if ((credits || []).length < GOAL) return false;

    const { data: existing } = await supabase
      .from('gift_deliveries')
      .select('id')
      .eq('inviter_type', inviterType)
      .eq('inviter_id', inviterId)
      .limit(1);
    if (existing && existing.length) return true; // already rewarded

    const { data: gift } = await supabase.from('gift_pool').select('*').eq('used', false).order('id', { ascending: true }).limit(1);
    if (!gift || !gift.length) {
      sendAdminAlert(
        supabase,
        `⚠️ <b>GIFT POOL EMPTY</b> — a user reached 3/3 challenge referrals (${inviterType} #${inviterId}) but no reward image is stocked. Upload in Admin → Products → Gift Products Pool.`
      ).catch(() => {});
      return false;
    }
    await supabase.from('gift_pool').update({ used: true }).eq('id', gift[0].id);
    await supabase.from('gift_deliveries').insert({ inviter_type: inviterType, inviter_id: inviterId, image_url: gift[0].image_url });
    sendAdminAlert(
      supabase,
      `🎁 <b>Free gift auto-delivered</b> — ${inviterType} #${inviterId} completed the 3/3 referral challenge. In-app glowing notification sent with the reward image.`
    ).catch(() => {});
    return true;
  } catch (e) {
    console.error('gift draw', e);
    return false;
  }
}

async function getActor(req) {
  const payload = verifyToken(getBearer(req));
  if (!payload) return null;
  if (payload.role === 'merchant') {
    const { data } = await supabase.from('merchants').select('id, status').eq('id', payload.mid).single();
    if (!data) return null;
    return { type: 'merchant', id: data.id, approved: data.status === 'approved' };
  }
  if (payload.role === 'customer') return { type: 'customer', id: payload.cid, approved: true };
  if (payload.role === 'admin') return { type: 'admin', id: 0, approved: true };
  return null;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    /* ---------------- GET: challenge state ---------------- */
    if (req.method === 'GET') {
      const actor = await getActor(req);
      if (!actor) return res.status(401).json({ error: 'Login required' });

      if ((req.query && req.query.mode) === 'admin') {
        if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
        const { data: pool } = await supabase.from('gift_pool').select('*').order('id', { ascending: false }).limit(100);
        const { data: refs } = await supabase.from('challenge_refs').select('*').order('id', { ascending: false }).limit(500);
        const cfg = await getMilestoneCfg();

        // ACTIVE REFERRERS DATABASE TABLE — aggregate per inviter
        const agg = {};
        (refs || []).forEach((r) => {
          const k = `${r.inviter_type}:${r.inviter_id}`;
          if (!agg[k]) agg[k] = { inviter_type: r.inviter_type, inviter_id: r.inviter_id, credited: 0, pending: 0, claimed: 0, blocked: 0, total: 0 };
          agg[k].total += 1;
          if (agg[k][r.status] !== undefined) agg[k][r.status] += 1;
        });
        const cids = [...new Set(Object.values(agg).filter((a) => a.inviter_type === 'customer').map((a) => a.inviter_id))];
        const mids = [...new Set(Object.values(agg).filter((a) => a.inviter_type === 'merchant').map((a) => a.inviter_id))];
        const names = {};
        if (cids.length) {
          const { data: cs } = await supabase.from('customers').select('id, name').in('id', cids);
          (cs || []).forEach((c) => (names[`customer:${c.id}`] = c.name));
        }
        if (mids.length) {
          const { data: ms } = await supabase.from('merchants').select('id, first_name, last_name').in('id', mids);
          (ms || []).forEach((m) => (names[`merchant:${m.id}`] = `${m.first_name} ${m.last_name}`));
        }
        const referrers = Object.values(agg)
          .map((a) => ({ ...a, name: names[`${a.inviter_type}:${a.inviter_id}`] || `User #${a.inviter_id}` }))
          .sort((a, b) => b.credited - a.credited)
          .slice(0, 100);

        const { data: claims } = await supabase.from('challenge_claims').select('*').order('id', { ascending: false }).limit(100);
        return res.status(200).json({ pool: pool || [], refs: refs || [], cfg, referrers, claims: claims || [] });
      }

      const snap = String((req.query && (req.query.hw || req.query.fp)) || '').slice(0, 64) || null;
      // snapshot inviter fingerprint + IP (anti-fraud compare at purchase time)
      if ((actor.type === 'merchant' || actor.type === 'customer') && actor.approved) {
        try {
          await supabase.from('challenge_identities').delete().eq('inviter_type', actor.type).eq('inviter_id', actor.id);
          await supabase.from('challenge_identities').insert({
            inviter_type: actor.type,
            inviter_id: actor.id,
            fp: snap,
            ip: getClientIp(req),
            updated_at: new Date().toISOString(),
          });
        } catch (e) {
          console.error('identity snapshot', e);
        }
      }

      const { data: refs } = await supabase
        .from('challenge_refs')
        .select('status')
        .eq('inviter_type', actor.type)
        .eq('inviter_id', actor.id);
      const credited = (refs || []).filter((r) => r.status === 'credited').length;
      const pending = (refs || []).filter((r) => r.status === 'pending').length;

      const cfg = await getMilestoneCfg();
      return res.status(200).json({
        // buyer link = plain unique database user id (?ref=12345) — one custom tracking id per account
        code: actor.type === 'merchant' ? refCodeFor(actor.id) : String(actor.id),
        credited,
        pending,
        cfg,
      });
    }

    /* ---------------- POST: claim (owner) / add+remove (admin) ---------------- */
    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.action === 'claim') {
        const actor = await getActor(req);
        if (!actor || actor.type === 'admin') return res.status(401).json({ error: 'Login required' });

        const { data: credits } = await supabase
          .from('challenge_refs')
          .select('id')
          .eq('inviter_type', actor.type)
          .eq('inviter_id', actor.id)
          .eq('status', 'credited');
        const count = (credits || []).length;
        const cfg = await getMilestoneCfg();
        const grand = b.grand === true;
        const need = grand ? cfg.grandNeed : cfg.smallNeed;
        if (count < need) return res.status(400).json({ error: `Not enough completed purchases (${count}/${need})` });

        // resolve inviter display name
        let name = `#${actor.id}`;
        if (actor.type === 'merchant') {
          const { data: m } = await supabase.from('merchants').select('first_name, last_name').eq('id', actor.id).maybeSingle();
          if (m) name = `${m.first_name} ${m.last_name}`;
        } else {
          const { data: c } = await supabase.from('customers').select('name').eq('id', actor.id).maybeSingle();
          if (c) name = c.name;
        }

        // HIGH-PRIORITY Telegram cash alert to the admin (exact wording)
        await sendAdminAlert(
          supabase,
          grand
            ? `🏆 ⚡ <b>جائزة المليون الكبرى:</b> المستخدم ${name} وصل إلى ${cfg.grandNeed} زبون يشتري بنجاح ويطلب الجائزة الكبرى ${cfg.grandAmount} دج!\n👉 راجع وادفع يدويًا فورًا.`
            : `💵 ⚡ <b>طلب مكافأة كاش:</b> المستخدم ${name} أكمل تحدي الـ ${cfg.smallNeed} إحالات ويطلب ${cfg.smallAmount} دج كاش يدويًا!\n👉 راجع وادفع يدويًا فورًا.`
        );

        // PENDING CASH CLAIM queue row for the admin verification dashboard
        await supabase
          .from('challenge_claims')
          .insert({ inviter_type: actor.type, inviter_id: actor.id, inviter_name: name, milestone: grand ? 'grand' : 'small', amount_dzd: grand ? cfg.grandAmount : cfg.smallAmount, status: 'pending' });

        // MUTUAL RESET RULE: both counters derive from credited rows → wipe them all (0/5 and 0/300)
        const { error: cErr } = await supabase
          .from('challenge_refs')
          .update({ status: 'claimed' })
          .eq('inviter_type', actor.type)
          .eq('inviter_id', actor.id)
          .eq('status', 'credited');
        if (cErr) throw cErr;
        return res.status(200).json({ ok: true, milestone: grand ? 'grand' : 'small', credited_before: count });
      }
      if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
      if (b.action === 'add') {
        const url = String(b.image_url || '');
        if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: 'Invalid image URL' });
        const { data, error } = await supabase.from('gift_pool').insert({ image_url: url, used: false }).select().single();
        if (error) throw error;
        return res.status(201).json(data);
      }
      if (b.action === 'remove') {
        const id = parseInt(b.id, 10);
        if (!id) return res.status(400).json({ error: 'id required' });
        const { error } = await supabase.from('gift_pool').delete().eq('id', id).eq('used', false);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
      if (b.action === 'admin_set_count' || b.action === 'admin_reset_count') {
        if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
        const it = String(b.inviter_type);
        const iid = parseInt(b.inviter_id, 10);
        if (!['merchant', 'customer'].includes(it) || !iid) return res.status(400).json({ error: 'invalid inviter' });
        const { data: creds } = await supabase
          .from('challenge_refs')
          .select('id')
          .eq('inviter_type', it)
          .eq('inviter_id', iid)
          .eq('status', 'credited')
          .order('id', { ascending: true });
        const cur = (creds || []).length;
        const target = b.action === 'admin_reset_count' ? 0 : Math.max(0, parseInt(b.count, 10) || 0);
        if (target > cur) {
          const rows = Array.from({ length: target - cur }).map(() => ({
            inviter_type: it,
            inviter_id: iid,
            invitee_name: '⚙️ admin-adjust',
            status: 'credited',
            reason: 'manual admin count edit',
          }));
          const { error } = await supabase.from('challenge_refs').insert(rows);
          if (error) throw error;
        } else if (target < cur) {
          const drop = (creds || []).slice().sort((a, b) => b.id - a.id).slice(0, cur - target).map((r) => r.id);
          if (drop.length) {
            const { error } = await supabase.from('challenge_refs').update({ status: 'claimed' }).in('id', drop);
            if (error) throw error;
          }
        }
        return res.status(200).json({ ok: true, credited: target });
      }
      if (b.action === 'admin_pay_claim') {
        if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
        const id = parseInt(b.id, 10);
        if (!id) return res.status(400).json({ error: 'id required' });
        const { data, error } = await supabase
          .from('challenge_claims')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('challenge error', err);
    return res.status(500).json({ error: err.message });
  }
}
