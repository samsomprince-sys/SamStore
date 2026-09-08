import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, Check, Coins, Copy, Landmark, Loader2, UploadCloud, Wallet, X } from 'lucide-react';
import { api, fileToBase64, fileToDataUrl } from '../lib/api';
import { copyText, fmtDZD, fmtUSD } from '../lib/format';
import { getFp, getHw } from '../lib/ref';
import { hapticNotify } from '../lib/telegram';
import { beaconDeposit } from '../lib/tgBeacon';
import { setPresence } from '../lib/presence';
import { useApp } from '../context/AppContext';

function CopyChip({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        await copyText(text);
        setOk(true);
        window.setTimeout(() => setOk(false), 1500);
      }}
      className="shrink-0 p-2 rounded-lg bg-acc/10 text-acc hover:bg-acc/20 transition"
      aria-label="Copy"
    >
      {ok ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

export default function DepositModal({
  open,
  rate,
  feeDzd,
  onClose,
  onDone,
}: {
  open: boolean;
  rate: number;
  feeDzd: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { tr, t, merchant, customer, toast } = useApp();
  // Shared deposit engine: approved merchants AND logged-in retail customers
  const actorToken = merchant?.token ?? customer?.token ?? null;
  const actorName = merchant ? `${merchant.first_name} ${merchant.last_name}` : customer ? customer.name : '';
  const [method, setMethod] = useState<'usdt' | 'baridimob'>('usdt');
  const [amount, setAmount] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [liveRate, setLiveRate] = useState(rate);
  const [liveFee, setLiveFee] = useState(feeDzd);

  // Always pull the admin's latest exchange rate & Baridimob fee when the
  // modal opens — admin edits are reflected immediately, nothing hardcoded.
  useEffect(() => {
    setLiveRate(rate);
    setLiveFee(feeDzd);
    if (open && actorToken) {
      api
        .get<any>('/api/wallet', actorToken)
        .then((d) => {
          const r = Number(d?.rate);
          const f = Number(d?.feeDzd);
          if (Number.isFinite(r) && r > 0) setLiveRate(r);
          if (Number.isFinite(f) && f >= 0) setLiveFee(f);
        })
        .catch(() => {
          /* keep prop fallbacks */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rate, feeDzd, actorToken]);

  useEffect(() => {
    if (open) {
      // 95% intent: payment/deposit modal entered
      setPresence({ page: 'Wallet deposit checkout', intent: 95 });
      setMethod('usdt');
      setAmount('');
      setProof(null);
      setPreview('');
      setErr('');
      setDone(false);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const amt = Number(amount);
  const validAmt = Number.isFinite(amt) && amt > 0;

  // Formulas (exactly as specified):
  //  USDT      → Total to Pay = Deposited USD + $2.00 fixed crypto fee
  //  Baridimob → USD Credited = Deposited DZD / admin exchange rate  (+ separate fixed DZD fee)
  const totalUsdt = validAmt ? amt + 2 : 0;
  // Baridimob formulas (exact): Total = DZD amount + fixed DZD fee | USD credited = DZD amount / admin rate
  const totalDzd = validAmt ? amt + liveFee : 0;
  const creditBar = validAmt ? Math.round((amt / liveRate) * 100) / 100 : 0;

  const ready = validAmt && !!proof;

  const submit = async () => {
    setErr('');
    if (!validAmt) return setErr(tr('v_amount'));
    if (!proof) return setErr(tr('v_proof'));
    if (!actorToken) return;
    setBusy(true);
    try {
      const base64 = await fileToBase64(proof);
      const up = await api.post<{ url: string }>('/api/upload', {
        bucket: 'receipts',
        fileName: proof.name,
        fileBase64: base64,
        contentType: proof.type,
      });
      const r = await api.post<any>(
        '/api/wallet',
        { method, amount_input: amt, proof_url: up.url, fp: getFp(), hw: getHw() },
        actorToken
      );
      if (!r?.alert_sent) {
        beaconDeposit(
          { method, amount_input: amt, fee: method === 'usdt' ? 2 : liveFee, usd_credited: method === 'usdt' ? amt : creditBar, rate: liveRate },
          actorName
        );
      }
      setDone(true);
      hapticNotify('success');
      toast('success', tr('deposit_sent_title'));
      onDone();
    } catch (e: any) {
      setErr(e.message || 'Error');
      hapticNotify('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={(e: any) => e.stopPropagation()}
            className="w-full sm:w-[min(94vw,460px)] max-h-[92dvh] overflow-y-auto no-scrollbar bg-card border border-line rounded-t-3xl sm:rounded-3xl shadow-2xl"
          >
            {done ? (
              <div className="p-7 flex flex-col items-center text-center gap-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 220, delay: 0.05 }}
                  className="w-16 h-16 rounded-full bg-acc/15 text-acc flex items-center justify-center"
                >
                  <BadgeCheck size={34} />
                </motion.div>
                <h3 className="text-lg font-extrabold">{tr('deposit_sent_title')}</h3>
                <p className="text-sm text-mut leading-relaxed">{tr('deposit_sent_msg')}</p>
                <button onClick={onClose} className="mt-1 w-full py-3 rounded-xl tg-btn font-bold text-sm active:scale-[0.98] transition">
                  {tr('back_to_store')}
                </button>
              </div>
            ) : (
              <div className="p-5">
                <div className="flex items-center gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center shrink-0">
                    <Wallet size={19} />
                  </span>
                  <h3 className="font-extrabold text-base flex-1">{tr('deposit_title')}</h3>
                  <button onClick={onClose} className="p-2 rounded-full bg-soft text-mut hover:text-ink transition shrink-0" aria-label="Close">
                    <X size={16} />
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setMethod('usdt')}
                    className={`p-3 rounded-2xl border text-start transition active:scale-[0.98] ${
                      method === 'usdt' ? 'border-acc bg-acc/10' : 'border-line bg-soft'
                    }`}
                  >
                    <Coins size={18} className={method === 'usdt' ? 'text-acc' : 'text-mut'} />
                    <p className="mt-1.5 text-xs font-extrabold">Crypto (USDT)</p>
                    <p className="text-[10px] text-mut">{tr('usdt_desc')}</p>
                  </button>
                  <button
                    onClick={() => setMethod('baridimob')}
                    className={`p-3 rounded-2xl border text-start transition active:scale-[0.98] ${
                      method === 'baridimob' ? 'border-acc bg-acc/10' : 'border-line bg-soft'
                    }`}
                  >
                    <Landmark size={18} className={method === 'baridimob' ? 'text-acc' : 'text-mut'} />
                    <p className="mt-1.5 text-xs font-extrabold">Baridimob (DZD)</p>
                    <p className="text-[10px] text-mut">{tr('baridimob_desc')}</p>
                  </button>
                </div>

                <div className="mt-3">
                  <label className="block text-[11px] font-extrabold text-mut uppercase tracking-wide mb-1">
                    {method === 'usdt' ? tr('amount_usd') : tr('amount_dzd')}
                  </label>
                  <div className="relative">
                    <input
                      value={amount}
                      inputMode="decimal"
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="0"
                      className="w-full bg-soft border border-line rounded-xl px-3.5 py-3 pe-16 text-lg font-extrabold outline-none focus:border-acc transition"
                    />
                    <span className="absolute end-4 top-1/2 -translate-y-1/2 text-sm font-extrabold text-gold">
                      {method === 'usdt' ? '$ USD' : 'DZD'}
                    </span>
                  </div>
                  {/* Deposit screen strictly shows: amount input + exchange rate + fixed fee lines (no purchase elements) */}
                  {method === 'baridimob' && (
                    <p className="mt-1.5 text-[11px] font-bold text-mut">
                      {tr('exchange_rate_lbl')}: <span className="text-ink">1 USD = {liveRate} DZD</span>
                    </p>
                  )}
                </div>

                {validAmt && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 bg-soft rounded-2xl p-3.5 space-y-1.5 text-[12.5px] font-semibold"
                  >
                    {method === 'usdt' ? (
                      <>
                        <p className="flex justify-between gap-2">
                          <span className="text-mut">{tr('amount_usd')}</span>
                          <span>{fmtUSD(amt)}</span>
                        </p>
                        <p className="flex justify-between gap-2">
                          <span className="text-mut">{tr('crypto_fee')}</span>
                          <span>{fmtUSD(2)}</span>
                        </p>
                        <p className="flex justify-between gap-2 pt-1.5 border-t border-line font-extrabold text-gold">
                          <span>{tr('total_to_pay')}</span>
                          <span>{fmtUSD(totalUsdt)} USDT</span>
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="flex justify-between gap-2 pt-0.5">
                          <span className="text-mut">{tr('total_to_pay')}</span>
                          <span className="font-extrabold">{fmtDZD(totalDzd)}</span>
                        </p>
                        <p className="flex justify-between gap-2 font-extrabold text-gold pt-1.5 border-t border-line">
                          <span>{tr('usd_credited')}</span>
                          <span>{fmtUSD(creditBar)}</span>
                        </p>
                      </>
                    )}
                  </motion.div>
                )}

                <div className="mt-3 bg-soft rounded-2xl p-3 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-mut uppercase tracking-wide">
                      {method === 'usdt' ? tr('usdt_label') : tr('rip_label')}
                    </p>
                    <p className="font-mono text-[13px] font-bold break-all">
                      {method === 'usdt' ? t('usdt_trc20', 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE') : t('baridimob_rip', '00799999002478845197')}
                    </p>
                  </div>
                  <CopyChip text={method === 'usdt' ? t('usdt_trc20', 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE') : t('baridimob_rip', '00799999002478845197')} />
                </div>

                <label className="mt-3 flex items-center gap-3 border-2 border-dashed border-line rounded-2xl p-3.5 cursor-pointer hover:border-acc transition">
                  {preview ? (
                    <img src={preview} alt="proof" className="w-12 h-12 rounded-lg object-cover border border-line" />
                  ) : (
                    <span className="w-12 h-12 rounded-lg bg-soft flex items-center justify-center text-mut">
                      <UploadCloud size={20} />
                    </span>
                  )}
                  <span className="text-xs font-semibold text-mut leading-snug">{proof ? proof.name : tr('proof_upload')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0] || null;
                      setProof(f);
                      setPreview(f ? await fileToDataUrl(f) : '');
                    }}
                  />
                </label>

                {err && <p className="mt-2.5 text-xs font-semibold text-red-500">{err}</p>}

                {/* Fixed fee strip — always visible just above the confirm button (dynamic) */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-gold/40 bg-gold/10 px-3.5 py-2.5"
                >
                    <span className="text-[11.5px] font-extrabold text-gold leading-tight">
                      {method === 'usdt' ? tr('fee_line_crypto') : tr('fee_line_bm')}
                      <span className="block text-[9.5px] font-semibold text-mut">{tr('fee_note')}</span>
                    </span>
                    <span className="text-sm font-extrabold text-gold whitespace-nowrap">
                      {method === 'usdt' ? `${fmtUSD(2)} USD` : fmtDZD(liveFee)}
                    </span>
                </motion.div>

                {ready ? (
                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={submit}
                    disabled={busy}
                    className="mt-4 w-full py-3.5 rounded-2xl tg-btn font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
                  >
                    {busy && <Loader2 size={16} className="animate-spin" />}
                    {tr('confirm_deposit')}
                  </motion.button>
                ) : (
                  <p className="mt-4 text-center text-[11px] text-mut font-semibold">
                    {tr('amount_dzd')} / {tr('amount_usd')} + {tr('proof_upload')} → {tr('confirm_deposit')}
                  </p>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
