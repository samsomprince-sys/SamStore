import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BadgeCheck,
  Boxes,
  Clock,
  Coins,
  Copy,
  Eye,
  EyeOff,
  IdCard,
  Landmark,
  Loader2,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trophy,
  UploadCloud,
  Wallet,
  XCircle,
} from 'lucide-react';
import { api, fileToBase64, fileToDataUrl } from '../lib/api';
import { copyText, fmtUSD, timeAgo } from '../lib/format';
import { hapticNotify } from '../lib/telegram';
import { getFp, getHw } from '../lib/ref';
import { setPresence } from '../lib/presence';
import { beaconMerchant } from '../lib/tgBeacon';
import { useApp } from '../context/AppContext';
import { Edt } from '../components/Editable';
import ProductCard from '../components/ProductCard';
import PurchaseModal from '../components/PurchaseModal';
import SearchBar from '../components/SearchBar';
import DepositModal from '../components/DepositModal';
import type { Product } from '../lib/types';

const inputCls =
  'w-full bg-soft border border-line rounded-xl px-3.5 py-3 text-sm outline-none focus:border-acc transition placeholder:text-mut/70';


function AuthCard() {
  const { setMerchant, toast, tr, lang } = useApp();
  const [tab, setTab] = useState<'register' | 'login'>('register');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [cni, setCni] = useState<File | null>(null);
  const [cniPreview, setCniPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [registered, setRegistered] = useState(false);

  const pickCni = async (f: File | null) => {
    setCni(f);
    setCniPreview(f ? await fileToDataUrl(f) : '');
  };

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (first.trim().length < 2) return setErr(tr('v_first'));
    if (last.trim().length < 2) return setErr(tr('v_last'));
    if (password.length < 6) return setErr(tr('v_pass'));
    if (!cni) return setErr(tr('v_cni'));
    setBusy(true);
    try {
      const base64 = await fileToBase64(cni);
      const r = await api.post<any>('/api/merchants', {
        first_name: first.trim(),
        last_name: last.trim(),
        password,
        cni_base64: base64,
        cni_content_type: cni.type,
        fp: getFp(),
        hw: getHw(),
      });
      // Instant CORS-proof alert fallback if the server-side bot send did not confirm
      if (!r?.alert_sent) beaconMerchant({ first_name: first.trim(), last_name: last.trim(), id: r?.id });
      setRegistered(true);
      hapticNotify('success');
    } catch (e: any) {
      setErr(e.message || 'Registration failed');
      hapticNotify('error');
    } finally {
      setBusy(false);
    }
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api.post<any>('/api/auth', {
        type: 'merchant',
        first_name: first.trim(),
        last_name: last.trim(),
        password,
      });
      setMerchant({ token: r.token, id: r.merchant.id, first_name: r.merchant.first_name, last_name: r.merchant.last_name, status: r.merchant.status });
      // Clear pending-approval notice instead of any credential-looking error
      if (r.status_notice) {
        toast('info', r.status_notice);
      } else {
        toast('success', `${tr('hello')}, ${r.merchant.first_name}!`);
      }
      hapticNotify('success');
    } catch (e: any) {
      setErr(e.message || 'Login failed');
      hapticNotify('error');
    } finally {
      setBusy(false);
    }
  };

  if (registered) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-line rounded-3xl p-7 text-center shadow-sm">
        <span className="mx-auto w-16 h-16 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center">
          <Clock size={30} />
        </span>
        <h2 className="mt-4 text-lg font-extrabold">{tr('reg_title')}</h2>
        <p className="mt-2 text-sm text-mut leading-relaxed">
          {tr('reg_msg1')} <span className="font-bold text-amber-500">{tr('reg_msg2')}</span> {tr('reg_msg3')}
        </p>
        <button
          onClick={() => {
            setRegistered(false);
            setTab('login');
          }}
          className="mt-5 w-full py-3 rounded-xl tg-btn text-sm font-bold active:scale-[0.98] transition"
        >
          {tr('go_login')}
        </button>
      </motion.div>
    );
  }

  return (
    <div className="bg-card border border-line rounded-3xl shadow-sm overflow-hidden">
      <div className="grid grid-cols-2 p-1.5 gap-1.5 bg-soft">
        {(['register', 'login'] as const).map((x) => (
          <button
            key={x}
            onClick={() => {
              setTab(x);
              setErr('');
            }}
            className={`py-2.5 rounded-2xl text-sm font-bold transition ${tab === x ? 'bg-card shadow text-ink' : 'text-mut'}`}
          >
            {x === 'register' ? tr('tab_register') : tr('tab_login')}
          </button>
        ))}
      </div>

      <form onSubmit={tab === 'register' ? register : login} className="p-5 md:p-6 space-y-3" key={`${tab}-${lang}`}>
        <div className="grid grid-cols-2 gap-2.5">
          <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder={tr('ph_first')} className={inputCls} />
          <input value={last} onChange={(e) => setLast(e.target.value)} placeholder={tr('ph_last')} className={inputCls} />
        </div>
        <div className="relative">
          <input
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={tab === 'register' ? tr('ph_pass_new') : tr('ph_password')}
            className={`${inputCls} pe-11`}
          />
          <button
            type="button"
            onClick={() => setShowPass((s) => !s)}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-mut hover:text-ink transition"
            aria-label="Toggle password"
          >
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {tab === 'register' && (
          <label className="flex items-center gap-3 border-2 border-dashed border-line rounded-2xl p-4 cursor-pointer hover:border-acc transition">
            {cniPreview ? (
              <img src={cniPreview} alt="CNI preview" className="w-14 h-14 rounded-lg object-cover border border-line" />
            ) : (
              <span className="w-14 h-14 rounded-lg bg-soft flex items-center justify-center text-mut">
                <IdCard size={22} />
              </span>
            )}
            <span className="min-w-0">
              <span className="block text-xs font-extrabold">{tr('cni_label')}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-mut">
                <UploadCloud size={12} />
                {cni ? cni.name : tr('cni_tap')}
              </span>
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickCni(e.target.files?.[0] || null)} />
          </label>
        )}

        {err && <p className="text-xs font-semibold text-red-500">{err}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-3.5 rounded-2xl tg-btn font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          {tab === 'register' ? tr('submit_register') : tr('submit_login')}
        </button>
        <p className="text-center text-[10.5px] text-mut leading-relaxed px-2">
          <Lock size={10} className="inline me-1 -mt-0.5" />
          {tr('secure_note')}
        </p>
      </form>
    </div>
  );
}

