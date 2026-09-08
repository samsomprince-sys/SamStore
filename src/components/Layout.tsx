import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Globe,
  Info,
  Layers,
  LayoutGrid,
  Lock,
  LogOut,
  Megaphone,
  Menu,
  Monitor,
  MonitorSmartphone,
  Send,
  ShoppingBag,
  Smartphone,
  Store,
  UserRound,
  Wand2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Edt, EditModal } from './Editable';
import LiveActivityPop from './LiveActivityPop';
import DeliveryWatcher from './DeliveryWatcher';
import CustomerAuthModal from './CustomerAuth';
import UserGuideModal from './UserGuideModal';
import { openTelegramLink } from '../lib/telegram';
import { getViewMode, setViewMode } from '../lib/view';
import type { ViewMode } from '../lib/view';
import { LANG_LABELS } from '../lib/i18n';
import type { Language } from '../lib/i18n';

const SECTION_TOGGLES: Array<{ key: string; label: string }> = [
  { key: 'show_announcement', label: 'Announcement bar' },
  { key: 'show_features', label: 'Features section' },
  { key: 'show_payments', label: 'Payment methods section' },
  { key: 'show_about', label: 'About section' },
];

function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open, onClose]);
  return ref;
}

function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="fixed z-[100] left-1/2 -translate-x-1/2 bottom-6 flex flex-col items-center gap-2 pointer-events-none w-[min(92vw,380px)]">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            className={`w-full flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl border text-sm font-semibold backdrop-blur-md ${
              t.kind === 'success'
                ? 'bg-emerald-500/95 border-emerald-400/40 text-white'
                : t.kind === 'error'
                  ? 'bg-red-500/95 border-red-400/40 text-white'
                  : 'bg-slate-800/95 border-slate-600/40 text-white'
            }`}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 size={16} className="shrink-0" />
            ) : t.kind === 'error' ? (
              <XCircle size={16} className="shrink-0" />
            ) : (
              <Info size={16} className="shrink-0" />
            )}
            <span className="leading-snug">{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function EditBanner() {
  const { editMode, setEditMode, content, saveContent, toast } = useApp();
  const [open, setOpen] = useState(false);
  if (!editMode) return null;
  return (
    <div className="fixed top-2 inset-x-0 z-[85] flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto relative flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/95 text-white shadow-2xl border border-white/15 backdrop-blur">
        <span className="w-2 h-2 rounded-full bg-gold animate-pulsedot" />
        <span className="text-[11px] font-extrabold tracking-widest">SUPER EDIT MODE — TAP ANY HIGHLIGHTED ITEM</span>
        <button
          onClick={() => setOpen((o) => !o)}
          className={`p-1.5 rounded-full transition ${open ? 'bg-gold text-black' : 'bg-white/10 hover:bg-white/20'}`}
          title="Section visibility"
        >
          <Layers size={13} />
        </button>
        <button onClick={() => setEditMode(false)} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition" title="Exit edit mode">
          <X size={13} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              className="absolute top-11 end-0 w-56 bg-card border border-line rounded-2xl shadow-2xl p-2 space-y-1"
            >
              <p className="px-2 pt-1 text-[10px] font-extrabold tracking-widest text-mut">PAGE SECTIONS</p>
              {SECTION_TOGGLES.map((s) => {
                const on = content[s.key] !== '0';
                return (
                  <button
                    key={s.key}
                    onClick={async () => {
                      try {
                        await saveContent(s.key, on ? '0' : '1');
                        toast('success', `${s.label} ${on ? 'hidden' : 'visible'}`);
                      } catch (e: any) {
                        toast('error', e.message);
                      }
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-soft transition text-ink"
                  >
                    <span className="text-xs font-semibold">{s.label}</span>
                    {on ? <Eye size={14} className="text-acc" /> : <EyeOff size={14} className="text-mut" />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SuperEditFab() {
  const { isAdmin, editMode, setEditMode } = useApp();
  if (!isAdmin) return null;
  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', damping: 16, stiffness: 240, delay: 0.3 }}
      onClick={() => setEditMode(!editMode)}
      className={`fixed z-[80] end-4 bottom-6 flex items-center gap-2 px-4 py-3 rounded-full text-[13px] font-extrabold shadow-2xl border transition active:scale-95 ${
        editMode ? 'bg-gold text-black border-black/10' : 'tg-btn border-white/20'
      }`}
    >
      <Wand2 size={16} />
      {editMode ? 'Exit Super Edit' : 'Super Edit'}
    </motion.button>
  );
}

const VIEW_OPTIONS: Array<{ id: ViewMode; labelKey: string; icon: typeof Monitor }> = [
  { id: 'auto', labelKey: 'view_auto', icon: MonitorSmartphone },
  { id: 'mobile', labelKey: 'view_mobile', icon: Smartphone },
  { id: 'pc', labelKey: 'view_pc', icon: Monitor },
];

/* ------------------------------------------------ collapsible sidebar */

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, tr, lang, setLang, storeCategories, catFilter, setCatFilter, customer, setCustomer, merchant, isAdmin } = useApp();
  const [viewMode, setViewModeState] = useState<ViewMode>(() => getViewMode());
  const [authOpen, setAuthOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isRtl = lang === 'ar';

  useEffect(() => {
    const sync = () => setViewModeState(getViewMode());
    window.addEventListener('dz-view-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('dz-view-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const pickCategory = (c: string) => {
    setCatFilter(c);
    onClose();
    if (location.pathname !== '/') navigate('/');
    window.setTimeout(() => {
      document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 180);
  };

  const navItem = (
    <button
      key="admin-access"
      onClick={() => {
        onClose();
        navigate('/admin');
      }}
      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border border-gold/50 text-gold font-extrabold text-[13px] hover:bg-gold/10 transition active:scale-[0.99]"
    >
      <span className="w-8 h-8 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
        <Lock size={15} />
      </span>
      {tr('admin_access')}
    </button>
  );

  const navLink = (to: string, icon: any, label: string) => (
    <NavLink
      key={to}
      to={to}
      onClick={onClose}
      className={({ isActive }: { isActive: boolean }) =>
        `w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl font-extrabold text-[13px] transition active:scale-[0.99] border ${
          isActive ? 'bg-acc/10 text-acc border-acc/30' : 'text-ink border-transparent hover:bg-soft'
        }`
      }
    >
      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${location.pathname === to ? 'bg-acc/15' : 'bg-soft'}`}>
        {icon === 'store' ? <Store size={15} /> : icon === 'b2b' ? <Boxes size={15} /> : <ShoppingBag size={15} />}
      </span>
      {label}
    </NavLink>
  );

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-[2px]"
            />
            <motion.aside
              initial={{ x: isRtl ? '100%' : '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: isRtl ? '100%' : '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 bottom-0 start-0 z-[60] w-[300px] max-w-[86vw] bg-card border-e border-line shadow-2xl flex flex-col"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              {/* head */}
              <div className="flex items-center gap-2.5 px-4 h-14 border-b border-line shrink-0">
                <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shrink-0">
                  <Zap size={16} />
                </span>
                <span className="font-extrabold text-[15px] truncate flex-1">
                  <Edt req={{ kind: 'content', type: 'text', label: 'Store name', ckey: 'store_name' }} value={t('store_name', 'SamStore DZ')} />
                </span>
                <button onClick={onClose} className="p-2 rounded-full bg-soft text-mut hover:text-ink transition" aria-label="Close menu">
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar p-3.5 space-y-5">
                {/* ADMIN ENTRY — pinned to the very top of the menu */}
                <section>{navItem}</section>

                {/* PROFILE / AUTH BLOCK */}
                <section>
                  {customer ? (
                    <div className="rounded-2xl bg-soft border border-line p-3 flex items-center gap-2.5">
                      <span className="w-10 h-10 rounded-xl bg-blue-500/12 text-blue-500 flex items-center justify-center font-extrabold shrink-0">
                        {customer.name[0]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold text-[13px] truncate">{customer.name}</p>
                        <p className="text-[10.5px] font-bold text-[#229ED9] truncate">@{customer.username}</p>
                      </div>
                      <button
                        onClick={() => setCustomer(null)}
                        className="p-2 rounded-lg bg-card border border-line text-mut hover:text-red-500 transition shrink-0"
                        title={tr('logout')}
                      >
                        <LogOut size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        onClose();
                        setAuthOpen(true);
                      }}
                      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl tg-btn font-extrabold text-[13px] active:scale-[0.99] transition shadow-lg"
                    >
                      <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                        <UserRound size={15} />
                      </span>
                      {tr('guest_prompt_btn')}
                    </button>
                  )}
                  {merchant && (
                    <div className="mt-2 rounded-2xl bg-violet-500/10 border border-violet-500/25 p-3 flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-xl bg-violet-500/15 text-violet-500 flex items-center justify-center font-extrabold shrink-0">
                        {merchant.first_name[0]}
                      </span>
                      <p className="min-w-0 flex-1 text-[12px] font-extrabold truncate">
                        {merchant.first_name} {merchant.last_name} <span className="block text-[10px] text-violet-400 font-bold">Grossiste · {merchant.status}</span>
                      </p>
                    </div>
                  )}
                </section>

                {/* NAVIGATION */}
                <section>
                  <p className="px-1 pb-1.5 text-[10px] font-extrabold tracking-widest text-mut">NAVIGATION</p>
                  <div className="space-y-1.5">
                    {navLink('/', 'store', tr('nav_store'))}
                    {navLink('/b2b', 'b2b', tr('nav_wholesale'))}
                    {navLink('/orders', 'orders', tr('my_orders'))}
                    <button
                      onClick={() => {
                        onClose();
                        setGuideOpen(true);
                      }}
                      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl font-extrabold text-[13px] transition active:scale-[0.99] border text-ink border-transparent hover:bg-soft"
                    >
                      <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-soft">
                        <BookOpen size={15} />
                      </span>
                      {tr('guide_menu')}
                    </button>
                  </div>
                </section>

                {/* CATEGORIES */}
                <section>
                  <p className="px-1 pb-1.5 text-[10px] font-extrabold tracking-widest text-mut flex items-center gap-1.5">
                    <LayoutGrid size={11} /> {tr('cat_title')}
                  </p>
                  <div className="space-y-1">
                    {storeCategories.map((c) => (
                      <button
                        key={c}
                        onClick={() => pickCategory(c)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-start text-[12.5px] font-bold transition ${
                          catFilter === c ? 'bg-acc/10 text-acc border border-acc/30' : 'text-ink hover:bg-soft border border-transparent'
                        }`}
                      >
                        {c === 'All' ? tr('cat_all') : c}
                        {catFilter === c && <CheckCircle2 size={14} />}
                      </button>
                    ))}
                  </div>
                </section>

                {/* SETTINGS: view mode (language switcher is docked at the sidebar footer) */}
                <section>
                  <p className="px-1 pb-1.5 text-[10px] font-extrabold tracking-widest text-mut flex items-center gap-1.5">
                    <Globe size={11} /> {tr('view_title')}
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {VIEW_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => setViewMode(o.id)}
                        className={`py-2.5 rounded-xl border flex flex-col items-center gap-1 transition active:scale-95 ${
                          viewMode === o.id ? 'bg-acc/10 text-acc border-acc/40' : 'bg-soft border-line text-mut'
                        }`}
                      >
                        <o.icon size={15} />
                        <span className="text-[9.5px] font-extrabold leading-tight text-center">{tr(o.labelKey)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              {/* foot — language toggle row docked at the very bottom of the sidebar */}
              <div className="p-3.5 border-t border-line shrink-0">
                <p className="px-1 pb-1.5 text-[10px] font-extrabold tracking-widest text-mut flex items-center gap-1.5">
                  <Globe size={11} /> {tr('lang_title')}
                </p>
                <div className="grid grid-cols-3 gap-1.5 mb-2.5">
                  {(['ar', 'fr', 'en'] as Language[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={`py-2.5 rounded-xl text-[11px] font-extrabold border transition active:scale-95 ${
                        lang === l ? 'bg-acc text-white border-transparent shadow-md' : 'bg-soft border-line text-mut'
                      }`}
                    >
                      {LANG_LABELS[l]}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => openTelegramLink(`https://t.me/${t('support_telegram', 'SamStoreDZ').replace('@', '')}`)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#229ED9]/12 text-[#229ED9] text-xs font-extrabold active:scale-[0.99] transition"
                >
                  <Send size={14} /> @{t('support_telegram', 'SamStoreDZ').replace('@', '')}
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <CustomerAuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <UserGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { t, content, tr } = useApp();
  const supportUser = t('support_telegram', 'SamStoreDZ').replace('@', '');
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-surface text-ink flex flex-col">
      {content.show_announcement !== '0' && (
        <div className="bg-acc text-white text-center text-[12px] font-semibold py-1.5 px-3 flex items-center justify-center gap-1.5">
          <Megaphone size={13} className="shrink-0" />
          <Edt req={{ kind: 'content', type: 'text', label: 'Announcement bar', ckey: 'announcement' }} value={t('announcement')} />
        </div>
      )}

      {/* CLEAN HEADER: menu + logo only (everything moved into the collapsible sidebar) */}
      <header className="sticky top-0 z-30 bg-card/85 backdrop-blur-md border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-2.5">
          <button
            onClick={() => setNavOpen(true)}
            className="w-10 h-10 rounded-xl bg-soft border border-line flex items-center justify-center active:scale-95 transition shrink-0 hover:border-acc"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shrink-0">
              <Zap size={16} />
            </span>
            <span className="font-extrabold text-[15px] tracking-tight truncate">
              <Edt req={{ kind: 'content', type: 'text', label: 'Store name', ckey: 'store_name' }} value={t('store_name', 'SamStore DZ')} />
            </span>
          </Link>
          <div className="flex-1" />
          <button
            onClick={() => setNavOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-acc/10 text-acc text-[11px] font-extrabold active:scale-95 transition"
          >
            <LayoutGrid size={13} />
            {tr('cat_button')}
            <ChevronDown size={12} />
          </button>
        </div>
      </header>

      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <main className="flex-1 w-full pb-8">{children}</main>

      <footer className="border-t border-line bg-card mt-4">
        <div className="max-w-6xl mx-auto px-4 py-7 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
              <Zap size={14} />
            </span>
            <span className="font-extrabold text-sm">{t('store_name', 'SamStore DZ')}</span>
          </div>
          <p className="text-xs text-mut leading-relaxed md:flex-1">
            <Edt req={{ kind: 'content', type: 'textarea', label: 'Footer text', ckey: 'footer_text' }} value={t('footer_text')} />
          </p>
          <button
            onClick={() => openTelegramLink(`https://t.me/${supportUser}`)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl tg-btn text-xs font-bold active:scale-95 transition self-start md:self-auto"
          >
            <Send size={14} />
            <Edt req={{ kind: 'content', type: 'text', label: 'Telegram support username', ckey: 'support_telegram' }} value={supportUser}>
              @{supportUser}
            </Edt>
          </button>
        </div>
      </footer>

      <SuperEditFab />
      <EditBanner />
      <EditModal />
      <LiveActivityPop />
      <DeliveryWatcher />
      <Toasts />
    </div>
  );
}
