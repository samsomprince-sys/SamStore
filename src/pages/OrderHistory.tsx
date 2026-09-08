import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Download, Eye, Loader2, Lock, Package, ShieldCheck, X } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDZD, timeAgo } from '../lib/format';
import { hapticNotify } from '../lib/telegram';
import { beaconDispute } from '../lib/tgBeacon';
import { downloadImageFile } from '../lib/download';
import { useApp } from '../context/AppContext';
import { CustomerAuthForm } from '../components/CustomerAuth';

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-500/12 text-amber-500',
  reviewing: 'bg-blue-500/12 text-blue-500',
  delivered: 'bg-emerald-500/12 text-emerald-500',
  paid_wallet: 'bg-emerald-500/15 text-emerald-500',
  disputed: 'bg-orange-500/12 text-orange-500',
  cancelled: 'bg-red-500/12 text-red-500',
};

export default function OrderHistory() {
  const { customer, tgUser, merchant, tr, toast } = useApp();
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [viewOrder, setViewOrder] = useState<any | null>(null);   // green button → delivery image modal
  const [confirmOrder, setConfirmOrder] = useState<any | null>(null); // red button → dispute confirm

  // Fully automatic linkage: the panel is bound to the ACTIVE session — no manual search
  const identity = (customer?.username || tgUser?.username || '').replace(/^@+/, '');
  const hasIdentity = !!identity || !!merchant?.token;

  const load = useCallback(async () => {
    if (!hasIdentity) return;
    setBusy(true);
    setErr('');
    try {
      const out: any[] = [];
      if (identity) {
        const data = await api.get<any[]>(`/api/orders-public?tg=${encodeURIComponent(identity)}`);
        if (Array.isArray(data)) out.push(...data);
      }
      if (merchant?.token) {
        const data = await api.get<any[]>('/api/orders-public?tg=__merchant__', merchant.token);
        if (Array.isArray(data)) {
          const have = new Set(out.map((o) => o.id));
          out.push(...data.filter((o) => !have.has(o.id)));
        }
      }
      setRows(out.sort((a, b) => b.id - a.id));
    } catch (x: any) {
      setErr(x.message || 'Error');
    } finally {
      setBusy(false);
    }
  }, [identity, merchant, hasIdentity]);

  // realtime: refresh on mount + every 10s — admin status changes appear instantly
  useEffect(() => {
    load();
    const iv = window.setInterval(load, 10000);
    return () => window.clearInterval(iv);
  }, [load]);

  const dispute = async (o: any) => {
    setBusyId(o.id);
    setErr('');
    try {
      const r = await api.post<any>('/api/dispute', { order_id: o.id, telegram: identity || o.buyer_telegram || '' });
      if (!r?.alert_sent) beaconDispute(o);
      toast('success', tr('replacement_sent'));
      hapticNotify('success');
      setRows((rs) => (rs ? rs.map((x) => (x.id === o.id ? { ...x, status: 'disputed' } : x)) : rs));
    } catch (x: any) {
      setErr(x.message || 'Error');
      hapticNotify('error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-3 md:px-4 pt-5 md:pt-7">
      <div className="text-center mb-5">
        <span className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white items-center justify-center shadow-lg">
          <ShieldCheck size={22} />
        </span>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{tr('my_orders')}</h1>
        {hasIdentity && (
          <p className="mt-1.5 text-[11px] text-mut font-semibold flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulsedot" /> LIVE
          </p>
        )}
      </div>

      {/* no manual search: guests are simply invited to log in */}
      {!hasIdentity ? (
        <div className="bg-card border border-line rounded-3xl p-5 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-extrabold mb-3">
            <Lock size={15} className="text-acc" /> {tr('cust_login_title')}
          </p>
          <CustomerAuthForm />
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {err && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-red-500">
              <AlertTriangle size={13} /> {err}
            </p>
          )}
          {busy && rows === null ? (
            <div className="py-16 flex justify-center text-mut">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : rows && rows.length === 0 ? (
            <div className="bg-card border border-line rounded-2xl p-10 text-center text-sm text-mut font-medium">
              <Package size={26} className="mx-auto mb-2 opacity-40" />
              {tr('no_orders_found')}
            </div>
          ) : (
            (rows || []).map((o) => (
              <motion.div key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-line rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-sm">#{o.id}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-wide ${STATUS_STYLE[o.status] || 'bg-soft text-mut'}`}>
                    {o.status === 'paid_wallet' ? tr('os_paid_wallet') : o.status === 'disputed' ? tr('os_disputed') : o.status}
                  </span>
                  <span className="ms-auto text-[11px] text-mut font-semibold">{timeAgo(o.created_at)}</span>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <p className="font-bold text-[13.5px] leading-snug min-w-0">
                    {o.product_name} <span className="text-mut font-semibold">× {o.quantity}</span>
                  </p>
                  <p className="font-extrabold text-gold shrink-0">{fmtDZD(o.total_dzd)}</p>
                </div>

                {/* 100% Secure Replacement Guarantee (Buyer Protection) */}
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2">
                  <ShieldCheck size={14} className="text-gold shrink-0" />
                  <span className="text-[10.5px] font-extrabold text-gold flex-1">{tr('guarantee_badge')}</span>
                </div>

                {/* delivered actions: green view+download • red dispute (with confirm) */}
                {(o.status === 'delivered' || o.status === 'paid_wallet') && o.delivery_image && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setViewOrder(o);
                        hapticNotify('success');
                      }}
                      className="py-2.5 rounded-xl bg-emerald-500 text-white text-[11px] font-extrabold flex items-center justify-center gap-1.5 shadow-[0_0_16px_rgba(16,185,129,0.4)] active:scale-95 transition"
                    >
                      <Eye size={13} /> {tr('view_product_btn')}
                    </button>
                    <button
                      onClick={() => setConfirmOrder(o)}
                      disabled={busyId === o.id}
                      className="py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-white text-[11px] font-extrabold flex items-center justify-center gap-1.5 shadow-[0_0_16px_rgba(239,68,68,0.4)] disabled:opacity-50 active:scale-95 transition"
                    >
                      {busyId === o.id ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
                      {tr('dispute_btn')}
                    </button>
                  </div>
                )}
                {(o.status === 'delivered' || o.status === 'paid_wallet') && !o.delivery_image && (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => setConfirmOrder(o)}
                      disabled={busyId === o.id}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 text-white text-[10.5px] font-extrabold disabled:opacity-50 active:scale-95 transition"
                    >
                      {busyId === o.id ? <Loader2 size={11} className="animate-spin" /> : tr('dispute_btn')}
                    </button>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>
      )}
      {/* delivered product modal — green button target */}
      <AnimatePresence>
        {viewOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            onClick={() => setViewOrder(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.94 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              onClick={(e: any) => e.stopPropagation()}
              className="w-[min(94vw,460px)] bg-card border border-gold/50 rounded-3xl p-4 shadow-2xl"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                  <Eye size={17} />
                </span>
                <p className="flex-1 font-extrabold text-[13px] truncate">
                  {viewOrder.product_name} · #{viewOrder.id}
                </p>
                <button onClick={() => setViewOrder(null)} className="p-2 rounded-full bg-soft text-mut hover:text-ink transition shrink-0" aria-label="Close">
                  <X size={16} />
                </button>
              </div>
              <img src={viewOrder.delivery_image} alt="Delivered product" className="w-full max-h-[55dvh] object-contain rounded-2xl border border-line bg-black/30" />
              <button
                onClick={() => {
                  void downloadImageFile(viewOrder.delivery_image, `SamStore-Order-${viewOrder.id}.png`);
                  hapticNotify('success');
                }}
                className="mt-3 w-full py-3 rounded-xl tg-btn font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition"
              >
                <Download size={15} /> {tr('download_img')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* dispute confirmation popup — red button target */}
      <AnimatePresence>
        {confirmOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setConfirmOrder(null)}
          >
            <motion.div
              initial={{ y: 30, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 24, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              onClick={(e: any) => e.stopPropagation()}
              className="w-[min(92vw,380px)] bg-card border-2 border-red-500/40 rounded-3xl p-5 shadow-2xl text-center"
            >
              <span className="mx-auto w-12 h-12 rounded-2xl bg-red-500/15 text-red-500 flex items-center justify-center">
                <AlertTriangle size={22} />
              </span>
              <p className="mt-3 text-[13px] font-extrabold leading-snug">{tr('dispute_confirm_q')}</p>
              <p className="mt-1 text-[10.5px] text-mut font-semibold">
                {confirmOrder.product_name} · #{confirmOrder.id}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setConfirmOrder(null)}
                  className="py-2.5 rounded-xl bg-soft border border-line text-[12px] font-extrabold text-mut hover:text-ink transition"
                >
                  {tr('dispute_confirm_no')}
                </button>
                <button
                  onClick={() => {
                    const target = confirmOrder;
                    setConfirmOrder(null);
                    dispute(target);
                  }}
                  className="py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-white text-[12px] font-extrabold active:scale-95 transition"
                >
                  {tr('dispute_confirm_yes')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
