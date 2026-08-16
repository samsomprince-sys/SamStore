import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BadgeCheck,
  Check,
  ChevronRight,
  Coins,
  Copy,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Timer,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { copyText } from '../lib/format';
import { useApp } from '../context/AppContext';
import { Edt } from '../components/Editable';
import ProductCard from '../components/ProductCard';
import PurchaseModal from '../components/PurchaseModal';
import SearchBar from '../components/SearchBar';
import type { Product } from '../lib/types';

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
        <div className="flex items-end justify-between gap-3">
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
              <ProductCard key={p.id} p={p} onBuy={() => setBuy(p)} />
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

      <PurchaseModal product={buy} buyerType="retail" onClose={() => setBuy(null)} />
    </div>
  );
}
