import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BadgeCheck,
  Check,
  Coins,
  Copy,
  Landmark,
  Loader2,
  Minus,
  Plus,
  Send,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react';
import { api, fileToBase64, fileToDataUrl } from '../lib/api';
import { copyText, fmtDZD } from '../lib/format';
import { hapticNotify, openTelegramLink } from '../lib/telegram';
import { beaconOrder } from '../lib/tgBeacon';
import { useApp } from '../context/AppContext';
import type { Order, Product } from '../lib/types';

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

export default function PurchaseModal({
  product,
  buyerType,
  onClose,
}: {
  product: Product | null;
  buyerType: 'retail' | 'wholesale';
  onClose: () => void;
}) {
  const { tgUser, t, toast, merchant, tr } = useApp();
  const [qty, setQty] = useState(1);
  const [name, setName] = useState('');
  const [tg, setTg] = useState('');
  const [method, setMethod] = useState<'baridimob' | 'usdt'>('baridimob');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [sentUsdt, setSentUsdt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [order, setOrder] = useState<Order | null>(null);

  const minQty = useMemo(
    () => (product ? (buyerType === 'wholesale' ? Math.max(1, product.min_qty || 1) : 1) : 1),
    [product, buyerType]
  );

  useEffect(() => {
    if (product) {
      setQty(buyerType === 'wholesale' ? Math.max(1, product.min_qty || 1) : 1);
      const prefName = tgUser
        ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ')
        : merchant
          ? `${merchant.first_name} ${merchant.last_name}`
          : '';
      setName(prefName);
      setTg(tgUser?.username ? `@${tgUser.username}` : '');
      setMethod('baridimob');
      setReceipt(null);
      setPreview('');
      setSentUsdt(false);
      setErr('');
      setOrder(null);
    }
  }, [product, tgUser, merchant, buyerType]);

  useEffect(() => {
    if (product) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [product]);

  const total = product ? product.price_dzd * qty : 0;

  const submit = async () => {
    if (!product) return;
    setErr('');
    if (name.trim().length < 2) return setErr(tr('v_name'));
    const cleanTg = tg.replace(/@/g, '').trim();
    if (cleanTg.length < 3) return setErr(tr('v_tg'));
    if (qty < minQty) return setErr(`${tr('v_min')} ${minQty}.`);
    if (method === 'baridimob' && !receipt) return setErr(tr('v_receipt'));
    if (method === 'usdt' && !sentUsdt) return setErr(tr('v_usdt'));

    setBusy(true);
    try {
      let receiptUrl: string | undefined;
      if (method === 'baridimob' && receipt) {
        const base64 = await fileToBase64(receipt);
        const up = await api.post<{ url: string }>('/api/upload', {
          bucket: 'receipts',
          fileName: receipt.name,
          fileBase64: base64,
          contentType: receipt.type,
        });
        receiptUrl = up.url;
      }
      const created = await api.post<Order>(
        '/api/orders',
        {
          product_id: product.id,
          quantity: qty,
          buyer_name: name.trim(),
          buyer_telegram: cleanTg,
          payment_method: method,
          receipt_url: receiptUrl,
          buyer_type: buyerType,
        },
        buyerType === 'wholesale' ? merchant?.token : undefined
      );
      setOrder(created);
      hapticNotify('success');
      toast('success', `${tr('order_received')} #${created.id}`);
      // Instant CORS-proof alert fallback if the server-side bot send did not confirm
      if (!(created as any)?.alert_sent) beaconOrder(created);
    } catch (e: any) {
      setErr(e.message || tr('v_order_fail'));
      hapticNotify('error');
    } finally {
      setBusy(false);
    }
  };

  const supportUser = t('support_telegram', 'SamStoreDZ').replace('@', '');

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-[min(94vw,460px)] max-h-[92dvh] overflow-y-auto no-scrollbar bg-card border border-line rounded-t-3xl sm:rounded-3xl shadow-2xl"
          >
            {order ? (
              <div className="p-7 flex flex-col items-center text-center gap-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 220, delay: 0.05 }}
                  className="w-16 h-16 rounded-full bg-acc/15 text-acc flex items-center justify-center"
                >
                  <BadgeCheck size={34} />
                </motion.div>
                <h3 className="text-lg font-extrabold">{tr('order_received')} #{order.id}</h3>
                <p className="text-sm text-mut leading-relaxed">{t('delivery_notice', 'All deliveries are 100% manual: after payment we contact you on Telegram and deliver your product as an image.')}</p>
                <div className="w-full bg-soft rounded-2xl p-3.5 text-sm flex items-center justify-between">
                  <span className="text-mut font-semibold">{tr('total')}</span>
                  <span className="font-extrabold text-gold">{fmtDZD(order.total_dzd)}</span>
                </div>
                <button
                  onClick={() => openTelegramLink(`https://t.me/${supportUser}`)}
                  className="w-full py-3 rounded-xl tg-btn font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition"
                >
                  <Send size={15} /> {tr('open_tg')}
                </button>
                <button onClick={onClose} className="text-sm font-semibold text-mut hover:text-ink transition">
                  {tr('back_to_store')}
                </button>
              </div>
            ) : (
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3 min-w-0">
                    <img src={product.image_url} alt={product.name} className="w-16 h-16 rounded-xl object-cover border border-line shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-bold text-[15px] leading-snug">{product.name}</h3>
                      <p className="text-xs text-mut mt-0.5">{buyerType === 'wholesale' ? tr('wholesale_order') : tr('retail_order')}</p>
                      <p className="text-sm font-extrabold text-gold mt-1">{fmtDZD(product.price_dzd)}</p>
                    </div>
                  </div>
                  <button onClick={onClose} className="p-2 rounded-full bg-soft text-mut hover:text-ink transition shrink-0" aria-label="Close">
                    <X size={16} />
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between bg-soft rounded-2xl p-3">
                    <span className="text-sm font-semibold text-mut">
                      {tr('quantity')}{buyerType === 'wholesale' ? ` (${tr('min_short')} ${minQty})` : ''}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setQty((q) => Math.max(minQty, q - 1))}
                        className="w-9 h-9 rounded-xl bg-card border border-line flex items-center justify-center active:scale-90 transition"
                        aria-label="Decrease"
                      >
                        <Minus size={15} />
                      </button>
                      <span className="w-8 text-center font-extrabold">{qty}</span>
                      <button
                        onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
                        className="w-9 h-9 rounded-xl bg-card border border-line flex items-center justify-center active:scale-90 transition"
                        aria-label="Increase"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>

                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={tr('name_ph')}
                    className="w-full bg-soft border border-line rounded-xl px-3.5 py-3 text-sm outline-none focus:border-acc transition placeholder:text-mut/70"
                  />
                  <div className="relative">
                    <Send size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-mut" />
                    <input
                      value={tg}
                      onChange={(e) => setTg(e.target.value)}
                      placeholder={tr('tg_ph')}
                      className="w-full bg-soft border border-line rounded-xl ps-10 pe-3.5 py-3 text-sm outline-none focus:border-acc transition placeholder:text-mut/70"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setMethod('baridimob')}
                      className={`p-3 rounded-2xl border text-start transition active:scale-[0.98] ${
                        method === 'baridimob' ? 'border-acc bg-acc/10' : 'border-line bg-soft'
                      }`}
                    >
                      <Landmark size={18} className={method === 'baridimob' ? 'text-acc' : 'text-mut'} />
                      <p className="mt-1.5 text-xs font-extrabold">Baridimob</p>
                      <p className="text-[10px] text-mut">{tr('baridimob_desc')}</p>
                    </button>
                    <button
                      onClick={() => setMethod('usdt')}
                      className={`p-3 rounded-2xl border text-start transition active:scale-[0.98] ${
                        method === 'usdt' ? 'border-acc bg-acc/10' : 'border-line bg-soft'
                      }`}
                    >
                      <Coins size={18} className={method === 'usdt' ? 'text-acc' : 'text-mut'} />
                      <p className="mt-1.5 text-xs font-extrabold">USDT</p>
                      <p className="text-[10px] text-mut">{tr('usdt_desc')}</p>
                    </button>
                  </div>

                  {method === 'baridimob' ? (
                    <div className="space-y-2.5">
                      <div className="bg-soft rounded-2xl p-3 flex items-center gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-mut uppercase tracking-wide">{tr('rip_label')}</p>
                          <p className="font-mono text-sm font-bold tracking-wide break-all">{t('baridimob_rip', '00799999002478845197')}</p>
                        </div>
                        <CopyChip text={t('baridimob_rip', '00799999002478845197')} />
                      </div>
                      <label className="flex items-center gap-3 border-2 border-dashed border-line rounded-2xl p-3.5 cursor-pointer hover:border-acc transition">
                        {preview ? (
                          <img src={preview} alt="receipt" className="w-12 h-12 rounded-lg object-cover border border-line" />
                        ) : (
                          <span className="w-12 h-12 rounded-lg bg-soft flex items-center justify-center text-mut">
                            <UploadCloud size={20} />
                          </span>
                        )}
                        <span className="text-xs font-semibold text-mut leading-snug">
                          {receipt ? receipt.name : tr('upload_receipt')}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0] || null;
                            setReceipt(f);
                            setPreview(f ? await fileToDataUrl(f) : '');
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="bg-soft rounded-2xl p-3 flex items-center gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-mut uppercase tracking-wide">{tr('usdt_label')}</p>
                          <p className="font-mono text-[13px] font-bold break-all">{t('usdt_trc20', 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE')}</p>
                        </div>
                        <CopyChip text={t('usdt_trc20', 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE')} />
                      </div>
                      <button
                        onClick={() => setSentUsdt((s) => !s)}
                        className={`w-full flex items-center gap-2.5 p-3.5 rounded-2xl border text-start transition active:scale-[0.99] ${
                          sentUsdt ? 'border-acc bg-acc/10' : 'border-line bg-soft'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            sentUsdt ? 'bg-acc border-acc text-white' : 'border-line'
                          }`}
                        >
                          {sentUsdt && <Check size={13} />}
                        </span>
                        <span className="text-xs font-semibold">{tr('usdt_confirm')}</span>
                      </button>
                    </div>
                  )}

                  {err && <p className="text-xs font-semibold text-red-500">{err}</p>}

                  <button
                    onClick={submit}
                    disabled={busy || product.stock <= 0}
                    className="w-full py-3.5 rounded-2xl tg-btn font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                    {tr('confirm_order')} — {fmtDZD(total)}
                  </button>
                  <p className="text-center text-[10px] text-mut leading-relaxed px-2">
                    {tr('manual_note')}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
