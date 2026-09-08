import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Headset } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { getReadAt, markAllRead, markThreadRead } from '../lib/chatBadge';
import { UserChatModal, AdminChatManager } from './Chat';

/**
 * All three chat buttons (Admin / Trader / Retail buyer) are rendered via a React
 * portal DIRECTLY under <body> — completely outside every page container, so no
 * parent with overflow/transform/backdrop-filter can ever trap or un-fix them.
 * Hard-locked by .chat-fab-float (!important) at right:24px bottom:24px z:999999.
 */
export default function ChatFabs() {
  const { customer, merchant, isAdmin, adminToken, tr } = useApp();
  const location = useLocation();

  const [openRole, setOpenRole] = useState<'customer' | 'merchant' | 'admin' | null>(null);
  const [uCustomer, setUCustomer] = useState(0);
  const [uMerchant, setUMerchant] = useState(0);
  const [uAdmin, setUAdmin] = useState(0);
  const [adminThreads, setAdminThreads] = useState<string[]>([]);

  const isB2B = location.pathname.startsWith('/b2b');
  const isAdminPage = location.pathname.startsWith('/admin');

  // ---- buyer unread listener --------------------------------------------------
  useEffect(() => {
    if (!customer) {
      setUCustomer(0);
      return;
    }
    const thread = `c_${customer.id}`;
    const check = async () => {
      try {
        const rows = await api.get<any[]>('/api/chat', customer.token);
        const r = getReadAt(thread);
        setUCustomer((Array.isArray(rows) ? rows : []).filter((m) => m.sender_role === 'admin' && Date.parse(m.created_at) > r).length);
      } catch {
        /* silent */
      }
    };
    check();
    const iv = window.setInterval(check, 6000);
    return () => window.clearInterval(iv);
  }, [customer]);

  // ---- trader unread listener --------------------------------------------------
  useEffect(() => {
    if (!merchant) {
      setUMerchant(0);
      return;
    }
    const thread = `m_${merchant.id}`;
    const check = async () => {
      try {
        const rows = await api.get<any[]>('/api/chat', merchant.token);
        const r = getReadAt(thread);
        setUMerchant((Array.isArray(rows) ? rows : []).filter((m) => m.sender_role === 'admin' && Date.parse(m.created_at) > r).length);
      } catch {
        /* silent */
      }
    };
    check();
    const iv = window.setInterval(check, 6000);
    return () => window.clearInterval(iv);
  }, [merchant]);

  // ---- admin unread listener ---------------------------------------------------
  const pollAdmin = useCallback(async () => {
    if (!adminToken) return;
    try {
      const list = await api.get<any[]>('/api/chat', adminToken);
      const arr = Array.isArray(list) ? list : [];
      setAdminThreads(arr.map((t) => t.thread_id));
      setUAdmin(arr.filter((t) => t.sender_role !== 'admin' && Date.parse(t.last_at) > getReadAt(t.thread_id)).length);
    } catch {
      /* silent */
    }
  }, [adminToken]);

  useEffect(() => {
    if (!isAdmin || !adminToken) {
      setUAdmin(0);
      return;
    }
    pollAdmin();
    const iv = window.setInterval(pollAdmin, 7000);
    return () => window.clearInterval(iv);
  }, [isAdmin, adminToken, pollAdmin]);

  const fabVisual =
    'rounded-full bg-[#229ED9] text-white border border-white/20 flex items-center justify-center transition active:scale-95 relative shadow-[0_0_26px_rgba(34,158,217,0.6)]';

  const badge = (n: number) => (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center border-2 border-[var(--app-bg)] shadow-[0_0_14px_rgba(239,68,68,0.9)] animate-pulsedot"
      style={{ position: 'absolute', top: -6, right: -6, zIndex: 1000000 }}
    >
      +{n}
    </motion.span>
  );

  const tree = (
    <>
      {/* RETAIL BUYER — fixed floating support button */}
      {customer && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 16, stiffness: 240, delay: 0.3 }}
          onClick={() => {
            markThreadRead(`c_${customer.id}`);
            setUCustomer(0);
            setOpenRole('customer');
          }}
          className={`chat-fab-float ${fabVisual}`}
          style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 999999, width: 52, height: 52 }}
          aria-label={tr('chat_support')}
          title={tr('chat_support')}
        >
          <Headset size={20} />
          {uCustomer > 0 && badge(uCustomer)}
        </motion.button>
      )}

      {/* TRADER — fixed floating B2B button (inside wholesaler workspace) */}
      {merchant && merchant.token && isB2B && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 16, stiffness: 240, delay: 0.35 }}
          onClick={() => {
            markThreadRead(`m_${merchant.id}`);
            setUMerchant(0);
            setOpenRole('merchant');
          }}
          className={`chat-fab-float ${fabVisual} ${customer ? 'chat-fab-float-raised' : ''}`}
          style={{ position: 'fixed', right: 24, bottom: customer ? 88 : 24, zIndex: 999999, width: 52, height: 52 }}
          aria-label={tr('chat_b2b')}
          title={tr('chat_b2b')}
        >
          <Headset size={20} />
          {uMerchant > 0 && badge(uMerchant)}
        </motion.button>
      )}

      {/* ADMIN — fixed floating Central Chat Manager (inside admin workspace) */}
      {isAdmin && adminToken && isAdminPage && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 16, stiffness: 240, delay: 0.4 }}
          onClick={() => {
            markAllRead(adminThreads);
            setUAdmin(0);
            setOpenRole('admin');
          }}
          className="chat-fab-float-raised chat-fab-float rounded-full bg-[#229ED9] text-white border border-white/20 flex items-center gap-2 px-4 py-3 text-[13px] font-extrabold transition active:scale-95 relative shadow-[0_0_26px_rgba(34,158,217,0.65)]"
          style={{ position: 'fixed', right: 24, bottom: 88, zIndex: 999999 }}
          aria-label={tr('chat_manager')}
          title={tr('chat_manager')}
        >
          <Headset size={16} />
          {tr('chat_manager')}
          {uAdmin > 0 && badge(uAdmin)}
        </motion.button>
      )}

      {/* modals (also body-level via portal) */}
      {customer && (
        <UserChatModal
          open={openRole === 'customer'}
          onClose={() => setOpenRole(null)}
          token={customer.token}
          title={tr('chat_support')}
          sub={`@${customer.username}`}
        />
      )}
      {merchant && merchant.token && (
        <UserChatModal
          open={openRole === 'merchant'}
          onClose={() => setOpenRole(null)}
          token={merchant.token}
          title={tr('chat_b2b')}
          sub={`${merchant.first_name} ${merchant.last_name}`}
        />
      )}
      {isAdmin && adminToken && <AdminChatManager open={openRole === 'admin'} onClose={() => setOpenRole(null)} token={adminToken} />}
    </>
  );

  return createPortal(tree, document.body);
}
