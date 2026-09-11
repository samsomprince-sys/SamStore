import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, Banknote, Copy, Gift, Loader2, Lock, Share2, Trophy } from 'lucide-react';
import { api } from '../lib/api';
import { copyText } from '../lib/format';
import { getFp, getHw } from '../lib/ref';
import { hapticNotify, tgAlert } from '../lib/telegram';
import { useApp } from '../context/AppContext';

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        await copyText(text);
        setOk(true);
        window.setTimeout(() => setOk(false), 1500);
      }}
      className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition shrink-0"
      aria-label="Copy challenge link"
    >
      {ok ? <BadgeCheck size={15} /> : <Copy size={15} />}
    </button>
  );
}

function TrackBar({ credited, need, accent }: { credited: number; need: number; accent: string }) {
  const pct = Math.min(100, Math.round((Math.min(credited, need) / need) * 100));
  return (
    <div className="mt-1.5 h-2.5 rounded-full bg-black/30 overflow-hidden">
      <motion.div
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', damping: 20, stiffness: 160 }}
        className={`h-full rounded-full ${accent}`}
      />
    </div>
  );
}

/** Dual cash-milestone challenge card — 5 friends → 500 DZD cash, 300 buyers → grand 10,000 DZD. */
export default function ChallengeCard({ token }: { token: string }) {
  const { tr, toast } = useApp();
  const [d, setD] = useState<{
    code: string;
    credited: number;
    pending: number;
    cfg?: { smallNeed: number; grandNeed: number; smallAmount: string; grandAmount: string };
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setD(await api.get(`/api/challenge?fp=${encodeURIComponent(getFp())}&hw=${encodeURIComponent(getHw())}`, token));
    } catch {
      /* silent */
    }
  }, [token]);

  useEffect(() => {
    load();
    const iv = window.setInterval(load, 20000);
    return () => window.clearInterval(iv);
  }, [load]);

  const credited = d?.credited ?? 0;
  const pending = d?.pending ?? 0;
  // OFFICIAL deep link schema: https://t.me/<bot>?startapp=<userId> — one tracking id per logged-in user
  const link = d?.code ? `https://t.me/AlgerianStore_bot?startapp=${d.code}` : '';
  const cfg = d?.cfg ?? { smallNeed: 5, grandNeed: 300, smallAmount: '500', grandAmount: '10000' };
  const t = (key: string) => tr(key);

  // cash claim → server sends the Telegram cash alert + mutually resets BOTH counters
  const claim = async (grand: boolean) => {
    setBusy(true);
    try {
      await api.post('/api/challenge', { action: 'claim', grand }, token);
      hapticNotify('success');
      toast('success', tr('cash_claimed'));
      await load();
    } catch (e: any) {
      tgAlert(e.message || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const smallReady = credited >= cfg.smallNeed;
  const grandReady = credited >= cfg.grandNeed;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-purple-800 to-fuchsia-900 text-white p-5 shadow-xl"
    >
      <div className="absolute -top-14 -end-14 w-44 h-44 rounded-full bg-fuchsia-400/20 blur-3xl pointer-events-none" />
      <div className="relative">
        {/* header (same purple card) */}
        <div className="flex items-start gap-2.5">
          <span className="w-10 h-10 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
            <Gift size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-[14px] leading-tight">{tr('challenge_title')}</p>
            <p className="text-[11px] text-white/75 leading-snug mt-0.5">{tr('challenge_sub')}</p>
          </div>
        </div>

        {/* SMALL MILESTONE — 5/5 → 500 DZD CASH */}
        <div className="mt-4 rounded-2xl bg-black/25 border border-white/15 p-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
              <Banknote size={14} />
            </span>
            <p className="flex-1 min-w-0 text-[12px] font-extrabold leading-snug">
              {t('cash_small_pre')} {cfg.smallNeed} {t('cash_small_mid')} {cfg.smallAmount} {t('cash_small_post')}
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10.5px] font-extrabold">
            <span className="text-white/75">{pending > 0 ? `+${pending} ${tr('cash_pending')}` : tr('cash_small_sub')}</span>
            <span className="font-mono text-[12px] bg-black/25 rounded-lg px-2 py-0.5">
              {credited}/{cfg.smallNeed} {tr('completed_lbl')}
            </span>
          </div>
          <TrackBar credited={credited} need={cfg.smallNeed} accent="bg-gradient-to-r from-amber-300 to-yellow-500 shadow-[0_0_12px_rgba(251,191,36,0.7)]" />
          {smallReady ? (
            <motion.button
              onClick={() => claim(false)}
              disabled={busy}
              animate={{
                boxShadow: [
                  '0 0 14px rgba(251,191,36,0.55)',
                  '0 0 30px rgba(251,191,36,0.95)',
                  '0 0 14px rgba(251,191,36,0.55)',
                ],
                scale: [1, 1.02, 1],
              }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="mt-2.5 w-full py-2.5 rounded-xl bg-gold text-black text-[12px] font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98] transition"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
              {t('cash_small_btn_pre')} {cfg.smallAmount} {t('cash_small_btn_post')}
            </motion.button>
          ) : (
            <button
              onClick={() => tgAlert(tr('cash_locked_s'))}
              className="mt-2.5 w-full py-2.5 rounded-xl bg-white/10 border border-white/15 text-white/60 text-[11.5px] font-extrabold flex items-center justify-center gap-1.5 active:scale-[0.99] transition"
            >
              <Lock size={13} /> {t('cash_locked_s_pre')} {cfg.smallNeed} {t('cash_locked_s_post')}
            </button>
          )}
        </div>

        {/* GRAND MILESTONE — 300/300 → 10,000 DZD CASH */}
        <div className="mt-2.5 rounded-2xl bg-black/25 border border-white/15 p-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-fuchsia-400/20 text-fuchsia-300 flex items-center justify-center shrink-0">
              <Trophy size={14} />
            </span>
            <p className="flex-1 min-w-0 text-[12px] font-extrabold leading-snug">
              {t('cash_grand_pre')} {cfg.grandNeed} {t('cash_grand_mid')} {cfg.grandAmount} {t('cash_grand_post')}
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10.5px] font-extrabold">
            <span className="text-white/75">{tr('cash_grand_sub')}</span>
            <span className="font-mono text-[12px] bg-black/25 rounded-lg px-2 py-0.5">
              {credited}/{cfg.grandNeed} {tr('completed_lbl')}
            </span>
          </div>
          <TrackBar credited={credited} need={cfg.grandNeed} accent="bg-gradient-to-r from-fuchsia-400 to-purple-500 shadow-[0_0_12px_rgba(217,70,239,0.7)]" />
          {grandReady ? (
            <motion.button
              onClick={() => claim(true)}
              disabled={busy}
              animate={{
                boxShadow: [
                  '0 0 14px rgba(217,70,239,0.55)',
                  '0 0 30px rgba(217,70,239,0.95)',
                  '0 0 14px rgba(217,70,239,0.55)',
                ],
                scale: [1, 1.02, 1],
              }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="mt-2.5 w-full py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-[12px] font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98] transition"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Trophy size={14} />}
              {t('cash_grand_btn_pre')} {cfg.grandAmount} {t('cash_grand_btn_post')}
            </motion.button>
          ) : (
            <button
              onClick={() => tgAlert(tr('cash_locked_g'))}
              className="mt-2.5 w-full py-2.5 rounded-xl bg-white/10 border border-white/15 text-white/60 text-[11.5px] font-extrabold flex items-center justify-center gap-1.5 active:scale-[0.99] transition"
            >
              <Lock size={13} /> {t('cash_locked_g_pre')} {cfg.grandNeed} {t('cash_locked_g_post')}
            </button>
          )}
        </div>

        {/* shared invite link (unchanged) */}
        <div className="mt-3 flex gap-2">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            className="flex-1 min-w-0 bg-black/25 border border-white/15 rounded-xl px-3 py-2.5 text-[10.5px] font-mono text-white/90 outline-none"
          />
          {d ? <CopyBtn text={link} /> : <Loader2 size={15} className="animate-spin self-center" />}
          <button
            onClick={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}`, '_blank')}
            className="p-2.5 rounded-xl bg-[#229ED9]/30 hover:bg-[#229ED9]/45 text-white transition shrink-0"
            title="Telegram"
            aria-label="Share on Telegram"
          >
            <Share2 size={15} />
          </button>
        </div>
        <p className="mt-2 text-[9.5px] text-white/60 font-semibold leading-snug text-center">{tr('claim_rule_note')}</p>
      </div>
    </motion.div>
  );
}
