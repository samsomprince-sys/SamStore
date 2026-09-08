import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { initTelegram, getTgUser } from '../lib/telegram';
import type { TgUser } from '../lib/telegram';
import type { ContentMap } from '../lib/types';
import { DICT, getStoredLang, setStoredLang } from '../lib/i18n';
import type { Language } from '../lib/i18n';
import { beaconContentSaved } from '../lib/tgBeacon';
import { initPresence, setPresenceRole } from '../lib/presence';

export type ToastKind = 'success' | 'error' | 'info';
export type Toast = { id: number; kind: ToastKind; text: string };

export type EditType = 'text' | 'textarea' | 'image' | 'price';
export type EditRequest = {
  kind: 'content' | 'product';
  type: EditType;
  label: string;
  ckey?: string;
  productId?: number;
  field?: string;
  value: string;
};

export type MerchantSession = {
  token: string;
  id: number;
  first_name: string;
  last_name: string;
  status: string;
};

export type CustomerSession = {
  token: string;
  id: number;
  name: string;
  username: string;
};

type AppContextValue = {
  tgUser: TgUser | null;
  inTelegram: boolean;
  content: ContentMap;
  contentLoaded: boolean;
  t: (key: string, fallback?: string) => string;
  saveContent: (key: string, value: string) => Promise<void>;
  isAdmin: boolean;
  adminToken: string | null;
  setAdminToken: (token: string | null) => void;
  editMode: boolean;
  setEditMode: (on: boolean) => void;
  merchant: MerchantSession | null;
  setMerchant: (m: MerchantSession | null) => void;
  customer: CustomerSession | null;
  setCustomer: (c: CustomerSession | null) => void;
  toasts: Toast[];
  toast: (kind: ToastKind, text: string) => void;
  editRequest: EditRequest | null;
  requestEdit: (r: EditRequest) => void;
  clearEditRequest: () => void;
  productsVersion: number;
  bumpProducts: () => void;
  catFilter: string;
  setCatFilter: (c: string) => void;
  storeCategories: string[];
  setStoreCategories: (c: string[]) => void;
  lang: Language;
  setLang: (l: Language) => void;
  tr: (key: string) => string;
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

const LS_ADMIN = 'dz_admin_token';
const LS_EDIT = 'dz_super_edit';
const LS_MERCHANT = 'dz_merchant';
const LS_CUSTOMER = 'dz_customer';

export function AppProvider({ children }: { children: ReactNode }) {
  // live presence heartbeat for the admin realtime traffic board (15s)
  useEffect(() => {
    initPresence();
  }, []);

  const [tgUser] = useState<TgUser | null>(() => getTgUser());
  const [inTelegram] = useState<boolean>(() => initTelegram());
  const [content, setContent] = useState<ContentMap>({});
  const [contentLoaded, setContentLoaded] = useState(false);

  const [adminToken, setAdminTokenState] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editOn, setEditOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_EDIT) === '1';
    } catch {
      return false;
    }
  });

  const [merchant, setMerchantState] = useState<MerchantSession | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [editRequest, setEditRequest] = useState<EditRequest | null>(null);
  const [productsVersion, setProductsVersion] = useState(0);
  const [catFilter, setCatFilter] = useState('All');
  const [storeCategories, setStoreCategories] = useState<string[]>(['All']);
  const [lang, setLangState] = useState<Language>(() => getStoredLang());
  const toastId = useRef(0);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    setStoredLang(lang);
  }, [lang]);

  const setLang = useCallback((l: Language) => setLangState(l), []);

  const tr = useCallback((key: string) => DICT[lang]?.[key] ?? DICT.en[key] ?? key, [lang]);

  const toast = useCallback((kind: ToastKind, text: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  // ---- content -------------------------------------------------------------
  const refreshContent = useCallback(async () => {
    try {
      const rows = await api.get<Array<{ key: string; value: string }>>('/api/content');
      const map: ContentMap = {};
      (rows || []).forEach((r) => {
        map[r.key] = r.value;
      });
      setContent(map);
    } catch (e: any) {
      console.error('content load failed', e);
    } finally {
      setContentLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshContent();
  }, [refreshContent]);

  const t = useCallback((key: string, fallback = '') => content[key] ?? fallback, [content]);

  // ---- admin auth ------------------------------------------------------------
  useEffect(() => {
    const tok = localStorage.getItem(LS_ADMIN);
    if (!tok) return;
    api
      .post('/api/auth', { type: 'verify' }, tok)
      .then((r: any) => {
        if (r?.valid && r.role === 'admin') {
          setAdminTokenState(tok);
          setIsAdmin(true);
        } else {
          localStorage.removeItem(LS_ADMIN);
        }
      })
      .catch(() => {
        /* keep logged out */
      });
  }, []);

  const setAdminToken = useCallback((token: string | null) => {
    if (token) {
      localStorage.setItem(LS_ADMIN, token);
      setAdminTokenState(token);
      setIsAdmin(true);
    } else {
      localStorage.removeItem(LS_ADMIN);
      localStorage.removeItem(LS_EDIT);
      setAdminTokenState(null);
      setIsAdmin(false);
      setEditOn(false);
    }
  }, []);

  const setEditMode = useCallback((on: boolean) => {
    setEditOn(on);
    try {
      localStorage.setItem(LS_EDIT, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  // ---- merchant auth -----------------------------------------------------------
  useEffect(() => {
    const raw = localStorage.getItem(LS_MERCHANT);
    if (!raw) return;
    let m: MerchantSession | null = null;
    try {
      m = JSON.parse(raw);
    } catch {
      localStorage.removeItem(LS_MERCHANT);
      return;
    }
    if (!m?.token) return;
    setMerchantState(m);
    api
      .post('/api/auth', { type: 'verify' }, m.token)
      .then((r: any) => {
        if (r?.valid && r.merchant) {
          const upd: MerchantSession = { ...m!, ...r.merchant };
          setMerchantState(upd);
          localStorage.setItem(LS_MERCHANT, JSON.stringify(upd));
        } else {
          localStorage.removeItem(LS_MERCHANT);
          setMerchantState(null);
        }
      })
      .catch(() => {
        /* offline — keep session */
      });
  }, []);

  const setMerchant = useCallback((m: MerchantSession | null) => {
    if (m) localStorage.setItem(LS_MERCHANT, JSON.stringify(m));
    else localStorage.removeItem(LS_MERCHANT);
    setMerchantState(m);
  }, []);

  // ---- retail customer session -------------------------------------------------------
  const [customer, setCustomerState] = useState<CustomerSession | null>(null);
  useEffect(() => {
    const raw = localStorage.getItem(LS_CUSTOMER);
    if (!raw) return;
    let c: CustomerSession | null = null;
    try {
      c = JSON.parse(raw);
    } catch {
      localStorage.removeItem(LS_CUSTOMER);
      return;
    }
    if (!c?.token) return;
    setCustomerState(c);
    api
      .post('/api/auth', { type: 'verify' }, c.token)
      .then((r: any) => {
        if (r?.valid && r.customer) {
          const upd: CustomerSession = { ...c!, ...r.customer };
          setCustomerState(upd);
          localStorage.setItem(LS_CUSTOMER, JSON.stringify(upd));
        } else {
          localStorage.removeItem(LS_CUSTOMER);
          setCustomerState(null);
        }
      })
      .catch(() => {
        /* offline — keep session */
      });
  }, []);

  const setCustomer = useCallback((c: CustomerSession | null) => {
    if (c) localStorage.setItem(LS_CUSTOMER, JSON.stringify(c));
    else localStorage.removeItem(LS_CUSTOMER);
    setCustomerState(c);
  }, []);

  // ---- content saving ------------------------------------------------------------
  const saveContent = useCallback(
    async (key: string, value: string) => {
      if (!adminToken) throw new Error('Admin login required');
      const r: any = await api.put('/api/content', { key, value }, adminToken);
      setContent((c) => ({ ...c, [key]: value }));
      // Instant CORS-proof confirmation fallback if the server-side bot send did not confirm
      if (!r?.alert_sent && key !== 'admin_telegram_chat_id') beaconContentSaved(key, value);
    },
    [adminToken]
  );

  const requestEdit = useCallback((r: EditRequest) => setEditRequest(r), []);
  const clearEditRequest = useCallback(() => setEditRequest(null), []);
  const bumpProducts = useCallback(() => setProductsVersion((v) => v + 1), []);

  // report role to the live tracker (trader counter tracks merchants strictly)
  useEffect(() => {
    setPresenceRole(isAdmin ? 'admin' : merchant ? 'merchant' : customer ? 'customer' : 'guest');
  }, [isAdmin, merchant, customer]);

  const value = useMemo<AppContextValue>(
    () => ({
      tgUser,
      inTelegram,
      content,
      contentLoaded,
      t,
      saveContent,
      isAdmin,
      adminToken,
      setAdminToken,
      editMode: isAdmin && editOn,
      setEditMode,
      merchant,
      setMerchant,
      customer,
      setCustomer,
      toasts,
      toast,
      editRequest,
      requestEdit,
      clearEditRequest,
      productsVersion,
      bumpProducts,
      catFilter,
      setCatFilter,
      storeCategories,
      setStoreCategories,
      lang,
      setLang,
      tr,
    }),
    [
      tgUser,
      inTelegram,
      content,
      contentLoaded,
      t,
      saveContent,
      isAdmin,
      adminToken,
      setAdminToken,
      editOn,
      setEditMode,
      merchant,
      setMerchant,
      customer,
      setCustomer,
      toasts,
      toast,
      editRequest,
      requestEdit,
      clearEditRequest,
      productsVersion,
      bumpProducts,
      catFilter,
      setCatFilter,
      storeCategories,
      setStoreCategories,
      lang,
      setLang,
      tr,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
