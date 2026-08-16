import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
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
  Megaphone,
  Monitor,
  MonitorSmartphone,
  Send,
  Smartphone,
  Store,
  Wand2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Edt, EditModal } from './Editable';
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
    <div className="fixed z-[100] left-1/2 -translate-x-1/2 bottom-24 md:bottom-8 flex flex-col items-center gap-2 pointer-events-none w-[min(92vw,380px)]">
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
      className={`fixed z-[80] end-4 bottom-24 md:bottom-6 flex items-center gap-2 px-4 py-3 rounded-full text-[13px] font-extrabold shadow-2xl border transition active:scale-95 ${
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

function ViewSwitch() {
  const { tr } = useApp();
  const [mode, setMode] = useState<ViewMode>(() => getViewMode());
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  useEffect(() => {
    const sync = () => setMode(getViewMode());
    window.addEventListener('dz-view-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('dz-view-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const pick = (m: ViewMode) => {
    setViewMode(m);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Switch view: Mobile / PC"
        title="Switch view: Mobile / PC"
        className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-extrabold border transition active:scale-95 ${
          open || mode !== 'auto' ? 'bg-acc text-white border-transparent shadow-md' : 'bg-soft border-line text-ink hover:border-acc'
        }`}
      >
        <MonitorSmartphone size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute end-0 top-11 z-50 w-52 bg-card border border-line rounded-2xl shadow-2xl p-1.5"
          >
            <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-extrabold tracking-widest text-mut">{tr('view_title')}</p>
            {VIEW_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => pick(o.id)}
                className={`w-full flex items-center justify-between px-2.5 py-2.5 rounded-xl text-start text-[13px] font-bold transition ${
                  mode === o.id ? 'bg-acc/10 text-acc' : 'text-ink hover:bg-soft'
                }`}
              >
                <span className="flex items-center gap-2">
                  <o.icon size={15} />
                  {tr(o.labelKey)}
                </span>
                {mode === o.id && <CheckCircle2 size={14} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const LANGS: Language[] = ['ar', 'fr', 'en'];

function LangSwitcher() {
  const { lang, setLang, tr } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Language: العربية / Français / English"
        title="Language: العربية / Français / English"
        className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-extrabold border transition active:scale-95 ${
          open ? 'bg-acc text-white border-transparent shadow-md' : 'bg-soft border-line text-ink hover:border-acc'
        }`}
      >
        <Globe size={14} />
        <span className="uppercase text-[10px] tracking-wide">{lang}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute end-0 top-11 z-50 w-44 bg-card border border-line rounded-2xl shadow-2xl p-1.5"
          >
            <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-extrabold tracking-widest text-mut">{tr('lang_title')}</p>
            {LANGS.map((l) => (
              <button
                key={l}
                onClick={() => {
                  setLang(l);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-2.5 rounded-xl text-start text-[13px] font-bold transition ${
                  lang === l ? 'bg-acc/10 text-acc' : 'text-ink hover:bg-soft'
                }`}
              >
                {LANG_LABELS[l]}
                {lang === l && <CheckCircle2 size={14} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CategoryDropdown() {
  const { storeCategories, catFilter, setCatFilter, tr } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const navigate = useNavigate();
  const location = useLocation();

  const pick = (c: string) => {
    setCatFilter(c);
    setOpen(false);
    if (location.pathname !== '/') navigate('/');
    window.setTimeout(() => {
      document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Browse by category"
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold border transition active:scale-95 ${
          open || catFilter !== 'All' ? 'bg-acc text-white border-transparent shadow-md' : 'bg-soft border-line text-ink hover:border-acc'
        }`}
      >
        <LayoutGrid size={14} />
        <span className="max-w-20 truncate">{catFilter === 'All' ? tr('cat_button') : catFilter}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute end-0 top-11 z-50 w-52 bg-card border border-line rounded-2xl shadow-2xl p-1.5"
          >
            <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-extrabold tracking-widest text-mut">{tr('cat_title')}</p>
            {storeCategories.map((c) => (
              <button
                key={c}
                onClick={() => pick(c)}
                className={`w-full flex items-center justify-between px-2.5 py-2.5 rounded-xl text-start text-[13px] font-bold transition ${
                  catFilter === c ? 'bg-acc/10 text-acc' : 'text-ink hover:bg-soft'
                }`}
              >
                {c === 'All' ? tr('cat_all') : c}
                {catFilter === c && <CheckCircle2 size={14} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BottomNav() {
  const { tr } = useApp();
  const items = [
    { to: '/', icon: Store, label: tr('nav_store') },
    { to: '/b2b', icon: Boxes, label: tr('nav_wholesale') },
    { to: '/admin', icon: Lock, label: tr('nav_admin') },
  ];
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/90 backdrop-blur-md border-t border-line">
      <div className="safe-b">
        <div className="grid grid-cols-3">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold transition ${isActive ? 'text-acc' : 'text-mut'}`
              }
            >
              <it.icon size={19} />
              <span className="truncate max-w-full px-1">{it.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { t, content, tr } = useApp();
  const supportUser = t('support_telegram', 'SamStoreDZ').replace('@', '');

  return (
    <div className="min-h-[100dvh] bg-surface text-ink flex flex-col">
      {content.show_announcement !== '0' && (
        <div className="bg-acc text-white text-center text-[12px] font-semibold py-1.5 px-3 flex items-center justify-center gap-1.5">
          <Megaphone size={13} className="shrink-0" />
          <Edt req={{ kind: 'content', type: 'text', label: 'Announcement bar', ckey: 'announcement' }} value={t('announcement')} />
        </div>
      )}

      <header className="sticky top-0 z-30 bg-card/85 backdrop-blur-md border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shrink-0">
              <Zap size={16} />
            </span>
            <span className="font-extrabold text-[15px] tracking-tight truncate">
              <Edt req={{ kind: 'content', type: 'text', label: 'Store name', ckey: 'store_name' }} value={t('store_name', 'SamStore DZ')} />
            </span>
          </Link>
          <div className="flex-1" />
          <ViewSwitch />
          <CategoryDropdown />
          <LangSwitcher />
          <NavLink
            to="/admin"
            aria-label="Admin Access"
            className={({ isActive }) =>
              `shrink-0 inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-extrabold border transition active:scale-95 ${
                isActive ? 'bg-gold text-black border-transparent shadow-md' : 'border-gold/50 text-gold hover:bg-gold/10'
              }`
            }
          >
            <Lock size={13} />
            <span className="hidden sm:inline">{tr('admin_access')}</span>
          </NavLink>
          <nav className="hidden md:flex items-center gap-1">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `px-3.5 py-2 rounded-xl text-[13px] font-bold transition ${isActive ? 'bg-acc/10 text-acc' : 'text-mut hover:text-ink'}`
              }
            >
              {tr('nav_store')}
            </NavLink>
            <NavLink
              to="/b2b"
              className={({ isActive }) =>
                `px-3.5 py-2 rounded-xl text-[13px] font-bold transition ${isActive ? 'bg-acc/10 text-acc' : 'text-mut hover:text-ink'}`
              }
            >
              {tr('nav_wholesale')}
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full pb-24 md:pb-8">{children}</main>

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

      <BottomNav />
      <SuperEditFab />
      <EditBanner />
      <EditModal />
      <Toasts />
    </div>
  );
}
