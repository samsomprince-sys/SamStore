import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Headset, Loader2, MessageSquare, Send, X } from 'lucide-react';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { hapticNotify } from '../lib/telegram';
import { useApp } from '../context/AppContext';

function Bubble({ m, mine }: { m: any; mine: boolean }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[82%] px-3.5 py-2 rounded-2xl text-[12.5px] leading-relaxed shadow-sm ${
          mine ? 'tg-btn rounded-br-md' : 'bg-soft text-ink rounded-bl-md'
        }`}
      >
        {!mine && m.sender_role === 'admin' && <p className="text-[9px] font-extrabold uppercase tracking-wide text-acc mb-0.5">Samir ⚡</p>}
        {m.message}
        <span className={`block mt-1 text-[8.5px] font-semibold ${mine ? 'text-white/70' : 'text-mut'}`}>{timeAgo(m.created_at)}</span>
      </div>
    </div>
  );
}

function MessagePane({ messages, me }: { messages: any[]; me: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);
  return (
    <div className="flex-1 overflow-y-auto no-scrollbar px-3.5 py-3 space-y-2 min-h-[200px]">
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-mut gap-2 py-10">
          <MessageSquare size={26} className="opacity-40" />
          <p className="text-xs font-semibold">…</p>
        </div>
      ) : (
        messages.map((m) => <Bubble key={m.id} m={m} mine={m.sender_role === me} />)
      )}
      <div ref={endRef} />
    </div>
  );
}

function InputBar({ onSend, placeholder, autoFocus }: { onSend: (t: string) => Promise<void>; placeholder: string; autoFocus?: boolean }) {
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!val.trim() || busy) return;
        setBusy(true);
        try {
          await onSend(val.trim());
          setVal('');
          hapticNotify('success');
        } catch {
          /* parent handles */
        } finally {
          setBusy(false);
        }
      }}
      className="p-3 border-t border-line flex items-center gap-2 shrink-0 bg-card"
    >
      <input
        value={val}
        autoFocus={autoFocus}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-soft border border-line rounded-2xl px-3.5 py-2.5 text-sm outline-none focus:border-acc transition placeholder:text-mut/70"
      />
      <button type="submit" disabled={busy || !val.trim()} className="w-11 h-11 rounded-2xl tg-btn flex items-center justify-center disabled:opacity-40 active:scale-95 transition shrink-0" aria-label="Send">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} className="rtl:-scale-x-100" />}
      </button>
    </form>
  );
}

function SheetShell({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[86] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 90, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 90, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={(e: any) => e.stopPropagation()}
        className="w-full sm:w-[min(94vw,460px)] h-[80dvh] sm:h-[min(86dvh,640px)] bg-card border border-line rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-4 h-14 border-b border-line flex items-center gap-2.5 shrink-0">
          <span className="w-9 h-9 rounded-xl bg-[#229ED9]/15 text-[#229ED9] flex items-center justify-center shrink-0">
            <Headset size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-[13.5px] leading-tight truncate">{title}</p>
            {sub && <p className="text-[10px] text-mut font-semibold truncate">{sub}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-soft text-mut hover:text-ink transition shrink-0" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ---------------- user side (retail buyer OR wholesaler) ---------------- */

export function UserChatModal({ open, onClose, token, title, sub }: { open: boolean; onClose: () => void; token: string; title: string; sub?: string }) {
  const { tr } = useApp();
  const [messages, setMessages] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      setMessages(await api.get<any[]>('/api/chat', token));
    } catch {
      /* silent */
    }
  }, [token]);

  useEffect(() => {
    if (!open) return;
    load();
    const iv = window.setInterval(load, 5000);
    return () => window.clearInterval(iv);
  }, [open, load]);

  const send = async (text: string) => {
    await api.post('/api/chat', { message: text }, token);
    await load();
  };

  return (
    <AnimatePresence>
      {open && (
        <SheetShell title={title} sub={sub} onClose={onClose}>
          <MessagePane messages={messages} me="customer" />
          <InputBar onSend={send} placeholder={tr('chat_message_ph')} autoFocus />
        </SheetShell>
      )}
    </AnimatePresence>
  );
}

/* ---------------- admin central manager (all threads) ---------------- */

export function AdminChatManager({ open, onClose, token }: { open: boolean; onClose: () => void; token: string }) {
  const { tr } = useApp();
  const [threads, setThreads] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);

  const loadThreads = useCallback(async () => {
    try {
      const list = await api.get<any[]>('/api/chat', token);
      setThreads(Array.isArray(list) ? list : []);
      setActive((cur) => cur || (list.length ? list[0].thread_id : null));
    } catch {
      /* silent */
    }
  }, [token]);

  const loadMessages = useCallback(async () => {
    if (!active) {
      setMessages([]);
      return;
    }
    try {
      setMessages(await api.get<any[]>(`/api/chat?thread=${encodeURIComponent(active)}`, token));
    } catch {
      /* silent */
    }
  }, [active, token]);

  useEffect(() => {
    if (!open) return;
    loadThreads();
    const iv = window.setInterval(loadThreads, 6000);
    return () => window.clearInterval(iv);
  }, [open, loadThreads]);

  useEffect(() => {
    if (!open) return;
    loadMessages();
    const iv = window.setInterval(loadMessages, 4000);
    return () => window.clearInterval(iv);
  }, [open, loadMessages]);

  const reply = async (text: string) => {
    if (!active) return;
    await api.post('/api/chat', { message: text, thread: active }, token);
    await loadMessages();
  };

  const activeMeta = threads.find((t) => t.thread_id === active);

  return (
    <AnimatePresence>
      {open && (
        <SheetShell title={tr('chat_manager')} sub={activeMeta ? `@${activeMeta.sender_name} · ${activeMeta.thread_id}` : tr('chat_threads')} onClose={onClose}>
          {/* thread chips */}
          <div className="px-3 pt-2.5 pb-1 flex gap-1.5 overflow-x-auto no-scrollbar border-b border-line shrink-0">
            {threads.length === 0 ? (
              <p className="text-[11px] text-mut font-semibold pb-1.5">{tr('chat_empty_admin')}</p>
            ) : (
              threads.map((t) => (
                <button
                  key={t.thread_id}
                  onClick={() => setActive(t.thread_id)}
                  className={`shrink-0 px-3 py-2 rounded-xl border text-[10.5px] font-extrabold transition active:scale-95 max-w-[150px] truncate ${
                    active === t.thread_id ? 'bg-acc text-white border-transparent shadow' : 'bg-soft border-line text-ink'
                  }`}
                >
                  {t.sender_role === 'merchant' ? '🏢 ' : '👤 '}
                  {t.sender_name}
                </button>
              ))
            )}
          </div>
          {active ? (
            <>
              <MessagePane messages={messages} me="admin" />
              <InputBar onSend={reply} placeholder={tr('chat_message_ph')} autoFocus />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-mut gap-2 p-8">
              <MessageSquare size={28} className="opacity-40" />
              <p className="text-xs font-semibold">{tr('chat_empty_admin')}</p>
            </div>
          )}
        </SheetShell>
      )}
    </AnimatePresence>
  );
}
