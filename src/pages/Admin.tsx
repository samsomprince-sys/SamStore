import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BadgeCheck,
  BellRing,
  Boxes,
  Check,
  Clock,
  Eye,
  EyeOff,
  FileText,
  ImageIcon,
  Landmark,
  Coins,
  Loader2,
  Lock,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import { api, fileToBase64, fileToDataUrl } from '../lib/api';
import { fmtDZD, timeAgo } from '../lib/format';
import { hapticNotify, openTelegramLink, tgPopup } from '../lib/telegram';
import { beaconProductDeleted, beaconProductNew, beaconProductUpdated, beaconStatusChange } from '../lib/tgBeacon';
import { useApp } from '../context/AppContext';
import type { Merchant, Order, Product } from '../lib/types';

const inputCls =
  'w-full bg-soft border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-acc transition placeholder:text-mut/70';

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-500/12 text-amber-500',
  reviewing: 'bg-blue-500/12 text-blue-500',
  delivered: 'bg-emerald-500/12 text-emerald-500',
  cancelled: 'bg-red-500/12 text-red-500',
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

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-line rounded-2xl p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-extrabold text-sm">#{o.id}</span>
        <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-wide ${STATUS_STYLE[o.status] || 'bg-soft text-mut'}`}>
          {o.status}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-wide flex items-center gap-1 ${
            o.payment_method === 'usdt' ? 'bg-teal-500/12 text-teal-500' : 'bg-emerald-600/12 text-emerald-600'
          }`}
        >
          {o.payment_method === 'usdt' ? <Coins size={11} /> : <Landmark size={11} />}
          {o.payment_method === 'usdt' ? 'USDT' : 'Baridimob'}
        </span>
        {o.buyer_type === 'wholesale' && (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-wide bg-violet-500/12 text-violet-500 flex items-center gap-1">
            <Boxes size={11} /> B2B
          </span>
        )}
        <span className="ms-auto text-[11px] text-mut font-semibold flex items-center gap-1">
          <Clock size={11} /> {timeAgo(o.created_at)}
        </span>
      </div>

      <div className="mt-3 grid sm:grid-cols-2 gap-3">
        <div className="bg-soft rounded-xl p-3 text-sm">
          <p className="font-bold truncate">{o.product_name}</p>
          <p className="text-mut text-xs mt-0.5">
            {o.quantity} × {fmtDZD(o.unit_price)}
          </p>
          <p className="mt-1.5 font-extrabold text-gold">{fmtDZD(o.total_dzd)}</p>
        </div>
        <div className="bg-soft rounded-xl p-3 text-sm">
          <p className="font-bold truncate">{o.buyer_name}</p>
          <button
            onClick={() => openTelegramLink(`https://t.me/${o.buyer_telegram}`)}
            className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#229ED9]/15 text-[#229ED9] text-xs font-extrabold active:scale-95 transition"
          >
            <Send size={12} /> @{o.buyer_telegram}
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        {o.receipt_url ? (
          <a href={o.receipt_url} target="_blank" rel="noreferrer" className="shrink-0">
            <img src={o.receipt_url} alt="receipt" className="w-14 h-14 rounded-lg object-cover border border-line hover:opacity-80 transition" />
          </a>
        ) : (
          <span className="w-14 h-14 rounded-lg bg-soft flex items-center justify-center text-mut shrink-0" title="No receipt (USDT notify flow)">
            <FileText size={18} />
          </span>
        )}
        <select
          value={o.status}
          disabled={busy}
          onChange={(e) => setStatus(e.target.value)}
          className="flex-1 bg-soft border border-line rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-acc transition"
        >
          <option value="pending">{tr('os_pending')}</option>
          <option value="reviewing">{tr('os_reviewing')}</option>
          <option value="delivered">{tr('os_delivered')}</option>
          <option value="cancelled">{tr('os_cancelled')}</option>
        </select>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={tr('notes_ph')}
          className={`${inputCls} flex-1`}
        />
        <button
          onClick={saveNotes}
          disabled={busy}
          className="px-4 rounded-xl tg-btn text-xs font-extrabold disabled:opacity-50 active:scale-95 transition"
        >
          {tr('save')}
        </button>
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
        {['all', 'pending', 'reviewing', 'delivered', 'cancelled'].map((s) => (
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
  );
}

/* ------------------------------------------------ products */

function ProductRow({ p, token, onReload }: { p: Product; token: string; onReload: () => void }) {
  const { toast, bumpProducts, tr } = useApp();
  const [d, setD] = useState({ name: p.name, price: String(p.price_dzd), stock: String(p.stock), min_qty: String(p.min_qty), category: p.category, panel: p.panel, description: p.description, active: p.active });
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
          <p className="text-[11px] text-mut font-semibold">{tr('tip_super_edit')}</p>
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

function ContentTab() {
  const { contentLoaded, content, tr } = useApp();
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
      <p className="text-[11px] text-mut font-semibold leading-relaxed">{tr('content_hint')}</p>
      {CONTENT_CONFIG.map((cfg) => (
        <ContentRow key={cfg.key} cfg={cfg} />
      ))}
      {extras.map((k) => (
        <ContentRow key={k} cfg={{ key: k, label: k, textarea: (content[k] || '').length > 60 }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------ database reset (danger zone) */

function ResetZone({ token }: { token: string }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const doReset = async () => {
    if (!pw) return setErr('كلمة السر مطلوبة للتأكيد / Password required');
    setBusy(true);
    setErr('');
    try {
      const r = await api.post<any>('/api/reset', { password: pw }, token);
      toast(
        'success',
        `تم تصفير قاعدة البيانات — Orders: ${r.orders_deleted}, Merchants: ${r.merchants_deleted}, Stock → 0`
      );
      hapticNotify('success');
      setOpen(false);
      setPw('');
      // Full refresh so every tab/stat reflects the clean database
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      setErr(e.message || 'Reset failed');
      hapticNotify('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 mb-2 bg-red-500/5 border-2 border-red-500/30 rounded-3xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-red-500/12 text-red-500 flex items-center justify-center shrink-0">
          <AlertTriangle size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-sm text-red-500">تصفير وتطهير قاعدة البيانات — Reset All Data</p>
          <p className="text-[11px] text-mut leading-snug mt-0.5">
            يحذف جميع الطلبات (المعلقة والمقبولة) وحسابات التجار التجريبية وصور CNI، ويعيد المخزون إلى الصفر — لفصل بيانات التجربة عن طلبات الزبائن الحقيقية.
          </p>
        </div>
        <button
          onClick={() => {
            setOpen(true);
            setErr('');
            setPw('');
          }}
          className="px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-extrabold flex items-center gap-1.5 active:scale-95 transition shrink-0"
        >
          <Trash2 size={13} />
          Reset All Data
        </button>
      </div>

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
              onClick={(e) => e.stopPropagation()}
              className="w-[min(94vw,420px)] bg-card border-2 border-red-500/40 rounded-3xl p-5 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-2xl bg-red-500/12 text-red-500 flex items-center justify-center shrink-0">
                  <AlertTriangle size={22} />
                </span>
                <div>
                  <h3 className="font-extrabold text-base text-red-500 leading-tight">تأكيد تصفير قاعدة البيانات</h3>
                  <p className="text-[11px] text-mut font-semibold">FINAL DATABASE WIPE — هذا الإجراء لا يمكن التراجع عنه</p>
                </div>
                <button
                  onClick={() => !busy && setOpen(false)}
                  className="ms-auto p-2 rounded-full bg-soft text-mut hover:text-ink transition shrink-0"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4 bg-red-500/8 border border-red-500/25 rounded-2xl p-3.5 text-[12px] leading-relaxed font-semibold space-y-1">
                <p>🗑 حذف جميع الطلبات (معلقة / قيد المراجعة / مسلّمة / ملغاة)</p>
                <p>👥 حذف جميع حسابات التجار وصور بطاقات CNI</p>
                <p>📦 إعادة مخزون جميع المنتجات إلى 0</p>
              </div>

              <label className="block mt-4 text-[11px] font-extrabold text-mut uppercase tracking-wide">
                أعد كتابة كلمة سر الأدمن للتأكيد / Re-type admin password
              </label>
              <div className="relative mt-1.5">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="Samirsami9@"
                  autoComplete="off"
                  className={`${inputCls} pe-11 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-mut hover:text-ink transition"
                  aria-label="Toggle password"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {err && (
                <p className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-red-500">
                  <AlertTriangle size={13} /> {err}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="flex-1 py-3 rounded-xl bg-soft text-sm font-bold text-mut hover:text-ink transition disabled:opacity-50"
                >
                  إلغاء / Cancel
                </button>
                <button
                  onClick={doReset}
                  disabled={busy || !pw}
                  className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
                  تأكيد الحذف النهائي
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
  const [tab, setTab] = useState<'orders' | 'merchants' | 'products' | 'content'>('orders');
  const [stats, setStats] = useState({ pending: 0, revenue: 0, merchants: 0, products: 0 });
  const { editMode, setEditMode, setAdminToken, tr } = useApp();

  const loadStats = useCallback(async () => {
    const [o, m, p] = await Promise.allSettled([
      api.get<Order[]>('/api/orders', token),
      api.get<Merchant[]>('/api/merchants', token),
      api.get<Product[]>('/api/products?panel=all', token),
    ]);
    const orders = o.status === 'fulfilled' ? o.value : [];
    const merchants = m.status === 'fulfilled' ? m.value : [];
    const products = p.status === 'fulfilled' ? p.value : [];
    setStats({
      pending: orders.filter((x) => x.status === 'pending').length,
      revenue: orders.filter((x) => x.status === 'delivered').reduce((s, x) => s + Number(x.total_dzd || 0), 0),
      merchants: merchants.filter((x) => x.status === 'pending').length,
      products: products.length,
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
  ];

  const tabs = [
    { id: 'orders' as const, label: tr('tab_orders'), icon: ShoppingBag },
    { id: 'merchants' as const, label: tr('tab_merchants'), icon: Users },
    { id: 'products' as const, label: tr('tab_products'), icon: Package },
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

      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {cards.map((c) => (
          <button key={c.label} onClick={() => setTab(c.tab)} className={`bg-card border rounded-2xl p-4 text-start shadow-sm transition active:scale-[0.98] ${c.accent ? 'border-gold/60' : 'border-line'}`}>
            <c.icon size={17} className={c.accent ? 'text-gold' : 'text-acc'} />
            <p className="mt-2 text-lg font-extrabold tracking-tight truncate">{c.value}</p>
            <p className="text-[10.5px] text-mut font-bold uppercase tracking-wide">{c.label}</p>
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
        {tab === 'merchants' && <MerchantsTab token={token} />}
        {tab === 'products' && <ProductsTab token={token} />}
        {tab === 'content' && <ContentTab />}
      </div>

      <ResetZone token={token} />
    </div>
  );
}

/* ------------------------------------------------ login + page */

export default function Admin() {
  const { isAdmin, adminToken, setAdminToken, toast, tr } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api.post<any>('/api/auth', { type: 'admin', username: username.trim(), password });
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
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={tr('ph_username')} autoComplete="username" className={inputCls} />
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
