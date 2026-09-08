import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ShieldAlert,
  BadgeCheck,
  Banknote,
  BellRing,
  Boxes,
  Check,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Gift,
  ImageIcon,
  Landmark,
  Link2,
  Coins,
  Loader2,
  Lock,
  LogOut,
  Package,
  Phone,
  MapPin,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingBag,
  Timer,
  Trash2,
  Trophy,
  UploadCloud,
  UserRound,
  Users,
  Wallet,
  Wand2,
  X,
} from 'lucide-react';
import { api, fileToBase64, fileToDataUrl } from '../lib/api';
import { fmtDZD, fmtUSD, timeAgo } from '../lib/format';
import { hapticNotify, openTelegramLink, tgPopup } from '../lib/telegram';
import { tgBeacon, beaconProductDeleted, beaconProductNew, beaconProductUpdated, beaconStatusChange } from '../lib/tgBeacon';
import { useApp } from '../context/AppContext';
import type { Merchant, Order, Product } from '../lib/types';

const inputCls =
  'w-full bg-soft border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-acc transition placeholder:text-mut/70';

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-500/12 text-amber-500',
  reviewing: 'bg-blue-500/12 text-blue-500',
  delivered: 'bg-emerald-500/12 text-emerald-500',
  cancelled: 'bg-red-500/12 text-red-500',
  paid_wallet: 'bg-emerald-500 text-white',
  disputed: 'bg-orange-500/12 text-orange-500',
};

const CONTENT_CONFIG: Array<{ key: string; label: string; textarea?: boolean }> = [
  { key: 'store_name', label: 'Store name' },
  { key: 'announcement', label: 'Announcement bar' },
  { key: 'hero_badge', label: 'Hero badge' },
  { key: 'hero_title', label: 'Hero title', textarea: true },
  { key: 'hero_subtitle', label: 'Hero subtitle', textarea: true },
  { key: 'hero_cta', label: 'Hero button text' },
  { key: 'stat_1_value', label: 'Stat 1 value' },
  { key: 'stat_1_label', label: 'Stat 1 label' },
  { key: 'stat_2_value', label: 'Stat 2 value' },
  { key: 'stat_2_label', label: 'Stat 2 label' },
  { key: 'stat_3_value', label: 'Stat 3 value' },
  { key: 'stat_3_label', label: 'Stat 3 label' },
  { key: 'shop_title', label: 'Shop section title' },
  { key: 'shop_subtitle', label: 'Shop section subtitle' },
  { key: 'feature_1_title', label: 'Feature 1 title' },
  { key: 'feature_1_text', label: 'Feature 1 text', textarea: true },
  { key: 'feature_2_title', label: 'Feature 2 title' },
  { key: 'feature_2_text', label: 'Feature 2 text', textarea: true },
  { key: 'feature_3_title', label: 'Feature 3 title' },
  { key: 'feature_3_text', label: 'Feature 3 text', textarea: true },
  { key: 'payments_title', label: 'Payments section title' },
  { key: 'baridimob_rip', label: 'Baridimob RIP' },
  { key: 'usdt_trc20', label: 'USDT TRC20 wallet' },
  { key: 'delivery_notice', label: 'Delivery notice', textarea: true },
  { key: 'about_title', label: 'About title' },
  { key: 'about_text', label: 'About text', textarea: true },
  { key: 'support_telegram', label: 'Telegram support username' },
  { key: 'b2b_title', label: 'B2B page title' },
  { key: 'b2b_subtitle', label: 'B2B page subtitle', textarea: true },
  { key: 'footer_text', label: 'Footer text', textarea: true },
];

/* ------------------------------------------------ orders */

