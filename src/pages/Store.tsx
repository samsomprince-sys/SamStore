import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BadgeCheck,
  Check,
  ChevronRight,
  Coins,
  Copy,
  Landmark,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Timer,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { copyText } from '../lib/format';
import { useApp } from '../context/AppContext';
import { Edt } from '../components/Editable';
import ProductCard from '../components/ProductCard';
import PurchaseModal from '../components/PurchaseModal';
import SearchBar from '../components/SearchBar';
import DepositModal from '../components/DepositModal';
import CustomerAuthModal from '../components/CustomerAuth';
import ChallengeCard from '../components/ChallengeCard';
import { fmtUSD } from '../lib/format';
import { bumpBrowseIntent, setPresence } from '../lib/presence';
import type { Product } from '../lib/types';

function FlashChip({ pct, endsAt }: { pct: number; endsAt: string }) {
  const { tr } = useApp();
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((Date.parse(endsAt) - Date.now()) / 1000)));
  useEffect(() => {
    const iv = window.setInterval(() => setLeft(Math.max(0, Math.floor((Date.parse(endsAt) - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(iv);
  }, [endsAt]);
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mt-4 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white px-4 py-2.5 shadow-lg"
    >
      <Timer size={16} className="animate-pulse" />
      <span className="text-xs font-extrabold">{tr('flash_live')} −{pct}%</span>
      <span className="ms-auto text-[11px] font-bold font-mono bg-black/20 rounded-lg px-2 py-1">
        {tr('flash_ends_in')} {mm}:{ss}
      </span>
    </motion.div>
  );
}

function CopyValue({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="bg-soft rounded-2xl p-3 flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold text-mut uppercase tracking-wider">{label}</p>
        <p className={`text-sm font-bold break-all ${mono ? 'font-mono tracking-wide' : ''}`}>{value}</p>
      </div>
      <button
        onClick={async () => {
          await copyText(value);
          setOk(true);
          window.setTimeout(() => setOk(false), 1500);
        }}
        className="shrink-0 p-2 rounded-lg bg-acc/10 text-acc hover:bg-acc/20 transition"
        aria-label="Copy"
      >
        {ok ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

export default function Store() {
  const { t, content, productsVersion, catFilter, setCatFilter, setStoreCategories, tr } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const cat = catFilter;
  const [query, setQuery] = useState('');
  const [buy, setBuy] = useState<Product | null>(null);
  const [flash, setFlash] = useState<{ active: boolean; pct: number; ends_at: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    const go = () =>
      api
        .get('/api/flash')
        .then((d) => live && setFlash(d))
        .catch(() => {});
    go();
    const iv = window.setInterval(go, 30000);
    return () => {
      live = false;
      window.clearInterval(iv);
    };
  }, []);
  const flashPct = flash && flash.active ? flash.pct : 0;

  // Retail customer session + virtual USD wallet (same engine as merchants)
  const { customer, setCustomer } = useApp();
  const [custWallet, setCustWallet] = useState<{ balance: number; rate: number; feeDzd: number } | null>(null);
  const [depOpen, setDepOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);

  const loadCustWallet = useCallback(async () => {
    if (!customer) {
      setCustWallet(null);
      return;
    }
    try {
      const d = await api.get<any>('/api/wallet', customer.token);
      setCustWallet({ balance: Number(d.balance || 0), rate: Number(d.rate) || 270, feeDzd: Number(d.feeDzd) || 50 });
    } catch {
      /* keep last known balance */
    }
  }, [customer]);

  useEffect(() => {
    loadCustWallet();
  }, [loadCustWallet]);

  // Buying-intent signals: searching / filtering = 50%, idle browsing ramps 10%→20%→30%
  useEffect(() => {
    const q = query.trim();
    if (q) setPresence({ page: `Searching: "${q.slice(0, 40)}"`, intent: 50 });
    else if (cat !== 'All') setPresence({ page: `Category: ${cat}`, intent: 50 });
  }, [query, cat]);

  useEffect(() => {
    const t1 = window.setTimeout(() => bumpBrowseIntent(20), 20000);
    const t2 = window.setTimeout(() => bumpBrowseIntent(30), 50000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  const load = async () => {
    setError('');
    try {
      const data = await api.get<Product[]>('/api/products?panel=retail');
      setProducts(Array.isArray(data) ? data : []);
      if (data.length === 0) setCatFilter('All');
    } catch (e: any) {
      setError(e.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsVersion]);

  const cats = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.category)))], [products]);

  useEffect(() => {
    setStoreCategories(cats);
  }, [cats, setStoreCategories]);

  const q = query.trim().toLowerCase();
  const byQuery = q
    ? products.filter((p) => `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q))
    : products;
  const shown = cat === 'All' ? byQuery : byQuery.filter((p) => p.category === cat);

  const FEATURES = [
    { icon: ShieldCheck, t: 'feature_1_title', d: 'feature_1_text' },
    { icon: Coins, t: 'feature_2_title', d: 'feature_2_text' },
    { icon: Users, t: 'feature_3_title', d: 'feature_3_text' },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      {/* SEARCH */}
      <div className="px-3 md:px-4 pt-3 md:pt-4">
        <SearchBar value={query} onChange={setQuery} />
      </div>

      {/* RETAIL WALLET (logged-in) / LOGIN PROMPT (guests) */}
      <div className="px-3 md:px-4 pt-3">
        {!customer ? (
          <button
            onClick={() => setAuthOpen(true)}
            className="w-full flex items-center gap-3 bg-card border border-line rounded-2xl p-3.5 shadow-sm hover:border-acc transition text-start active:scale-[0.99]"
          >
            <span className="w-10 h-10 rounded-xl bg-acc/10 text-acc flex items-center justify-center shrink-0">
              <UserRound size={18} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-extrabold">{tr('guest_prompt_title')}</span>
              <span className="block text-[10.5px] text-mut font-semibold mt-0.5">{tr('cust_login_title')}</span>
            </span>
            <span className="px-3.5 py-2 rounded-xl tg-btn text-[11px] font-extrabold shrink-0">{tr('guest_prompt_btn')}</span>
          </button>
        ) : (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-emerald-950 text-white p-4 shadow-xl">
            <div className="absolute -top-12 -end-12 w-36 h-36 rounded-full bg-emerald-400/15 blur-3xl pointer-events-none" />
            <div className="relative flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                <Wallet size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/60">
                  {tr('my_wallet')} — {customer.name} <span className="text-white/40">@{customer.username}</span>
                </p>
                <p className="text-xl leading-tight font-extrabold tracking-tight">{custWallet ? fmtUSD(custWallet.balance) : '…'}</p>
              </div>
              <button
                onClick={async () => {
                  setWalletBusy(true);
                  await loadCustWallet();
                  setWalletBusy(false);
                }}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition shrink-0"
                aria-label={tr('refresh_status')}
                title={tr('refresh_status')}
              >
                {walletBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              </button>
              <button
                onClick={() => setDepOpen(true)}
                className="px-4 py-2.5 rounded-2xl bg-gold text-black text-[13px] font-extrabold flex items-center gap-1.5 active:scale-95 transition shadow-lg shrink-0"
              >
                <Plus size={14} /> {tr('deposit_btn')}
              </button>
              <button
                onClick={() => setCustomer(null)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition shrink-0"
                aria-label={tr('logout')}
                title={tr('logout')}
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FREE PRODUCT CHALLENGE (logged-in retail buyers) */}
      {customer && (
        <div className="px-3 md:px-4 pt-3">
          <ChallengeCard token={customer.token} />
        </div>
      )}

      {/* HERO */}
      <section className="mx-3 md:mx-4 mt-3 md:mt-4 relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white shadow-xl">
        <div className="absolute -top-20 -start-20 w-64 h-64 rounded-full bg-emerald-400/25 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -end-10 w-72 h-72 rounded-full bg-teal-300/20 blur-3xl pointer-events-none" />
        <div className="relative px-5 py-9 md:px-10 md:py-14 md:max-w-[62%]">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[11px] font-bold backdrop-blur">
            <BadgeCheck size={13} className="text-emerald-300" />
            <Edt req={{ kind: 'content', type: 'text', label: 'Hero badge', ckey: 'hero_badge' }} value={t('hero_badge')} />
          </span>
          <h1 className="mt-4 text-[26px] md:text-4xl font-extrabold leading-[1.15] tracking-tight">
            <Edt req={{ kind: 'content', type: 'textarea', label: 'Hero title', ckey: 'hero_title' }} value={t('hero_title')} />
          </h1>
          <p className="mt-3 text-sm md:text-[15px] text-white/80 leading-relaxed">
            <Edt req={{ kind: 'content', type: 'textarea', label: 'Hero subtitle', ckey: 'hero_subtitle' }} value={t('hero_subtitle')} />
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <a
              href="#shop"
              className="px-5 py-3 rounded-2xl bg-white text-emerald-700 text-sm font-extrabold flex items-center gap-1.5 shadow-lg active:scale-95 transition"
            >
              <Edt req={{ kind: 'content', type: 'text', label: 'Hero button text', ckey: 'hero_cta' }} value={t('hero_cta', 'Browse products')} />
              <ChevronRight size={15} className="rtl:-scale-x-100" />
            </a>
            <Link
              to="/b2b"
              className="px-5 py-3 rounded-2xl bg-white/12 border border-white/25 text-sm font-bold backdrop-blur active:scale-95 transition"
            >
              {tr('nav_wholesale')}
            </Link>
          </div>
        </div>
        <div className="absolute end-6 top-1/2 -translate-y-1/2 hidden md:flex flex-col gap-4 pointer-events-none">
          {products.slice(0, 3).map((p, i) => (
            <motion.img
              key={p.id}
              src={p.image_url}
              alt={p.name}
              animate={{ y: [0, -9, 0] }}
              transition={{ duration: 3.6 + i, repeat: Infinity, ease: 'easeInOut' }}
              className={`w-40 h-[104px] object-cover rounded-2xl shadow-2xl border border-white/25 ${i === 1 ? 'ms-12' : ''}`}
            />
          ))}
        </div>
      </section>

      {/* STATS */}
      <section className="mx-3 md:mx-4 mt-4 grid grid-cols-3 gap-2.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card border border-line rounded-2xl px-3 py-3.5 text-center shadow-sm">
            <p className="text-lg md:text-xl font-extrabold text-acc">
              <Edt
                req={{ kind: 'content', type: 'text', label: `Stat ${i} value`, ckey: `stat_${i}_value` }}
                value={t(`stat_${i}_value`)}
              />
            </p>
            <p className="text-[10.5px] md:text-xs text-mut font-semibold mt-0.5 leading-tight">
              <Edt
                req={{ kind: 'content', type: 'text', label: `Stat ${i} label`, ckey: `stat_${i}_label` }}
                value={t(`stat_${i}_label`)}
              />
            </p>
          </div>
        ))}
      </section>

      {/* SHOP */}
      <section id="shop" className="px-3 md:px-4 mt-8 scroll-mt-20">
        {flashPct > 0 && flash?.ends_at && <FlashChip pct={flashPct} endsAt={flash.ends_at} />}

        <div className="flex items-end justify-between gap-3 mt-3">
          <div>
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">
              <Edt req={{ kind: 'content', type: 'text', label: 'Shop section title', ckey: 'shop_title' }} value={t('shop_title')} />
            </h2>
            <p className="text-xs md:text-sm text-mut mt-1 font-medium">
              <Edt req={{ kind: 'content', type: 'text', label: 'Shop section subtitle', ckey: 'shop_subtitle' }} value={t('shop_subtitle')} />
            </p>
          </div>
          <Timer size={20} className="text-mut shrink-0 hidden sm:block" />
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 md:mx-0 md:px-0 pb-1">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold border transition active:scale-95 ${
                cat === c ? 'bg-acc text-white border-transparent shadow-md' : 'bg-card border-line text-mut hover:text-ink'
              }`}
            >
              {c === 'All' ? tr('cat_all') : c}
            </button>
          ))}
        </div>

        {q && (
          <p className="mt-3 text-xs text-mut font-semibold">
            {shown.length} {tr('search_results_for')} &laquo;{query.trim()}&raquo;
          </p>
        )}

        {loading ? (
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-card border border-line rounded-2xl overflow-hidden">
                <div className="aspect-[3/2] bg-soft animate-pulse" />
                <div className="p-3.5 space-y-2.5">
                  <div className="h-3 w-2/3 bg-soft rounded animate-pulse" />
                  <div className="h-3 w-full bg-soft rounded animate-pulse" />
                  <div className="h-8 w-full bg-soft rounded-xl animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="mt-4 bg-card border border-line rounded-2xl p-8 text-center">
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
          <div className="mt-4 bg-card border border-line rounded-2xl p-8 text-center text-sm text-mut font-medium">
            {q ? tr('no_results') : tr('empty_category')}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {shown.map((p) => (
              <ProductCard
                key={p.id}
                p={p}
                onBuy={() => {
                  setBuy(p);
                  setPresence({ page: `Cart: ${p.name.slice(0, 40)}`, intent: 85 });
                }}
                discountPct={flashPct}
              />
            ))}
          </div>
        )}
      </section>

      {/* FEATURES */}
      {content.show_features !== '0' && (
        <section className="px-3 md:px-4 mt-10">
          <div className="grid sm:grid-cols-3 gap-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ delay: i * 0.08 }}
                className="bg-card border border-line rounded-2xl p-5 shadow-sm"
              >
                <span className="w-10 h-10 rounded-xl bg-acc/10 text-acc flex items-center justify-center">
                  <f.icon size={19} />
                </span>
                <h3 className="mt-3 font-bold text-[15px]">
                  <Edt req={{ kind: 'content', type: 'text', label: `Feature ${i + 1} title`, ckey: f.t }} value={t(f.t)} />
                </h3>
                <p className="mt-1.5 text-xs text-mut leading-relaxed">
                  <Edt req={{ kind: 'content', type: 'textarea', label: `Feature ${i + 1} text`, ckey: f.d }} value={t(f.d)} />
                </p>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* PAYMENTS */}
      {content.show_payments !== '0' && (
        <section className="px-3 md:px-4 mt-10">
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">
            <Edt req={{ kind: 'content', type: 'text', label: 'Payments section title', ckey: 'payments_title' }} value={t('payments_title')} />
          </h2>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              className="bg-card border border-line rounded-2xl p-5 shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-xl bg-emerald-500/12 text-emerald-600 flex items-center justify-center">
                  <Landmark size={19} />
                </span>
                <div>
                  <p className="font-extrabold text-sm">Baridimob</p>
                  <p className="text-[11px] text-mut">{tr('baridimob_desc')} + {tr('upload_receipt')}</p>
                </div>
              </div>
              <div className="mt-3">
                <CopyValue label="RIP — Baridimob" value={t('baridimob_rip', '00799999002478845197')} />
                {t('baridimob_rip') && (
                  <div className="hidden">
                    <Edt
                      req={{ kind: 'content', type: 'text', label: 'Baridimob RIP', ckey: 'baridimob_rip' }}
                      value={t('baridimob_rip')}
                    />
                  </div>
                )}
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: 0.08 }}
              className="bg-card border border-line rounded-2xl p-5 shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-xl bg-teal-500/12 text-teal-600 flex items-center justify-center">
                  <Coins size={19} />
                </span>
                <div>
                  <p className="font-extrabold text-sm">USDT — TRC20</p>
                  <p className="text-[11px] text-mut">{tr('usdt_desc')}</p>
                </div>
              </div>
              <div className="mt-3">
                <CopyValue label={tr('usdt_label')} value={t('usdt_trc20', 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE')} />
                {t('usdt_trc20') && (
                  <div className="hidden">
                    <Edt
                      req={{ kind: 'content', type: 'text', label: 'USDT TRC20 address', ckey: 'usdt_trc20' }}
                      value={t('usdt_trc20')}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11.5px] text-mut leading-relaxed">
            <ShieldCheck size={14} className="text-acc shrink-0 mt-px" />
            <Edt req={{ kind: 'content', type: 'textarea', label: 'Delivery notice', ckey: 'delivery_notice' }} value={t('delivery_notice')} />
          </p>
        </section>
      )}

      {/* ABOUT */}
      {content.show_about !== '0' && (
        <section className="px-3 md:px-4 mt-10 mb-4">
          <div className="bg-card border border-line rounded-3xl p-6 md:p-8 shadow-sm">
            <h2 className="text-lg md:text-xl font-extrabold tracking-tight">
              <Edt req={{ kind: 'content', type: 'text', label: 'About title', ckey: 'about_title' }} value={t('about_title')} />
            </h2>
            <p className="mt-2.5 text-sm text-mut leading-relaxed">
              <Edt req={{ kind: 'content', type: 'textarea', label: 'About text', ckey: 'about_text' }} value={t('about_text')} />
            </p>
          </div>
        </section>
      )}

      <PurchaseModal
        product={buy}
        buyerType="retail"
        flashPct={flashPct}
        onClose={() => setBuy(null)}
        wallet={customer && custWallet ? { balance: custWallet.balance, rate: custWallet.rate } : null}
        onWalletPaid={loadCustWallet}
      />
      <DepositModal
        open={depOpen}
        rate={custWallet?.rate ?? 270}
        feeDzd={custWallet?.feeDzd ?? 50}
        onClose={() => setDepOpen(false)}
        onDone={loadCustWallet}
      />
      <CustomerAuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