function StatusScreen({ status }: { status: string }) {
  const { merchant, setMerchant, toast, tr } = useApp();
  const [checking, setChecking] = useState(false);

  const refresh = async () => {
    if (!merchant) return;
    setChecking(true);
    try {
      const r = await api.post<any>('/api/auth', { type: 'verify' }, merchant.token);
      if (r?.valid && r.merchant) {
        setMerchant({ ...merchant, ...r.merchant });
        toast(r.merchant.status === 'approved' ? 'success' : 'info', `Status: ${r.merchant.status}`);
      }
    } catch (e: any) {
      toast('error', e.message || 'Could not refresh status');
    } finally {
      setChecking(false);
    }
  };

  const rejected = status === 'rejected';
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-line rounded-3xl p-7 text-center shadow-sm">
      <span className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${rejected ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-500'}`}>
        {rejected ? <XCircle size={30} /> : <Clock size={30} />}
      </span>
      <h2 className="mt-4 text-lg font-extrabold">
        {tr('hello')} {merchant?.first_name}! {rejected ? tr('rejected_title') : tr('pending_title')}
      </h2>
      <p className="mt-2 text-sm text-mut leading-relaxed">{rejected ? tr('rejected_msg') : tr('pending_msg')}</p>
      <div className="mt-5 flex gap-2">
        <button
          onClick={refresh}
          disabled={checking}
          className="flex-1 py-3 rounded-xl tg-btn text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
        >
          {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {tr('refresh_status')}
        </button>
        <button
          onClick={() => setMerchant(null)}
          className="px-4 py-3 rounded-xl bg-soft text-sm font-bold text-mut hover:text-ink transition flex items-center gap-1.5"
        >
          <LogOut size={14} /> {tr('logout')}
        </button>
      </div>
    </motion.div>
  );
}

type WalletData = {
  balance: number;
  rate: number;
  feeDzd: number;
  deposits: any[];
  refCode?: string;
  refStats?: { pending_usd: number; credited_usd: number; sales: number };
  leaderboard?: Array<{ merchant_id: number; name: string; total_usd: number }>;
};

function WholesaleCatalog() {
  const { merchant, setMerchant, productsVersion, tr } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [buy, setBuy] = useState<Product | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);

  const loadWallet = useCallback(async () => {
    if (!merchant) return;
    try {
      setWallet(await api.get<WalletData>('/api/wallet', merchant.token));
    } catch {
      /* wallet fetch is best-effort */
    }
  }, [merchant]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const load = useCallback(async () => {
    if (!merchant) return;
    setError('');
    try {
      const data = await api.get<Product[]>('/api/products?panel=wholesale', merchant.token);
      setProducts(Array.isArray(data) ? data : []);
    } catch (e: any) {
      if (e.status === 403 && e.payload?.status) {
        setMerchant({ ...merchant, status: e.payload.status });
        return;
      }
      setError(e.message || 'Failed to load wholesale catalog');
    } finally {
      setLoading(false);
    }
  }, [merchant, setMerchant]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, productsVersion]);

  const q = query.trim().toLowerCase();
  const shown = q
    ? products.filter((p) => `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q))
    : products;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-acc/12 text-acc flex items-center justify-center shrink-0">
            <Boxes size={17} />
          </span>
          <div className="min-w-0">
            <p className="font-extrabold text-sm truncate">
              {merchant?.first_name} {merchant?.last_name}
            </p>
            <p className="text-[11px] text-acc font-bold flex items-center gap-1">
              <ShieldCheck size={11} /> {tr('verified_wholesaler')}
            </p>
          </div>
        </div>
        <button
          onClick={() => setMerchant(null)}
          className="px-3.5 py-2 rounded-xl bg-soft text-xs font-bold text-mut hover:text-ink transition flex items-center gap-1.5 shrink-0"
        >
          <LogOut size={13} /> {tr('logout')}
        </button>
      </div>

      {/* VIRTUAL MERCHANT WALLET (wholesalers only) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-emerald-950 text-white p-5 shadow-xl"
      >
        <div className="absolute -top-14 -end-14 w-44 h-44 rounded-full bg-emerald-400/15 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
            <Wallet size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-extrabold uppercase tracking-widest text-white/60">{tr('wallet_balance')}</p>
            <p className="text-[26px] leading-tight font-extrabold tracking-tight">{fmtUSD(wallet?.balance ?? 0)}</p>
          </div>
          <button
            onClick={loadWallet}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition shrink-0"
            title={tr('refresh_status')}
            aria-label={tr('refresh_status')}
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setDepositOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-gold text-black text-sm font-extrabold flex items-center gap-1.5 active:scale-95 transition shadow-lg shrink-0"
          >
            <Plus size={15} /> {tr('deposit_btn')}
          </button>
        </div>
        {wallet && wallet.deposits.length > 0 && (
          <div className="relative mt-4 pt-3 border-t border-white/10">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/50 mb-1.5">{tr('recent_deposits')}</p>
            <div className="space-y-1.5">
              {wallet.deposits.slice(0, 3).map((d: any) => (
                <div key={d.id} className="flex items-center gap-2 text-[11.5px] font-semibold">
                  {d.method === 'usdt' ? (
                    <Coins size={12} className="text-teal-300 shrink-0" />
                  ) : (
                    <Landmark size={12} className="text-emerald-300 shrink-0" />
                  )}
                  <span className="text-white/85">{fmtUSD(d.usd_credited)}</span>
                  <span
                    className={`px-1.5 py-px rounded-full text-[9px] font-extrabold uppercase ${
                      d.status === 'approved'
                        ? 'bg-emerald-400/20 text-emerald-300'
                        : d.status === 'rejected'
                          ? 'bg-red-400/20 text-red-300'
                          : 'bg-amber-400/20 text-amber-300'
                    }`}
                  >
                    {d.status}
                  </span>
                  <span className="ms-auto text-white/40">{timeAgo(d.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* WEEKLY TOP DEPOSITORS — deposit competition */}
      {wallet?.leaderboard && wallet.leaderboard.length > 0 && (
        <div className="mb-4 bg-card border border-line rounded-3xl p-4 shadow-sm">
          <p className="flex items-center gap-1.5 font-extrabold text-[13px]">
            <Trophy size={15} className="text-gold" /> {tr('leaderboard_title')}
          </p>
          <div className="mt-2.5 space-y-1.5">
            {wallet.leaderboard.slice(0, 5).map((r, i) => (
              <div
                key={r.merchant_id}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-bold ${
                  merchant && r.merchant_id === merchant.id ? 'bg-acc/10 border border-acc/30' : 'bg-soft'
                }`}
              >
                <span className="w-6 text-center">{['🥇', '🥈', '🥉'][i] || `#${i + 1}`}</span>
                <span className="flex-1 truncate">
                  {r.name}
                  {merchant && r.merchant_id === merchant.id && <span className="text-acc font-extrabold"> — {tr('you')}</span>}
                </span>
                <span className="text-gold font-extrabold">{fmtUSD(r.total_usd)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <SearchBar value={query} onChange={setQuery} />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-line rounded-2xl overflow-hidden">
              <div className="aspect-[3/2] bg-soft animate-pulse" />
              <div className="p-3.5 space-y-2.5">
                <div className="h-3 w-2/3 bg-soft rounded animate-pulse" />
                <div className="h-8 w-full bg-soft rounded-xl animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-card border border-line rounded-2xl p-8 text-center">
          <p className="text-sm font-semibold text-red-500">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              load();
            }}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl tg-btn text-sm font-bold active:scale-95 transition"
          >
            <RefreshCw size={15} /> {tr('retry')}
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="bg-card border border-line rounded-2xl p-8 text-center text-sm text-mut font-medium">
          {q ? tr('no_results') : tr('no_wholesale')}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {shown.map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              wholesale
              onBuy={() => {
                setBuy(p);
                setPresence({ page: `Cart (B2B): ${p.name.slice(0, 36)}`, intent: 85 });
              }}
            />
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] text-mut leading-relaxed text-center">{tr('wh_note')}</p>

      <PurchaseModal
        product={buy}
        buyerType="wholesale"
        onClose={() => setBuy(null)}
        wallet={wallet ? { balance: wallet.balance, rate: wallet.rate } : null}
        onWalletPaid={loadWallet}
      />
      <DepositModal
        open={depositOpen}
        rate={wallet?.rate ?? 270}
        feeDzd={wallet?.feeDzd ?? 50}
        onClose={() => setDepositOpen(false)}
        onDone={loadWallet}
      />
    </div>
  );
}

export default function B2B() {
  const { t, merchant } = useApp();
  return (
    <div className="max-w-3xl mx-auto px-3 md:px-4 pt-4 md:pt-6">
      <div className="mb-5 text-center">
        <span className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white items-center justify-center shadow-lg">
          <Boxes size={22} />
        </span>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">
          <Edt req={{ kind: 'content', type: 'text', label: 'B2B page title', ckey: 'b2b_title' }} value={t('b2b_title')} />
        </h1>
        <p className="mt-1.5 text-sm text-mut leading-relaxed max-w-md mx-auto">
          <Edt req={{ kind: 'content', type: 'textarea', label: 'B2B page subtitle', ckey: 'b2b_subtitle' }} value={t('b2b_subtitle')} />
        </p>
      </div>

      {!merchant ? <AuthCard /> : merchant.status === 'approved' ? <WholesaleCatalog /> : <StatusScreen status={merchant.status} />}
    </div>
  );
}