function OrderCard({ o, token, onChanged }: { o: Order; token: string; onChanged: (o: Order) => void }) {
  const [notes, setNotes] = useState(o.notes || '');
  const [busy, setBusy] = useState(false);
  const [delivBusy, setDelivBusy] = useState(false);
  const [delivPrev, setDelivPrev] = useState('');
  const [delivFile, setDelivFile] = useState<File | null>(null);
  const [delivDone, setDelivDone] = useState<string | null>(null);
  const { toast, tr } = useApp();

  const setStatus = async (status: string) => {
    setBusy(true);
    try {
      const upd = await api.put<Order>('/api/orders', { id: o.id, status }, token);
      onChanged(upd);
      // Instant CORS-proof Telegram confirmation of every status change
      beaconStatusChange(o.id, status);
      toast('success', `Order #${o.id} → ${status}`);
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = async () => {
    setBusy(true);
    try {
      const upd = await api.put<Order>('/api/orders', { id: o.id, notes }, token);
      onChanged(upd);
      toast('success', 'Notes saved');
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  // LIVRAISON DES PRODUITS: upload the digital product screenshot → order becomes Delivered
  const deliver = async () => {
    if (!delivFile) return;
    setDelivBusy(true);
    try {
      const b64 = await fileToBase64(delivFile);
      const up = await api.post<{ url: string }>(
        '/api/upload',
        { bucket: 'deliveries', fileName: delivFile.name, fileBase64: b64, contentType: delivFile.type },
        token
      );
      const upd = await api.put<Order>('/api/orders', { id: o.id, delivery_image_url: up.url }, token);
      setDelivDone(up.url);
      onChanged(upd);
      toast('success', `Order #${o.id} delivered ✓ — buyer notified in-app`);
      hapticNotify('success');
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setDelivBusy(false);
    }
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-line rounded-xl p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-extrabold text-[13px]">#{o.id}</span>
        <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-wide ${STATUS_STYLE[o.status] || 'bg-soft text-mut'}`}>
          {o.status}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-wide flex items-center gap-1 ${
            o.payment_method === 'usdt' ? 'bg-teal-500/12 text-teal-500' : 'bg-emerald-600/12 text-emerald-600'
          }`}
        >
          {o.payment_method === 'wallet' ? (
            <Wallet size={11} />
          ) : o.payment_method === 'usdt' ? (
            <Coins size={11} />
          ) : (
            <Landmark size={11} />
          )}
          {o.payment_method === 'wallet' ? 'Wallet ✓' : o.payment_method === 'usdt' ? 'USDT' : 'Baridimob'}
        </span>
        {o.buyer_type === 'wholesale' && (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-wide bg-violet-500/12 text-violet-500 flex items-center gap-1">
            <Boxes size={11} /> B2B
          </span>
        )}
        {(o as any).referral && (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-extrabold tracking-wide bg-amber-500/12 text-amber-500" title={(o as any).referral.merchant || ''}>
            🤝 +${Number((o as any).referral.commission_usd).toFixed(2)} {(o as any).referral.status}
          </span>
        )}
        <span className="ms-auto text-[11px] text-mut font-semibold flex items-center gap-1">
          <Clock size={11} /> {timeAgo(o.created_at)}
        </span>
      </div>

      {/* compact one-line product + buyer summary (high density) */}
      <div className="mt-2 bg-soft rounded-lg px-2.5 py-2 text-[11.5px] flex items-center gap-2 min-w-0">
        <p className="font-bold truncate flex-1 min-w-0">
          {o.product_name} <span className="text-mut font-semibold">× {o.quantity}</span>
        </p>
        <p className="font-extrabold text-gold shrink-0 text-[12.5px]">{fmtDZD(o.total_dzd)}</p>
      </div>
      <div className="mt-1.5 flex items-center gap-2 min-w-0">
        <p className="font-bold text-[11.5px] truncate flex-1 min-w-0">{o.buyer_name}</p>
        {!o.buyer_telegram && <span className="text-[9.5px] font-bold text-mut shrink-0">☎ phone account</span>}
        {!!o.buyer_telegram && (
        <button
          onClick={() => openTelegramLink(`https://t.me/${o.buyer_telegram}`)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#229ED9]/15 text-[#229ED9] text-[10.5px] font-extrabold active:scale-95 transition shrink-0"
        >
          <Send size={10} /> @{o.buyer_telegram}
        </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {o.receipt_url ? (
          <a href={o.receipt_url} target="_blank" rel="noreferrer" className="shrink-0">
            <img src={o.receipt_url} alt="receipt" className="w-10 h-10 rounded-lg object-cover border border-line hover:opacity-80 transition" />
          </a>
        ) : (
          <span className="w-10 h-10 rounded-lg bg-soft flex items-center justify-center text-mut shrink-0" title="No receipt (USDT notify flow)">
            <FileText size={15} />
          </span>
        )}
        <select
          value={o.status}
          disabled={busy}
          onChange={(e) => setStatus(e.target.value)}
          className="flex-1 bg-soft border border-line rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold outline-none focus:border-acc transition"
        >
          <option value="pending">{tr('os_pending')}</option>
          <option value="reviewing">{tr('os_reviewing')}</option>
          <option value="delivered">{tr('os_delivered')}</option>
          <option value="paid_wallet">{tr('os_paid_wallet')}</option>
          <option value="disputed">{tr('os_disputed')}</option>
          <option value="cancelled">{tr('os_cancelled')}</option>
        </select>
      </div>

      <div className="mt-2 flex gap-1.5 items-center">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={tr('notes_ph')}
          className={`${inputCls} flex-1 !py-2 text-xs`}
        />
        <button
          onClick={saveNotes}
          disabled={busy}
          className="px-3 py-2 rounded-lg tg-btn text-[10.5px] font-extrabold disabled:opacity-50 active:scale-95 transition shrink-0"
        >
          {tr('save')}
        </button>
      </div>

      {/* LIVRAISON DES PRODUITS — admin delivery upload column */}
      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-line p-2">
        {delivPrev || delivDone ? (
          <img src={delivPrev || (delivDone as string)} alt="delivery" className="w-9 h-9 rounded-lg object-cover border border-line shrink-0" />
        ) : (
          <span className="w-9 h-9 rounded-lg bg-soft flex items-center justify-center text-mut shrink-0">
            <UploadCloud size={15} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[9.5px] font-extrabold uppercase tracking-widest text-acc leading-none">{tr('delivery_lbl')}</p>
          <p className="text-[9.5px] text-mut font-semibold truncate mt-0.5">
            {delivDone ? '✓ Saved — Delivered' : delivFile ? delivFile.name : 'Screenshot → auto Delivered'}
          </p>
        </div>
        {!delivDone && (
          <label className="px-2.5 py-1.5 rounded-lg bg-soft border border-line text-[10px] font-extrabold cursor-pointer hover:border-acc hover:text-acc transition shrink-0">
            {delivFile ? '✓' : '…'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0] || null;
                setDelivFile(f);
                setDelivPrev(f ? await fileToDataUrl(f) : '');
              }}
            />
          </label>
        )}
        {delivFile && !delivDone && (
          <button
            onClick={deliver}
            disabled={delivBusy}
            className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[10px] font-extrabold flex items-center gap-1 disabled:opacity-50 active:scale-95 transition shrink-0"
          >
            {delivBusy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Deliver ✓
          </button>
        )}
      </div>
    </motion.div>
  );
}

function OrdersTab({ token }: { token: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const lastSeen = useRef<number | null>(null);
  const { toast, tr } = useApp();

  const load = useCallback(
    async (silent = false) => {
      try {
        const data = await api.get<Order[]>('/api/orders', token);
        const arr = Array.isArray(data) ? data : [];
        const maxId = arr[0]?.id ?? 0;
        if (lastSeen.current === null) {
          lastSeen.current = maxId;
        } else if (maxId > lastSeen.current) {
          const fresh = arr.filter((o) => o.id > lastSeen.current!);
          lastSeen.current = maxId;
          const f = fresh[0];
          hapticNotify('success');
          tgPopup('New order received', `${fresh.length} new order(s) — ${f.buyer_name} • ${f.product_name} • ${fmtDZD(f.total_dzd)}`);
          toast('info', `New order #${f.id} from ${f.buyer_name}`);
        }
        setOrders(arr);
        setError('');
      } catch (e: any) {
        if (!silent) setError(e.message || 'Failed to load orders');
      } finally {
        setLoading(false);
      }
    },
    [token, toast]
  );

  useEffect(() => {
    load();
    const iv = window.setInterval(() => load(true), 7000);
    return () => window.clearInterval(iv);
  }, [load]);

  const shown = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  if (loading)
    return (
      <div className="py-16 flex justify-center text-mut">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  if (error)
    return (
      <div className="bg-card border border-line rounded-2xl p-8 text-center">
        <p className="text-sm font-semibold text-red-500">{error}</p>
        <button onClick={() => { setLoading(true); load(); }} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl tg-btn text-sm font-bold">
          <RefreshCw size={15} /> {tr('retry')}
        </button>
      </div>
    );

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-3">
        {['all', 'pending', 'reviewing', 'delivered', 'paid_wallet', 'disputed', 'cancelled'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`shrink-0 px-3.5 py-2 rounded-full text-[11px] font-extrabold border transition capitalize ${
              filter === s ? 'bg-acc text-white border-transparent' : 'bg-card border-line text-mut'
            }`}
          >
            {s === 'all' ? tr('filter_all') : tr(`os_${s}`)} {`(${s === 'all' ? orders.length : orders.filter((o) => o.status === s).length})`}
          </button>
        ))}
        <button onClick={() => load()} className="shrink-0 ms-auto p-2 rounded-full bg-card border border-line text-mut hover:text-ink transition" title="Refresh">
          <RefreshCw size={14} />
        </button>
        <SectionReset token={token} section="orders" title={tr('rs_orders_t')} onDone={load} />
      </div>
      {shown.length === 0 ? (
        <div className="bg-card border border-line rounded-2xl p-10 text-center text-sm text-mut font-medium">
          <ShoppingBag size={26} className="mx-auto mb-2 opacity-40" />
          {tr('orders_empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((o) => (
            <OrderCard key={o.id} o={o} token={token} onChanged={(upd) => setOrders((prev) => prev.map((x) => (x.id === upd.id ? upd : x)))} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------ merchants */

function MerchantsTab({ token }: { token: string }) {
  const [rows, setRows] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const { toast, tr } = useApp();

  const load = useCallback(async () => {
    try {
      const data = await api.get<Merchant[]>('/api/merchants', token);
      setRows(Array.isArray(data) ? data : []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load merchants');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: number, status: string) => {
    setBusyId(id);
    try {
      await api.put('/api/merchants', { id, status }, token);
      toast('success', status === 'approved' ? 'Merchant approved — they can now order at wholesale prices' : `Merchant ${status}`);
      await load();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading)
    return (
      <div className="py-16 flex justify-center text-mut">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  if (error)
    return (
      <div className="bg-card border border-line rounded-2xl p-8 text-center">
        <p className="text-sm font-semibold text-red-500">{error}</p>
        <button onClick={() => { setLoading(true); load(); }} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl tg-btn text-sm font-bold">
          <RefreshCw size={15} /> {tr('retry')}
        </button>
      </div>
    );

  const sorted = [...rows].sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0));

  return (
    <div>
      <div className="flex justify-end mb-3">
        <SectionReset token={token} section="merchants" title={tr('rs_merchants_t')} onDone={load} />
      </div>
      <div className="space-y-3">
      {sorted.length === 0 && (
        <div className="bg-card border border-line rounded-2xl p-10 text-center text-sm text-mut font-medium">
          <Users size={26} className="mx-auto mb-2 opacity-40" />
          {tr('merchants_empty')}
        </div>
      )}
      {sorted.map((m) => (
        <motion.div key={m.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-line rounded-2xl p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="w-11 h-11 rounded-xl bg-acc/10 text-acc flex items-center justify-center font-extrabold text-sm">
              {m.first_name[0]}
              {m.last_name[0]}
            </span>
            <div className="min-w-0">
              <p className="font-extrabold text-sm">
                {m.first_name} {m.last_name}
              </p>
              <p className="text-[11px] text-mut">{timeAgo(m.created_at)}</p>
            </div>
            <span
              className={`ms-auto px-2.5 py-1 rounded-full text-[10.5px] font-extrabold uppercase tracking-wide ${
                m.status === 'approved' ? 'bg-emerald-500/12 text-emerald-500' : m.status === 'rejected' ? 'bg-red-500/12 text-red-500' : 'bg-amber-500/12 text-amber-500'
              }`}
            >
              {m.status}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-3">
            {m.cni_url ? (
              <a href={m.cni_url} target="_blank" rel="noreferrer" className="shrink-0 group relative">
                <img src={m.cni_url} alt="CNI" className="w-20 h-14 rounded-lg object-cover border border-line" />
                <span className="absolute inset-0 rounded-lg bg-black/45 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-[10px] font-bold">
                  {tr('view_cni')}
                </span>
              </a>
            ) : (
              <span className="w-20 h-14 rounded-lg bg-soft flex items-center justify-center text-mut shrink-0">
                <ImageIcon size={18} />
              </span>
            )}
            <div className="flex-1 flex flex-wrap gap-2 justify-end">
              {m.status !== 'approved' && (
                <button
                  onClick={() => setStatus(m.id, 'approved')}
                  disabled={busyId === m.id}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition"
                >
                  {busyId === m.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {tr('approve')}
                </button>
              )}
              {m.status !== 'rejected' && (
                <button
                  onClick={() => setStatus(m.id, 'rejected')}
                  disabled={busyId === m.id}
                  className="px-4 py-2.5 rounded-xl bg-red-500/90 text-white text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition"
                >
                  <X size={13} /> {tr('reject')}
                </button>
              )}
              {m.status !== 'pending' && (
                <button
                  onClick={() => setStatus(m.id, 'pending')}
                  disabled={busyId === m.id}
                  className="px-4 py-2.5 rounded-xl bg-soft text-mut text-xs font-extrabold active:scale-95 transition"
                >
                  {tr('set_pending')}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------ الإحالات والمكافآت (referral control center) */

function ReferralsTab({ token }: { token: string }) {
  const { toast, tr, saveContent } = useApp();
  const [data, setData] = useState<any>({ referrers: [], claims: [], cfg: { smallNeed: 5, grandNeed: 300, smallAmount: '500', grandAmount: '10000' } });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editVal, setEditVal] = useState('');
  const [cfgDraft, setCfgDraft] = useState({ cash_small_need: '5', cash_small_amount: '500', cash_grand_need: '300', cash_grand_amount: '10000' });
  const [savingKey, setSavingKey] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api.get<any>('/api/challenge?mode=admin', token);
      setData(d);
      if (d.cfg)
        setCfgDraft({
          cash_small_need: String(d.cfg.smallNeed),
          cash_small_amount: d.cfg.smallAmount,
          cash_grand_need: String(d.cfg.grandNeed),
          cash_grand_amount: d.cfg.grandAmount,
        });
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const iv = window.setInterval(load, 12000);
    return () => window.clearInterval(iv);
  }, [load]);

  const saveCfg = async (key: string, val: string) => {
    if (!val.trim()) return;
    setSavingKey(key);
    try {
      await saveContent(key, val.trim());
      toast('success', 'Saved ✔');
      await load();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setSavingKey('');
    }
  };

  const act = async (body: any, id: string) => {
    setBusyId(id);
    try {
      await api.post('/api/challenge', body, token);
      toast('success', '✔');
      await load();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const cfg = data.cfg || { smallNeed: 5, grandNeed: 300, smallAmount: '500', grandAmount: '10000' };
  const pendingClaims = (data.claims || []).filter((c: any) => c.status === 'pending');
  const paidClaims = (data.claims || []).filter((c: any) => c.status === 'paid');

  const cfgRow = (key: string, label: string, mono = false) => (
    <div className="flex items-center justify-between gap-3 bg-soft rounded-xl px-3 py-2.5" key={key}>
      <p className="text-[11px] font-extrabold flex-1 min-w-0">{label}</p>
      <div className="flex gap-1.5 shrink-0">
        <input
          value={cfgDraft[key as keyof typeof cfgDraft]}
          onChange={(e) => setCfgDraft({ ...cfgDraft, [key]: e.target.value })}
          className={`w-24 bg-card border border-line rounded-xl px-2.5 py-2 text-[12px] outline-none focus:border-acc transition ${mono ? 'font-mono font-bold' : 'font-bold'}`}
        />
        <button
          onClick={() => saveCfg(key, cfgDraft[key as keyof typeof cfgDraft])}
          disabled={savingKey === key}
          className="px-3 py-2 rounded-xl tg-btn text-[10.5px] font-extrabold disabled:opacity-50 active:scale-95 transition"
        >
          {savingKey === key ? <Loader2 size={11} className="animate-spin" /> : tr('modify_value')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* A. LIVE MILESTONE CONFIGURATOR */}
      <div className="bg-card border border-line rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-9 h-9 rounded-xl bg-violet-500/15 text-violet-500 flex items-center justify-center shrink-0">
            <Gift size={16} />
          </span>
          <p className="flex-1 font-extrabold text-sm">{tr('rf_config_t')}</p>
          <span className="px-2.5 py-1 rounded-full bg-violet-500/12 text-violet-500 text-[10px] font-extrabold uppercase tracking-wide animate-pulsedot">LIVE</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {cfgRow('cash_small_need', tr('rf_need_small'), true)}
          {cfgRow('cash_small_amount', tr('rf_amt_small'))}
          {cfgRow('cash_grand_need', tr('rf_need_grand'), true)}
          {cfgRow('cash_grand_amount', tr('rf_amt_grand'))}
        </div>
      </div>

      {/* C. PENDING CASH CLAIMS QUEUE */}
      <div className="bg-card border border-amber-500/30 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
            <Banknote size={16} />
          </span>
          <p className="flex-1 font-extrabold text-sm">{tr('rf_claims_t')}</p>
          <span className="px-2.5 py-1 rounded-full bg-amber-500/12 text-amber-500 text-[10.5px] font-extrabold shrink-0">{pendingClaims.length}</span>
        </div>
        {pendingClaims.length === 0 && paidClaims.length === 0 ? (
          <p className="text-[11px] text-mut font-semibold text-center py-4">{tr('rf_claims_empty')}</p>
        ) : (
          <div className="space-y-2">
            {[...pendingClaims, ...paidClaims.slice(0, 5)].map((c: any) => (
              <div key={c.id} className="flex items-center gap-2.5 bg-soft rounded-xl px-3 py-2.5">
                <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-extrabold uppercase tracking-wide shrink-0 ${c.milestone === 'grand' ? 'bg-fuchsia-500/15 text-fuchsia-400' : 'bg-amber-500/15 text-amber-500'}`}>
                  {c.milestone === 'grand' ? '🏆' : '💵'} {c.amount_dzd} دج
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-bold truncate">{c.inviter_name}</p>
                  <p className="text-[9.5px] text-mut font-semibold">{timeAgo(c.created_at)}</p>
                </div>
                {c.status === 'pending' ? (
                  <button
                    onClick={() => act({ action: 'admin_pay_claim', id: c.id }, `pay-${c.id}`)}
                    disabled={busyId === `pay-${c.id}`}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[10px] font-extrabold flex items-center gap-1 disabled:opacity-50 active:scale-95 transition shrink-0"
                  >
                    {busyId === `pay-${c.id}` ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    {tr('rf_pay')}
                  </button>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 text-[9.5px] font-extrabold shrink-0">{tr('rf_paid')}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* B. ACTIVE REFERRERS DATABASE TABLE */}
      <div className="bg-card border border-line rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-9 h-9 rounded-xl bg-blue-500/12 text-blue-500 flex items-center justify-center shrink-0">
            <Link2 size={16} />
          </span>
          <p className="flex-1 font-extrabold text-sm">{tr('rf_table_t')}</p>
          <span className="px-2.5 py-1 rounded-full bg-blue-500/12 text-blue-500 text-[10.5px] font-extrabold shrink-0">{(data.referrers || []).length}</span>
        </div>

        {loading ? (
          <div className="py-10 flex justify-center text-mut">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (data.referrers || []).length === 0 ? (
          <p className="text-[11px] text-mut font-semibold text-center py-4">{tr('rf_empty')}</p>
        ) : (
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[1.4fr_.8fr_.8fr_.8fr_auto] gap-2 px-2.5 text-[9px] font-extrabold uppercase tracking-widest text-mut">
              <span>{tr('rf_col_name')}</span>
              <span>{cfg.smallNeed} ✦</span>
              <span>{cfg.grandNeed} 👑</span>
              <span>{tr('rf_col_total')}</span>
              <span />
            </div>
            {data.referrers.map((r: any) => {
              const key = `${r.inviter_type}:${r.inviter_id}`;
              const editing = editTarget && editTarget.inviter_id === r.inviter_id && editTarget.inviter_type === r.inviter_type;
              return (
                <div key={key} className="bg-soft rounded-xl p-2.5">
                  <div className="sm:grid sm:grid-cols-[1.4fr_.8fr_.8fr_.8fr_auto] sm:gap-2 sm:items-center">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide shrink-0 ${r.inviter_type === 'merchant' ? 'bg-violet-500/12 text-violet-500' : 'bg-blue-500/12 text-blue-500'}`}>
                        {r.inviter_type === 'merchant' ? tr('role_merchant') : tr('role_customer')}
                      </span>
                      <p className="text-[11.5px] font-bold truncate">{r.name}</p>
                    </div>
                    <p className="text-[11.5px] font-extrabold mt-1.5 sm:mt-0">
                      <span className={r.credited >= cfg.smallNeed ? 'text-amber-500' : 'text-ink'}>{r.credited}</span>
                      <span className="text-mut">/{cfg.smallNeed}</span>
                    </p>
                    <p className="text-[11.5px] font-extrabold">
                      <span className={r.credited >= cfg.grandNeed ? 'text-fuchsia-400' : 'text-ink'}>{r.credited}</span>
                      <span className="text-mut">/{cfg.grandNeed}</span>
                    </p>
                    <p className="text-[11px] font-bold text-mut">{r.total}</p>
                    <div className="flex gap-1.5 mt-1.5 sm:mt-0 justify-end">
                      <button
                        onClick={() => {
                          setEditTarget(r);
                          setEditVal(String(r.credited));
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-card border border-line text-[10px] font-extrabold hover:border-acc hover:text-acc transition active:scale-95"
                      >
                        ✏️ {tr('rf_edit_count')}
                      </button>
                      <button
                        onClick={() => act({ action: 'admin_reset_count', inviter_type: r.inviter_type, inviter_id: r.inviter_id }, `zero-${key}`)}
                        disabled={busyId === `zero-${key}`}
                        className="px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/30 text-[10px] font-extrabold disabled:opacity-50 active:scale-95 transition flex items-center gap-1"
                      >
                        {busyId === `zero-${key}` ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                        {tr('rf_reset')}
                      </button>
                    </div>
                  </div>
                  {editing && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={editVal}
                        inputMode="numeric"
                        onChange={(e) => setEditVal(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-24 bg-card border border-line rounded-lg px-2.5 py-1.5 text-[12px] font-mono font-bold text-center outline-none focus:border-acc transition"
                      />
                      <button
                        onClick={() => {
                          act({ action: 'admin_set_count', inviter_type: r.inviter_type, inviter_id: r.inviter_id, count: editVal }, `set-${key}`);
                          setEditTarget(null);
                        }}
                        disabled={busyId === `set-${key}`}
                        className="px-3 py-1.5 rounded-lg tg-btn text-[10px] font-extrabold disabled:opacity-50 active:scale-95 transition"
                      >
                        {busyId === `set-${key}` ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} ✔
                      </button>
                      <button onClick={() => setEditTarget(null)} className="px-2.5 py-1.5 rounded-lg bg-card border border-line text-[10px] font-extrabold text-mut transition active:scale-95">
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------ gift products pool (challenge rewards) */

function GiftPoolCard({ token }: { token: string }) {
  const { toast, tr } = useApp();
  const [pool, setPool] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<any>('/api/challenge?mode=admin', token);
      setPool(Array.isArray(d.pool) ? d.pool : []);
    } catch {
      /* silent */
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (f: File) => {
    setBusy(true);
    try {
      const b64 = await fileToBase64(f);
      const up = await api.post<{ url: string }>('/api/upload', { bucket: 'products', fileName: f.name, fileBase64: b64, contentType: f.type }, token);
      await api.post('/api/challenge', { action: 'add', image_url: up.url }, token);
      toast('success', `${tr('add_gift')} ✔`);
      await load();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusyId(id);
    try {
      await api.post('/api/challenge', { action: 'remove', id }, token);
      await load();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const left = pool.filter((g) => !g.used).length;

  return (
    <div className="mt-3 bg-violet-500/5 border-2 border-violet-500/25 rounded-2xl p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-9 h-9 rounded-xl bg-violet-500/15 text-violet-500 flex items-center justify-center shrink-0">
          <Gift size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-[13px]">{tr('gift_pool_title')}</p>
          <p className="text-[10px] text-mut font-semibold leading-snug">{tr('gift_pool_sub')}</p>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-violet-500/12 text-violet-500 text-[10.5px] font-extrabold shrink-0">
          {left} {tr('gifts_left')}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {pool.map((g) => (
          <div key={g.id} className="relative rounded-xl overflow-hidden border border-line group">
            <img src={g.image_url} alt="gift" className="w-full aspect-[3/2] object-cover" />
            {g.used ? (
              <span className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] font-extrabold text-white uppercase tracking-wide">
                {tr('gift_used')}
              </span>
            ) : (
              <button
                onClick={() => remove(g.id)}
                disabled={busyId === g.id}
                className="absolute top-1.5 end-1.5 w-6 h-6 rounded-md bg-black/60 text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition disabled:opacity-50"
                title="Remove"
              >
                {busyId === g.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              </button>
            )}
          </div>
        ))}
        <label className="aspect-[3/2] rounded-xl border-2 border-dashed border-line flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-violet-400 hover:text-violet-400 transition text-mut">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          <span className="text-[9.5px] font-extrabold">{tr('add_gift')}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) add(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}

/* ------------------------------------------------ products */

function ProductRow({ p, token, onReload }: { p: Product; token: string; onReload: () => void }) {
  const { toast, bumpProducts, tr, content, saveContent } = useApp();
  const [d, setD] = useState({ name: p.name, price: String(p.price_dzd), stock: String(p.stock), min_qty: String(p.min_qty), category: p.category, panel: p.panel, description: p.description, active: p.active });
  const supKey = `supplier_url_${p.id}`;
  const [sup, setSup] = useState(content[supKey] || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put<any>(
        '/api/products',
        {
          id: p.id,
          name: d.name,
          description: d.description,
          category: d.category,
          price_dzd: Number(d.price),
          stock: Number(d.stock),
          min_qty: Number(d.min_qty),
          panel: d.panel,
          active: d.active,
        },
        token
      );
      if (!r?.alert_sent) beaconProductUpdated(d.name, ['price_dzd', 'stock', 'details']);
      if (sup.trim() !== (content[supKey] || '')) {
        try {
          await saveContent(supKey, sup.trim());
        } catch (e: any) {
          toast('error', e.message);
        }
      }
      toast('success', `"${d.name}" saved`);
      bumpProducts();
      onReload();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`${tr('del_confirm')} — ${p.name}`)) return;
    setBusy(true);
    try {
      const r = await api.del<any>('/api/products', { id: p.id }, token);
      if (!r?.alert_sent) beaconProductDeleted(p.id);
      toast('success', 'Product deleted');
      bumpProducts();
      onReload();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-line rounded-2xl p-3.5 shadow-sm">
      <div className="flex gap-3">
        <img src={p.image_url} alt={p.name} className="w-16 h-16 rounded-xl object-cover border border-line shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={inputCls} placeholder={tr('ph_product_name')} />
          <div className="grid grid-cols-3 gap-2">
            <div className="relative">
              <input value={d.price} onChange={(e) => setD({ ...d, price: e.target.value.replace(/[^0-9]/g, '') })} className={`${inputCls} pe-11`} placeholder={tr('ph_price')} />
              <span className="absolute end-2.5 top-1/2 -translate-y-1/2 text-[10px] font-extrabold text-gold">DZD</span>
            </div>
            <input value={d.stock} onChange={(e) => setD({ ...d, stock: e.target.value.replace(/[^0-9]/g, '') })} className={inputCls} placeholder={tr('ph_stock')} />
            <input value={d.min_qty} onChange={(e) => setD({ ...d, min_qty: e.target.value.replace(/[^0-9]/g, '') })} className={inputCls} placeholder={tr('ph_min_qty')} />
          </div>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <input value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} className={inputCls} placeholder={tr('ph_category')} />
        <select value={d.panel} onChange={(e) => setD({ ...d, panel: e.target.value })} className={`${inputCls} font-semibold`}>
          <option value="retail">{tr('panel_retail')}</option>
          <option value="wholesale">{tr('panel_wholesale')}</option>
          <option value="both">{tr('panel_both')}</option>
        </select>
      </div>
      <textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} rows={2} className={`${inputCls} mt-2 resize-none`} placeholder={tr('ph_description')} />
      <input
        value={sup}
        onChange={(e) => setSup(e.target.value)}
        className={`${inputCls} mt-2 font-mono !text-[11px]`}
        placeholder="G2G supplier link (optional) — used by the approval webhook"
      />
      <div className="mt-2.5 flex items-center gap-2">
        <button
          onClick={() => setD({ ...d, active: !d.active })}
          className={`px-3 py-2.5 rounded-xl text-[11px] font-extrabold transition ${d.active ? 'bg-emerald-500/12 text-emerald-500' : 'bg-red-500/12 text-red-500'}`}
        >
          {d.active ? tr('active_lbl') : tr('hidden_lbl')}
        </button>
        <div className="flex-1" />
        <button onClick={remove} disabled={busy} className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition disabled:opacity-50" title={tr('del_confirm')}>
          <Trash2 size={15} />
        </button>
        <button onClick={save} disabled={busy} className="px-5 py-2.5 rounded-xl tg-btn text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {tr('save')}
        </button>
      </div>
    </div>
  );
}

function ProductsTab({ token }: { token: string }) {
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', price: '', category: 'Gift Cards', panel: 'retail', stock: '20', min_qty: '1', description: '' });
  const [img, setImg] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState('');
  const { toast, bumpProducts, tr, lang } = useApp();

  const load = useCallback(async () => {
    try {
      const data = await api.get<Product[]>('/api/products?panel=all', token);
      setRows(Array.isArray(data) ? data : []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast('error', tr('ph_product_name'));
    if (!Number(form.price)) return toast('error', tr('ph_price'));
    if (!img) return toast('error', tr('ph_product_image'));
    setBusy(true);
    try {
      const base64 = await fileToBase64(img);
      const up = await api.post<{ url: string }>('/api/upload', { bucket: 'products', fileName: img.name, fileBase64: base64, contentType: img.type }, token);
      const created = await api.post<any>(
        '/api/products',
        {
          name: form.name.trim(),
          description: form.description,
          category: form.category,
          price_dzd: Number(form.price),
          image_url: up.url,
          panel: form.panel,
          stock: Number(form.stock) || 0,
          min_qty: Number(form.min_qty) || 1,
          active: true,
          sort: rows.length + 1,
        },
        token
      );
      if (!created?.alert_sent) beaconProductNew(form.name.trim());
      toast('success', 'Product added');
      setForm({ name: '', price: '', category: 'Gift Cards', panel: 'retail', stock: '20', min_qty: '1', description: '' });
      setImg(null);
      setImgPreview('');
      setShowAdd(false);
      bumpProducts();
      await load();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        onClick={() => setShowAdd((s) => !s)}
        className="w-full mb-3 py-3 rounded-2xl border-2 border-dashed border-line text-sm font-extrabold text-mut hover:text-acc hover:border-acc transition flex items-center justify-center gap-2"
      >
        {showAdd ? <X size={15} /> : <Plus size={15} />}
        {showAdd ? tr('close_form') : tr('add_new_product')}
      </button>

      <GiftPoolCard token={token} />

      <AnimatePresence>
        {showAdd && (
          <motion.form
            key={lang}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={add}
            className="overflow-hidden bg-card border border-line rounded-2xl shadow-sm mb-3"
          >
            <div className="p-4 space-y-2.5">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder={tr('ph_product_name')} />
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^0-9]/g, '') })} className={`${inputCls} pe-11`} placeholder={`${tr('ph_price')} *`} />
                  <span className="absolute end-2.5 top-1/2 -translate-y-1/2 text-[10px] font-extrabold text-gold">DZD</span>
                </div>
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls} placeholder={tr('ph_category')} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select value={form.panel} onChange={(e) => setForm({ ...form, panel: e.target.value })} className={`${inputCls} font-semibold`}>
                  <option value="retail">{tr('panel_retail')}</option>
                  <option value="wholesale">{tr('panel_wholesale')}</option>
                  <option value="both">{tr('panel_both')}</option>
                </select>
                <input value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value.replace(/[^0-9]/g, '') })} className={inputCls} placeholder={tr('ph_stock')} />
                <input value={form.min_qty} onChange={(e) => setForm({ ...form, min_qty: e.target.value.replace(/[^0-9]/g, '') })} className={inputCls} placeholder={tr('ph_min_qty')} />
              </div>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={`${inputCls} resize-none`} placeholder={tr('ph_description')} />
              <label className="flex items-center gap-3 border-2 border-dashed border-line rounded-xl p-3 cursor-pointer hover:border-acc transition">
                {imgPreview ? (
                  <img src={imgPreview} alt="preview" className="w-11 h-11 rounded-lg object-cover border border-line" />
                ) : (
                  <span className="w-11 h-11 rounded-lg bg-soft flex items-center justify-center text-mut">
                    <ImageIcon size={18} />
                  </span>
                )}
                <span className="text-xs font-semibold text-mut">{img ? img.name : tr('ph_product_image')}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0] || null;
                    setImg(f);
                    setImgPreview(f ? await fileToDataUrl(f) : '');
                  }}
                />
              </label>
              <button type="submit" disabled={busy} className="w-full py-3 rounded-xl tg-btn text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                {tr('add_product')}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="py-16 flex justify-center text-mut">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-card border border-line rounded-2xl p-8 text-center">
          <p className="text-sm font-semibold text-red-500">{error}</p>
          <button onClick={() => { setLoading(true); load(); }} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl tg-btn text-sm font-bold">
            <RefreshCw size={15} /> {tr('retry')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-mut font-semibold">{tr('tip_super_edit')}</p>
            <SectionReset token={token} section="products" title={tr('rs_products_t')} onDone={() => { bumpProducts(); load(); }} />
          </div>
          {rows.map((p) => (
            <ProductRow key={p.id} p={p} token={token} onReload={load} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------ content */

function ContentRow({ cfg }: { cfg: { key: string; label: string; textarea?: boolean } }) {
  const { content, saveContent, toast, tr } = useApp();
  const [val, setVal] = useState(content[cfg.key] ?? '');
  const [busy, setBusy] = useState(false);
  const dirty = val !== (content[cfg.key] ?? '');

  const save = async () => {
    setBusy(true);
    try {
      await saveContent(cfg.key, val);
      toast('success', `${cfg.label} saved`);
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-line rounded-2xl p-3.5 shadow-sm">
      <p className="text-[11px] font-extrabold text-mut uppercase tracking-wide mb-1.5">{cfg.label}</p>
      {cfg.textarea ? (
        <textarea value={val} onChange={(e) => setVal(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
      ) : (
        <input value={val} onChange={(e) => setVal(e.target.value)} className={inputCls} />
      )}
      {dirty && (
        <button onClick={save} disabled={busy} className="mt-2 px-4 py-2 rounded-xl tg-btn text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {tr('save')}
        </button>
      )}
    </div>
  );
}

function ContentTab({ token }: { token: string }) {
  const { contentLoaded, content, tr } = useApp();
  const refreshOnReset = () => window.setTimeout(() => window.location.reload(), 900);
  if (!contentLoaded)
    return (
      <div className="py-16 flex justify-center text-mut">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  const known = new Set(CONTENT_CONFIG.map((c) => c.key));
  const extras = Object.keys(content).filter((k) => !known.has(k) && !k.startsWith('show_'));
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] text-mut font-semibold leading-relaxed flex-1">{tr('content_hint')}</p>
        <SectionReset token={token} section="content" title={tr('rs_content_t')} onDone={refreshOnReset} />
      </div>
      {CONTENT_CONFIG.map((cfg) => (
        <ContentRow key={cfg.key} cfg={cfg} />
      ))}
      {extras.map((k) => (
        <ContentRow key={k} cfg={{ key: k, label: k, textarea: (content[k] || '').length > 60 }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------ flash happy hour */

function FlashCard({ token }: { token: string }) {
  const { toast, tr } = useApp();
  const [flash, setFlash] = useState<any>(null);
  const [pct, setPct] = useState('20');
  const [mins, setMins] = useState('30');
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);

  const load = useCallback(async () => {
    try {
      setFlash(await api.get('/api/flash'));
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    load();
    const iv = window.setInterval(load, 15000);
    return () => window.clearInterval(iv);
  }, [load]);

  useEffect(() => {
    if (!flash?.active || !flash.ends_at) return;
    const tick = () => setLeft(Math.max(0, Math.floor((Date.parse(flash.ends_at) - Date.now()) / 1000)));
    tick();
    const iv = window.setInterval(tick, 1000);
    return () => window.clearInterval(iv);
  }, [flash]);

  const start = async () => {
    setBusy(true);
    try {
      const r = await api.post<any>('/api/flash', { pct: Number(pct), minutes: Number(mins) }, token);
      setFlash(r);
      toast('success', `Happy Hour −${Number(pct)}% for ${mins} min — Telegram alert sent`);
      hapticNotify('success');
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      setFlash(await api.post<any>('/api/flash', { action: 'stop' }, token));
      toast('info', 'Happy Hour stopped');
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`mt-3 rounded-2xl border p-4 shadow-sm ${
        flash?.active ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/40' : 'bg-card border-line'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${flash?.active ? 'bg-amber-500 text-white animate-pulse' : 'bg-amber-500/15 text-amber-500'}`}>
          <Timer size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-sm">{tr('flash_live')}</p>
          <p className="text-[11px] text-mut leading-snug">
            {flash?.active
              ? `−${flash.pct}% — ${tr('flash_ends_in')} ${Math.floor(left / 60)}m ${String(left % 60).padStart(2, '0')}s`
              : 'Temporary discount on all retail products + Telegram alert + 5-min cart expiration'}
          </p>
        </div>
        {flash?.active ? (
          <button
            onClick={stop}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl bg-red-500 text-white text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} {tr('flash_stop')}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              value={pct}
              inputMode="numeric"
              onChange={(e) => setPct(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-16 bg-soft border border-line rounded-xl px-2 py-2.5 text-sm font-mono font-bold text-center outline-none focus:border-acc transition"
              title="Discount %"
            />
            <select
              value={mins}
              onChange={(e) => setMins(e.target.value)}
              className="bg-soft border border-line rounded-xl px-2.5 py-2.5 text-xs font-bold outline-none focus:border-acc transition"
            >
              {[15, 30, 60, 120].map((m) => (
                <option key={m} value={m}>
                  {m} {tr('flash_minutes')}
                </option>
              ))}
            </select>
            <button
              onClick={start}
              disabled={busy || !Number(pct)}
              className="px-4 py-2.5 rounded-xl tg-btn text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Timer size={13} />} {tr('flash_start')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------ live traffic analytics */

function LiveTrafficCard({ token }: { token: string }) {
  const { tr } = useApp();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await api.get<any[]>('/api/presence', token);
        if (alive) setRows(Array.isArray(d) ? d : []);
      } catch {
        /* keep last */
      }
    };
    load();
    const iv = window.setInterval(load, 8000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [token]);

  const traders = rows.filter((r) => r.role === 'merchant');
  const roleChip: Record<string, string> = {
    guest: 'bg-slate-500/12 text-slate-400',
    customer: 'bg-blue-500/12 text-blue-500',
    merchant: 'bg-violet-500/12 text-violet-500',
    admin: 'bg-slate-700/20 text-mut',
  };
  const roleKey: Record<string, string> = {
    guest: 'role_guest',
    customer: 'role_customer',
    merchant: 'role_merchant',
    admin: 'role_admin',
  };

  return (
    <div className="mt-3 bg-card border border-line rounded-2xl p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="w-10 h-10 rounded-xl bg-emerald-500/12 text-emerald-500 flex items-center justify-center shrink-0 relative">
          <span className="absolute -top-1 -end-1 w-3 h-3 rounded-full bg-emerald-400 animate-pulsedot border-2 border-[var(--app-card)]" />
          <Activity size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-sm">{tr('live_traffic')}</p>
          <p className="text-[11px] text-mut font-semibold">
            <span className="text-emerald-500 font-extrabold">{rows.length}</span> online ·{' '}
            <span className="text-violet-500 font-extrabold">
              {tr('traders_now')}: {traders.length}
            </span>
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-violet-500/12 text-violet-500 text-[11px] font-extrabold shrink-0 flex items-center gap-1.5">
          <Users size={12} /> {traders.length}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <p className="text-[12px] text-mut font-semibold text-center py-3">{tr('live_none')}</p>
        ) : (
          rows.slice(0, 8).map((r) => {
            const ago = Math.max(0, Math.floor((Date.now() - Date.parse(r.updated_at)) / 1000));
            const barColor = r.intent >= 80 ? 'bg-emerald-500' : r.intent >= 45 ? 'bg-amber-500' : 'bg-slate-400';
            return (
              <div key={r.session_id} className="flex items-center gap-2.5 bg-soft rounded-xl px-3 py-2">
                <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-extrabold uppercase tracking-wide shrink-0 ${roleChip[r.role] || roleChip.guest}`}>
                  {tr(roleKey[r.role] || 'role_guest')}
                </span>
                <span className="text-[11.5px] font-bold truncate flex-1">{r.page}</span>
                <div className="flex items-center gap-1.5 shrink-0 w-24">
                  <div className="flex-1 h-1.5 rounded-full bg-black/10 overflow-hidden" dir="ltr">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${r.intent}%` }} />
                  </div>
                  <span className={`text-[10px] font-extrabold w-8 text-end ${r.intent >= 80 ? 'text-emerald-500' : r.intent >= 45 ? 'text-amber-500' : 'text-mut'}`}>
                    {r.intent}%
                  </span>
                </div>
                <span className="text-[9.5px] text-mut font-bold w-8 text-end shrink-0">{ago}s</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------ SÉCURITÉ AI control center */

function SecurityTab({ token }: { token: string }) {
  const { toast, tr, content, saveContent } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [limit, setLimit] = useState('3');
  const [savingKey, setSavingKey] = useState('');

  useEffect(() => {
    setLimit(content.sec_velocity_limit || '3');
  }, [content.sec_velocity_limit]);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<any[]>('/api/fraud', token));
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const iv = window.setInterval(load, 12000);
    return () => window.clearInterval(iv);
  }, [load]);

  const saveCfg = async (key: string, value: string) => {
    setSavingKey(key);
    try {
      await saveContent(key, value);
      toast('success', 'Saved ✔');
      hapticNotify('success');
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setSavingKey('');
    }
  };

  const act = async (id: number, action: 'freeze' | 'whitelist') => {
    setBusyId(id);
    try {
      await api.put('/api/fraud', { id, action }, token);
      toast('success', action === 'freeze' ? tr('freeze_btn') + ' ✔' : tr('whitelist_btn') + ' ✔');
      await load();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const vpn = content.sec_vpn_block !== '0';
  const level = ['low', 'medium', 'high'].includes(content.sec_fp_level) ? content.sec_fp_level : 'medium';
  const LEVELS = ['low', 'medium', 'high'];

  return (
    <div className="space-y-3">
      {/* ENGINE CONTROLS */}
      <div className="bg-card border border-line rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-10 h-10 rounded-xl bg-red-500/12 text-red-500 flex items-center justify-center shrink-0">
            <ShieldAlert size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-sm">{tr('tab_security')}</p>
            <p className="text-[10.5px] text-mut font-semibold">Fingerprint canvas · IP sentinel · velocity · challenge coherence</p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/12 text-emerald-500 text-[10px] font-extrabold uppercase tracking-wide animate-pulsedot">LIVE</span>
        </div>

        {/* VPN toggle */}
        <div className="flex items-center justify-between gap-3 bg-soft rounded-xl px-3 py-3">
          <div className="min-w-0">
            <p className="text-[12px] font-extrabold">{tr('sec_vpn')}</p>
            <p className="text-[10px] text-mut font-semibold leading-snug">Blocks registrations & purchases from proxy/VPN connections</p>
          </div>
          <button
            onClick={() => saveCfg('sec_vpn_block', vpn ? '0' : '1')}
            disabled={savingKey === 'sec_vpn_block'}
            className={`relative w-12 h-7 rounded-full transition shrink-0 ${vpn ? 'bg-emerald-500' : 'bg-slate-600/60'}`}
            aria-label="VPN blocker toggle"
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${vpn ? 'end-1' : 'end-6'}`}
            />
          </button>
        </div>

        {/* fingerprint sensitivity */}
        <div className="mt-2.5 flex items-center justify-between gap-3 bg-soft rounded-xl px-3 py-3">
          <div className="min-w-0">
            <p className="text-[12px] font-extrabold">{tr('sec_fp')}</p>
            <p className="text-[10px] text-mut font-semibold leading-snug">Low = flag only · Medium = block duplicates · High = block + freeze 24h</p>
          </div>
          <div className="flex gap-1 shrink-0">
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => saveCfg('sec_fp_level', l)}
                disabled={savingKey === 'sec_fp_level'}
                className={`px-2.5 py-2 rounded-lg text-[10px] font-extrabold uppercase tracking-wide transition active:scale-95 ${
                  level === l ? 'bg-acc text-white shadow' : 'bg-card border border-line text-mut'
                }`}
              >
                {tr(`sec_level_${l}`)}
              </button>
            ))}
          </div>
        </div>

        {/* velocity threshold */}
        <div className="mt-2.5 flex items-center justify-between gap-3 bg-soft rounded-xl px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-extrabold">{tr('sec_velocity')}</p>
            <p className="text-[10px] text-mut font-semibold leading-snug">Rapid requests in a row before a 24h freeze (orders / deposits / registrations)</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <input
              value={limit}
              inputMode="numeric"
              onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-14 bg-card border border-line rounded-xl px-2 py-2 text-sm font-mono font-bold text-center outline-none focus:border-acc transition"
            />
            <button
              onClick={() => saveCfg('sec_velocity_limit', String(Math.max(1, parseInt(limit, 10) || 3)))}
              disabled={savingKey === 'sec_velocity_limit'}
              className="px-3.5 py-2 rounded-xl tg-btn text-[10.5px] font-extrabold disabled:opacity-50 active:scale-95 transition"
            >
              {tr('modify_value')}
            </button>
          </div>
        </div>
      </div>

      {/* JOURNAL SUSPICION AI */}
      <div className="bg-card border border-red-500/30 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-9 h-9 rounded-xl bg-red-500/12 text-red-500 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} />
          </span>
          <p className="flex-1 font-extrabold text-sm">{tr('journal_title')}</p>
          <span className="px-2.5 py-1 rounded-full bg-red-500/12 text-red-500 text-[10.5px] font-extrabold shrink-0">{rows.length}</span>
        </div>

        {loading ? (
          <div className="py-10 flex justify-center text-mut">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-[12px] text-mut font-semibold text-center py-6">{tr('journal_empty')}</p>
        ) : (
          <div className="space-y-2">
            {rows.map((f) => {
              const frozen = f.frozen_until && Date.parse(f.frozen_until) > Date.now();
              const riskColor = f.risk >= 80 ? 'bg-red-500 text-white' : f.risk >= 60 ? 'bg-amber-500 text-black' : 'bg-slate-500/30 text-ink';
              return (
                <div key={f.id} className="bg-soft rounded-xl p-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded-full bg-soft border border-line text-[9.5px] font-extrabold uppercase tracking-wide shrink-0">
                      {f.actor_type === 'merchant' ? tr('role_merchant') : f.actor_type === 'customer' ? tr('role_customer') : tr('role_guest')}
                      {f.actor_id ? ` #${f.actor_id}` : ''}
                    </span>
                    <p className="text-[11.5px] font-bold truncate flex-1">{f.actor_name || (f.hw ? String(f.hw).slice(0, 14) : '—')}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${riskColor}`}>{tr('risk_lbl')} {f.risk}%</span>
                  </div>
                  <p className="mt-1 text-[10.5px] text-mut font-semibold leading-snug truncate" title={f.reason}>
                    {f.reason}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[9.5px] text-mut font-bold">{timeAgo(f.created_at)}{frozen ? ` · ${tr('frozen_lbl')}` : ''}</span>
                    <div className="ms-auto flex gap-1.5">
                      <button
                        onClick={() => act(f.id, 'freeze')}
                        disabled={busyId === f.id}
                        className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[10px] font-extrabold flex items-center gap-1 disabled:opacity-50 active:scale-95 transition"
                      >
                        {busyId === f.id ? <Loader2 size={11} className="animate-spin" /> : <Lock size={11} />}
                        {tr('freeze_btn')}
                      </button>
                      <button
                        onClick={() => act(f.id, 'whitelist')}
                        disabled={busyId === f.id}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[10px] font-extrabold flex items-center gap-1 disabled:opacity-50 active:scale-95 transition"
                      >
                        {busyId === f.id ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
                        {tr('whitelist_btn')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------ anti-fraud signals */

function FraudSignalsCard({ token }: { token: string }) {
  const { toast, tr } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<any[]>('/api/fraud', token));
    } catch {
      /* silent */
    }
  }, [token]);

  useEffect(() => {
    load();
    const iv = window.setInterval(load, 15000);
    return () => window.clearInterval(iv);
  }, [load]);

  const unfreeze = async (id: number) => {
    setBusyId(id);
    try {
      await api.put('/api/fraud', { id, action: 'unfreeze' }, token);
      toast('success', tr('fraud_unfreeze') + ' ✔');
      await load();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (!rows.length) return null;

  return (
    <div className="mt-3 bg-card border border-red-500/30 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="w-10 h-10 rounded-xl bg-red-500/12 text-red-500 flex items-center justify-center shrink-0 relative">
          <span className="absolute -top-1 -end-1 w-3 h-3 rounded-full bg-red-500 animate-pulsedot border-2 border-[var(--app-card)]" />
          <AlertTriangle size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-sm">{tr('fraud_title')}</p>
          <p className="text-[10.5px] text-mut font-semibold">Anti-fraud engine: device fingerprint + IP + velocity + challenge coherence</p>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-red-500/12 text-red-500 text-[11px] font-extrabold shrink-0">{rows.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {rows.slice(0, 8).map((f) => {
          const frozen = f.frozen_until && Date.parse(f.frozen_until) > Date.now();
          return (
            <div key={f.id} className="flex items-center gap-2.5 bg-soft rounded-xl px-3 py-2">
              <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-extrabold uppercase tracking-wide shrink-0 ${frozen ? 'bg-red-500 text-white' : 'bg-amber-500/15 text-amber-500'}`}>
                {frozen ? tr('frozen_lbl') : '⚠ risk'}
              </span>
              <span className="text-[11px] font-bold truncate flex-1 min-w-0">{f.reason}</span>
              <span className="text-[9.5px] text-mut font-mono shrink-0 hidden sm:block">
                {(f.actor_type || '?')}# {f.actor_id ?? '—'} · {f.hw ? String(f.hw).slice(0, 12) : '—'}
              </span>
              {frozen && (
                <button
                  onClick={() => unfreeze(f.id)}
                  disabled={busyId === f.id}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/90 text-white text-[9.5px] font-extrabold disabled:opacity-50 active:scale-95 transition shrink-0"
                >
                  {busyId === f.id ? <Loader2 size={11} className="animate-spin" /> : tr('fraud_unfreeze')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------ merchant wallet deposits */

function DepositsTab({ token }: { token: string }) {
  const { toast, tr, saveContent } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [retailRows, setRetailRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rate, setRate] = useState('270');
  const [fee, setFee] = useState('50');
  const [savingKey, setSavingKey] = useState('');
  const [board, setBoard] = useState<Array<{ merchant_id: number; name: string; total_usd: number }>>([]);

  const load = useCallback(async () => {
    try {
      const d = await api.get<any>('/api/wallet?mode=admin', token);
      setRows(Array.isArray(d.deposits) ? d.deposits : []);
      setRetailRows(Array.isArray(d.retailDeposits) ? d.retailDeposits : []);
      setRate(String(d.rate ?? '270'));
      setFee(String(d.feeDzd ?? '50'));
      setBoard(Array.isArray(d.leaderboard) ? d.leaderboard : []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load deposits');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const iv = window.setInterval(() => load(), 10000);
    return () => window.clearInterval(iv);
  }, [load]);

  const saveSetting = async (key: string, val: string) => {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return toast('error', tr('v_amount'));
    setSavingKey(key);
    try {
      await saveContent(key, String(n));
      toast('success', 'Saved');
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setSavingKey('');
    }
  };

  const act = async (id: number, action: 'approve' | 'reject', kind: 'merchant' | 'customer' = 'merchant') => {
    setBusyId(id);
    try {
      const r = await api.put<any>('/api/wallet', { id, action, kind }, token);
      if (!r?.alert_sent) {
        tgBeacon(
          action === 'approve'
            ? `✅ <b>Deposit #${id} APPROVED</b>\n👤 ${r.merchant_name}\n💰 +$${Number(r.usd_credited).toFixed(2)} → new wallet balance $${Number(r.new_balance ?? 0).toFixed(2)}`
            : `❌ <b>Deposit #${id} REJECTED</b> — ${r.merchant_name}`
        );
      }
      toast(
        'success',
        action === 'approve'
          ? `Credited $${Number(r.usd_credited).toFixed(2)} — wallet balance $${Number(r.new_balance ?? 0).toFixed(2)}`
          : 'Deposit rejected'
      );
      hapticNotify('success');
      await load();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const sorted = [...rows].sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0));
  const retailSorted = [...retailRows].sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0));

  const renderDepositCard = (d: any, kind: 'merchant' | 'customer') => {
    const usdt = d.method === 'usdt';
    return (
      <motion.div key={`${kind}-${d.id}`} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-line rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-extrabold text-sm">#{d.id}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-wide flex items-center gap-1 ${
              usdt ? 'bg-teal-500/12 text-teal-500' : 'bg-emerald-600/12 text-emerald-600'
            }`}
          >
            {usdt ? <Coins size={11} /> : <Landmark size={11} />}
            {usdt ? 'USDT' : 'Baridimob'}
          </span>
          {kind === 'customer' && (
            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-wide bg-blue-500/12 text-blue-500">
              BUYER
            </span>
          )}
          <span
            className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-wide ${
              d.status === 'approved'
                ? 'bg-emerald-500/12 text-emerald-500'
                : d.status === 'rejected'
                  ? 'bg-red-500/12 text-red-500'
                  : 'bg-amber-500/12 text-amber-500'
            }`}
          >
            {d.status}
          </span>
          <span className="ms-auto text-[11px] text-mut font-semibold flex items-center gap-1">
            <Clock size={11} /> {timeAgo(d.created_at)}
          </span>
        </div>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          <div className="bg-soft rounded-xl p-3 text-sm">
            <p className="font-bold truncate">{d.merchant_name}</p>
            <p className="text-mut text-xs mt-0.5">
              {usdt
                ? `${tr('you_pay')}: $${Number(d.amount_input).toFixed(2)} + $${Number(d.fee).toFixed(2)} ${tr('crypto_fee')}`
                : `${tr('you_pay')}: ${fmtDZD(d.amount_input)} + ${fmtDZD(d.fee)} — ${tr('exchange_rate_lbl')}: ${d.rate}`}
            </p>
            <p className="mt-1.5 font-extrabold text-gold">
              {tr('usd_credited')}: {fmtUSD(d.usd_credited)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {d.proof_url ? (
              <a href={d.proof_url} target="_blank" rel="noreferrer" className="shrink-0">
                <img src={d.proof_url} alt="proof" className="w-14 h-14 rounded-lg object-cover border border-line hover:opacity-80 transition" />
              </a>
            ) : (
              <span className="w-14 h-14 rounded-lg bg-soft flex items-center justify-center text-mut shrink-0">
                <FileText size={18} />
              </span>
            )}
            {d.status === 'pending' && (
              <div className="flex-1 flex flex-wrap gap-2 justify-end">
                <button
                  onClick={() => act(d.id, 'approve', kind)}
                  disabled={busyId === d.id}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition"
                >
                  {busyId === d.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {tr('approve')} → {fmtUSD(d.usd_credited)}
                </button>
                <button
                  onClick={() => act(d.id, 'reject', kind)}
                  disabled={busyId === d.id}
                  className="px-4 py-2.5 rounded-xl bg-red-500/90 text-white text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition"
                >
                  <X size={13} /> {tr('reject')}
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div>
      {/* Deposit settings — admin-tunable formulas */}
      <div className="bg-card border border-line rounded-2xl p-4 shadow-sm mb-3">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <p className="text-[11px] font-extrabold text-mut uppercase tracking-wide">{tr('deposit_settings')}</p>
          <SectionReset token={token} section="deposits" title={tr('rs_deposits_t')} onDone={load} />
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[10.5px] font-bold text-mut mb-1">{tr('exchange_rate_lbl')}</label>
            <div className="flex gap-2">
              <input
                value={rate}
                inputMode="decimal"
                onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))}
                className={`${inputCls} flex-1 font-mono font-bold`}
              />
              <button
                onClick={() => saveSetting('usd_dzd_rate', rate)}
                disabled={savingKey === 'usd_dzd_rate'}
                className="px-3.5 rounded-xl tg-btn text-[11px] font-extrabold whitespace-nowrap disabled:opacity-50 active:scale-95 transition"
              >
                {savingKey === 'usd_dzd_rate' ? <Loader2 size={12} className="animate-spin" /> : tr('modify_value')}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-mut">1 USD = {rate} DZD</p>
          </div>
          <div>
            <label className="block text-[10.5px] font-bold text-mut mb-1">{tr('bm_fee_lbl')}</label>
            <div className="flex gap-2">
              <input
                value={fee}
                inputMode="decimal"
                onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ''))}
                className={`${inputCls} flex-1 font-mono font-bold`}
              />
              <button
                onClick={() => saveSetting('baridimob_fee_dzd', fee)}
                disabled={savingKey === 'baridimob_fee_dzd'}
                className="px-3.5 rounded-xl tg-btn text-[11px] font-extrabold whitespace-nowrap disabled:opacity-50 active:scale-95 transition"
              >
                {savingKey === 'baridimob_fee_dzd' ? <Loader2 size={12} className="animate-spin" /> : tr('modify_value')}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-mut">{tr('crypto_fee')}: $2.00 (USDT)</p>
          </div>
        </div>
      </div>

      {/* Weekly Top Depositors leaderboard */}
      {board.length > 0 && (
        <div className="bg-card border border-line rounded-2xl p-4 shadow-sm mb-3">
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold text-mut uppercase tracking-wide">
            <Trophy size={13} className="text-gold" /> {tr('leaderboard_title')}
          </p>
          <div className="mt-2 space-y-1">
            {board.slice(0, 5).map((r, i) => (
              <div key={r.merchant_id} className="flex items-center gap-2.5 rounded-xl bg-soft px-3 py-2 text-[12px] font-bold">
                <span className="w-6 text-center">{['🥇', '🥈', '🥉'][i] || `#${i + 1}`}</span>
                <span className="flex-1 truncate">{r.name}</span>
                <span className="text-gold font-extrabold">{fmtUSD(r.total_usd)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center text-mut">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-card border border-line rounded-2xl p-8 text-center">
          <p className="text-sm font-semibold text-red-500">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              load();
            }}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl tg-btn text-sm font-bold"
          >
            <RefreshCw size={15} /> {tr('retry')}
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-card border border-line rounded-2xl p-10 text-center text-sm text-mut font-medium">
          <Wallet size={26} className="mx-auto mb-2 opacity-40" />
          {tr('deposits_empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((d) => renderDepositCard(d, 'merchant'))}
        </div>
      )}

      {/* Retail buyer deposits — same manual approval workflow */}
      {retailSorted.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-mut">
            <UserRound size={13} className="text-blue-500" /> Buyer deposits — retail wallets
          </p>
          <div className="space-y-3">{retailSorted.map((d) => renderDepositCard(d, 'customer'))}</div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------ per-section secure reset */

function SectionReset({ token, section, title, onDone }: { token: string; section: string; title: string; onDone: () => void }) {
  const { toast, tr } = useApp();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async () => {
    if (!pw) return setErr(tr('rs_confirm'));
    setBusy(true);
    setErr('');
    try {
      await api.post<any>('/api/reset-section', { section, password: pw }, token);
      toast('success', `${tr('rs_done')} ✔`);
      hapticNotify('success');
      setOpen(false);
      setPw('');
      onDone();
    } catch (e: any) {
      setErr(e.message || 'Failed');
      hapticNotify('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setErr('');
          setPw('');
        }}
        title={title}
        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-red-500/10 text-red-500 border border-red-500/30 text-[10.5px] font-extrabold hover:bg-red-500/20 active:scale-95 transition shrink-0"
      >
        <Trash2 size={12} /> {tr('rs_button')}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3"
            onClick={() => !busy && setOpen(false)}
          >
            <motion.div
              initial={{ y: 50, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0, scale: 0.97 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              onClick={(e: any) => e.stopPropagation()}
              className="w-[min(94vw,400px)] bg-card border-2 border-red-500/40 rounded-3xl p-5 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-2xl bg-red-500/12 text-red-500 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-extrabold text-sm text-red-500 leading-tight">{title}</h3>
                  <p className="text-[10.5px] text-mut font-semibold">{tr('rs_confirm')}</p>
                </div>
                <button onClick={() => !busy && setOpen(false)} className="p-2 rounded-full bg-soft text-mut hover:text-ink transition shrink-0" aria-label="Close">
                  <X size={16} />
                </button>
              </div>
              <div className="relative mt-4">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="Samirsami9@"
                  autoComplete="off"
                  className={`${inputCls} pe-11 font-mono`}
                />
                <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute end-3 top-1/2 -translate-y-1/2 text-mut hover:text-ink transition" aria-label="Toggle password">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {err && (
                <p className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-red-500">
                  <AlertTriangle size={13} /> {err}
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <button onClick={() => setOpen(false)} disabled={busy} className="flex-1 py-3 rounded-xl bg-soft text-sm font-bold text-mut hover:text-ink transition disabled:opacity-50">
                  إلغاء / Cancel
                </button>
                <button
                  onClick={run}
                  disabled={busy || !pw}
                  className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} {tr('rs_button')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------ retail clients (buyers) */

function ClientsTab({ token }: { token: string }) {
  const { tr } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await api.get<any[]>('/api/customers', token));
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-sm">{tr('tab_clients')}</p>
          <p className="text-[10.5px] text-mut">{tr('clients_hint')}</p>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-acc/10 text-acc text-[11px] font-extrabold shrink-0">{rows.length}</span>
        <SectionReset token={token} section="customers" title={tr('rs_customers_t')} onDone={load} />
      </div>
      {loading ? (
        <div className="py-16 flex justify-center text-mut">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-card border border-line rounded-2xl p-8 text-center">
          <p className="text-sm font-semibold text-red-500">{error}</p>
          <button onClick={() => { setLoading(true); load(); }} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl tg-btn text-sm font-bold">
            <RefreshCw size={15} /> {tr('retry')}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-card border border-line rounded-2xl p-10 text-center text-sm text-mut font-medium">
          <UserRound size={26} className="mx-auto mb-2 opacity-40" />
          {tr('clients_empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-line rounded-2xl p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="w-10 h-10 rounded-xl bg-blue-500/12 text-blue-500 flex items-center justify-center font-extrabold text-sm">
                  {c.name?.[0] || '?'}
                </span>
                <div className="min-w-0">
                  <p className="font-extrabold text-sm">{c.name}</p>
                  <p className="text-[11px] text-[#229ED9] font-bold">@{c.username}</p>
                </div>
                <span className="ms-auto px-2 py-0.5 rounded-full bg-soft text-[10.5px] font-extrabold text-mut">
                  {c.orders_count} {tr('tab_orders')}
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11.5px] font-semibold">
                <p className="flex items-center gap-1.5 bg-soft rounded-lg px-2.5 py-2 min-w-0">
                  <Phone size={12} className="text-mut shrink-0" /> <span className="truncate">{c.phone || '—'}</span>
                </p>
                <p className="flex items-center gap-1.5 bg-soft rounded-lg px-2.5 py-2 min-w-0">
                  <MapPin size={12} className="text-mut shrink-0" /> <span className="truncate">{c.wilaya || '—'}</span>
                </p>
              </div>
              <p className="mt-2 text-[10px] text-mut font-mono">
                FP: {c.fp ? String(c.fp).slice(0, 12) + '…' : '—'} • {timeAgo(c.created_at)}
              </p>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------ telegram alerts */

function TelegramAlertsCard({ token }: { token: string }) {
  const { toast } = useApp();
  const [status, setStatus] = useState<{ connected: boolean; chat_id: string | null; bot_username: string | null } | null>(null);
  const [busy, setBusy] = useState<'connect' | 'test' | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api.get('/api/telegram?action=status', token));
    } catch {
      setStatus(null);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const connect = async () => {
    setBusy('connect');
    try {
      const r = await api.post<any>('/api/telegram', { action: 'connect' }, token);
      toast('success', `Telegram alerts connected (chat ${r.chat_id})`);
      hapticNotify('success');
      await load();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      await api.post('/api/telegram', { action: 'test' }, token);
      toast('success', 'Test alert sent to your Telegram');
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 bg-card border border-line rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-3">
      <span
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          status?.connected ? 'bg-emerald-500/12 text-emerald-500' : 'bg-amber-500/12 text-amber-500'
        }`}
      >
        <BellRing size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-extrabold text-sm">Telegram Bot Alerts</p>
        <p className="text-[11px] text-mut leading-snug mt-0.5">
          {status === null
            ? 'Checking connection…'
            : status.connected
              ? `Connected — instant alerts for new orders, wholesaler applications and Super Edit saves are sent to your Telegram (chat ${status.chat_id}).`
              : `Not connected.${status.bot_username ? ` Open @${status.bot_username} in Telegram and send /start, then press Connect.` : ' Send /start to the bot in Telegram, then press Connect.'}`}
        </p>
      </div>
      {!status?.connected ? (
        <button
          onClick={connect}
          disabled={busy !== null}
          className="px-4 py-2.5 rounded-xl tg-btn text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition"
        >
          {busy === 'connect' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Connect
        </button>
      ) : (
        <button
          onClick={test}
          disabled={busy !== null}
          className="px-4 py-2.5 rounded-xl bg-soft border border-line text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition"
        >
          {busy === 'test' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Send test
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------ dashboard */

function Dashboard({ token }: { token: string }) {
  const [tab, setTab] = useState<'orders' | 'deposits' | 'merchants' | 'clients' | 'products' | 'referrals' | 'content'>('orders');
  const [secOpen, setSecOpen] = useState(false);
  const [stats, setStats] = useState({ pending: 0, revenue: 0, merchants: 0, products: 0, depositsUsd: 0, depositsCount: 0 });
  const { editMode, setEditMode, setAdminToken, tr } = useApp();

  const loadStats = useCallback(async () => {
    const [o, m, p, dep] = await Promise.allSettled([
      api.get<Order[]>('/api/orders', token),
      api.get<Merchant[]>('/api/merchants', token),
      api.get<Product[]>('/api/products?panel=all', token),
      api.get<any>('/api/wallet?mode=admin', token),
    ]);
    const orders = o.status === 'fulfilled' ? o.value : [];
    const merchants = m.status === 'fulfilled' ? m.value : [];
    const products = p.status === 'fulfilled' ? p.value : [];
    // Total deposits metric: pending + approved, trader + retail wallets
    let depositsUsd = 0;
    let depositsCount = 0;
    if (dep.status === 'fulfilled') {
      const allDeps = [...(dep.value.deposits || []), ...(dep.value.retailDeposits || [])].filter((d: any) => d.status !== 'rejected');
      depositsCount = allDeps.length;
      depositsUsd = Math.round(allDeps.reduce((s: number, d: any) => s + Number(d.usd_credited || 0), 0) * 100) / 100;
    }
    setStats({
      pending: orders.filter((x) => x.status === 'pending').length,
      revenue: orders.filter((x) => x.status === 'delivered').reduce((s, x) => s + Number(x.total_dzd || 0), 0),
      merchants: merchants.filter((x) => x.status === 'pending').length,
      products: products.length,
      depositsUsd,
      depositsCount,
    });
  }, [token]);

  useEffect(() => {
    loadStats();
    const iv = window.setInterval(loadStats, 15000);
    return () => window.clearInterval(iv);
  }, [loadStats]);

  const cards = [
    { icon: ShoppingBag, label: tr('st_pending_orders'), value: String(stats.pending), tab: 'orders' as const, accent: stats.pending > 0 },
    { icon: Users, label: tr('st_pending_merchants'), value: String(stats.merchants), tab: 'merchants' as const, accent: stats.merchants > 0 },
    { icon: Package, label: tr('st_products'), value: String(stats.products), tab: 'products' as const, accent: false },
    { icon: Check, label: tr('st_revenue'), value: fmtDZD(stats.revenue), tab: 'orders' as const, accent: false },
    { icon: Wallet, label: tr('st_deposits'), value: `${fmtUSD(stats.depositsUsd)} · ${stats.depositsCount}`, tab: 'deposits' as const, accent: false },
  ];

  const tabs = [
    { id: 'orders' as const, label: tr('tab_orders'), icon: ShoppingBag },
    { id: 'deposits' as const, label: tr('tab_deposits'), icon: Wallet },
    { id: 'merchants' as const, label: tr('tab_merchants'), icon: Users },
    { id: 'clients' as const, label: tr('tab_clients'), icon: UserRound },
    { id: 'products' as const, label: tr('tab_products'), icon: Package },
    { id: 'referrals' as const, label: tr('tab_referrals'), icon: Gift },
    { id: 'content' as const, label: tr('tab_content'), icon: FileText },
  ];

  return (
    <div className="max-w-5xl mx-auto px-3 md:px-4 pt-4 md:pt-6">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center shadow-md">
          <ShieldCheck size={18} />
        </span>
        <div>
          <h1 className="text-lg font-extrabold tracking-tight leading-tight">{tr('dash_title')}</h1>
          <p className="text-[11px] text-mut font-semibold">{tr('signed_in_as')} SamirBoulefaa</p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <button
            onClick={() => setEditMode(!editMode)}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition active:scale-95 border ${
              editMode ? 'bg-gold text-black border-black/10 shadow-lg' : 'bg-card border-line text-ink'
            }`}
          >
            <Wand2 size={14} />
            {editMode ? 'Super Edit ON' : 'Super Edit OFF'}
          </button>
          <button
            onClick={() => setAdminToken(null)}
            className="p-2.5 rounded-xl bg-card border border-line text-mut hover:text-red-500 transition"
            title={tr('logout')}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      <TelegramAlertsCard token={token} />
      <FlashCard token={token} />
      <LiveTrafficCard token={token} />
      <FraudSignalsCard token={token} />

      <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {cards.map((c) => (
          <button
            key={c.label}
            onClick={() => setTab(c.tab)}
            className={`bg-card border rounded-xl p-2.5 shadow-sm transition active:scale-[0.98] flex items-center gap-2.5 text-start min-w-0 ${
              c.accent ? 'border-gold/60' : 'border-line'
            }`}
          >
            <span
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                c.accent ? 'bg-gold/15 text-gold' : 'bg-acc/10 text-acc'
              }`}
            >
              <c.icon size={14} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14.5px] font-extrabold tracking-tight truncate">{c.value}</span>
              <span className="block text-[9px] text-mut font-bold uppercase tracking-wide truncate">{c.label}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`shrink-0 px-4 py-2.5 rounded-full text-xs font-extrabold border transition flex items-center gap-1.5 ${
              tab === tb.id ? 'bg-acc text-white border-transparent shadow-md' : 'bg-card border-line text-mut hover:text-ink'
            }`}
          >
            <tb.icon size={13} />
            {tb.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {tab === 'orders' && <OrdersTab token={token} />}
        {tab === 'deposits' && <DepositsTab token={token} />}
        {tab === 'merchants' && <MerchantsTab token={token} />}
        {tab === 'clients' && <ClientsTab token={token} />}
        {tab === 'products' && <ProductsTab token={token} />}
        {tab === 'referrals' && <ReferralsTab token={token} />}
        {tab === 'content' && <ContentTab token={token} />}
      </div>

      {/* Sécurité AI — floating control center trigger */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 16, stiffness: 240, delay: 0.35 }}
        onClick={() => setSecOpen(true)}
        className="fixed z-[82] start-4 bottom-6 flex items-center gap-2 px-4 py-3 rounded-full bg-slate-800 text-white text-[13px] font-extrabold shadow-2xl border border-white/15 active:scale-95 transition"
        aria-label="Sécurité AI"
        title="Sécurité AI"
      >
        <ShieldAlert size={16} className="text-emerald-400" />
        {tr('tab_security')}
      </motion.button>

      {/* Sécurité AI — slide-out drawer (opens hidden, closes clean) */}
      <AnimatePresence>
        {secOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSecOpen(false)}
              className="fixed inset-0 z-[88] bg-black/60 backdrop-blur-[2px]"
            />
            <motion.aside
              initial={{ x: document.documentElement.dir === 'rtl' ? '100%' : '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: document.documentElement.dir === 'rtl' ? '100%' : '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 bottom-0 start-0 z-[90] w-[min(94vw,430px)] bg-surface border-e border-line shadow-2xl flex flex-col"
            >
              <div className="flex items-center gap-2.5 px-4 h-14 border-b border-line shrink-0">
                <span className="w-9 h-9 rounded-xl bg-red-500/12 text-red-500 flex items-center justify-center shrink-0">
                  <ShieldAlert size={17} />
                </span>
                <p className="font-extrabold text-sm flex-1 truncate">{tr('tab_security')}</p>
                <button
                  onClick={() => setSecOpen(false)}
                  className="px-3 py-2 rounded-xl bg-soft border border-line text-[11px] font-extrabold text-mut hover:text-ink transition flex items-center gap-1.5 shrink-0"
                >
                  <X size={13} /> {tr('sec_close')}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar p-3.5">
                <SecurityTab token={token} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------ login + page */

export default function Admin() {
  const { isAdmin, adminToken, setAdminToken, toast, tr } = useApp();
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api.post<any>('/api/auth', { type: 'admin', password });
      setAdminToken(r.token);
      toast('success', 'Welcome back, Samir');
      hapticNotify('success');
    } catch (e: any) {
      setErr(e.message || 'Login failed');
      hapticNotify('error');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin || !adminToken) {
    return (
      <div className="max-w-sm mx-auto px-4 pt-12 md:pt-20">
        <motion.form
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={login}
          className="bg-card border border-line rounded-3xl p-6 shadow-xl"
        >
          <span className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center shadow-md">
            <Lock size={22} />
          </span>
          <h1 className="mt-4 text-center text-lg font-extrabold tracking-tight">{tr('login_title')}</h1>
          <p className="mt-1 text-center text-xs text-mut">{tr('login_sub')}</p>
          <div className="mt-5 space-y-3">
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tr('ph_password')}
                autoComplete="current-password"
                className={`${inputCls} pe-11`}
              />
              <button type="button" onClick={() => setShowPass((s) => !s)} className="absolute end-3 top-1/2 -translate-y-1/2 text-mut hover:text-ink transition" aria-label="Toggle password">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {err && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-red-500">
                <AlertTriangle size={13} /> {err}
              </p>
            )}
            <button type="submit" disabled={busy} className="w-full py-3.5 rounded-2xl tg-btn font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} />}
              {tr('unlock')}
            </button>
          </div>
        </motion.form>
      </div>
    );
  }

  return <Dashboard token={adminToken} />;
}
