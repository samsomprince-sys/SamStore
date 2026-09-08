import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShoppingBag, UserPlus, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useApp } from '../context/AppContext';

type ActEvent = {
  id: string;
  type: 'purchase' | 'register' | 'deposit';
  product?: string;
  method?: string;
  at: string;
};

/**
 * 100% REAL ACTIVITY ONLY.
 * The popup appears exclusively when a genuine database event occurs in real time
 * (a real registration / a real deposit / a real purchase). No simulation, no replay,
 * no fabricated notifications — when nothing is happening, the screen stays clean.
 */
export default function LiveActivityPop() {
  const { tr, lang } = useApp();
  const [current, setCurrent] = useState<ActEvent | null>(null);
  const queue = useRef<ActEvent[]>([]);
  const newestAt = useRef<number>(0);
  const showing = useRef(false);

  const pump = () => {
    if (showing.current) return;
    const next = queue.current.shift();
    if (!next) return;
    showing.current = true;
    setCurrent(next);
    window.setTimeout(() => {
      setCurrent(null);
      showing.current = false;
      window.setTimeout(pump, 1500); // small gap between back-to-back real events
    }, 4500);
  };

  const fetchFeed = async (firstRun: boolean) => {
    try {
      const data = await api.get<ActEvent[]>('/api/activity');
      const list = Array.isArray(data) ? data : [];
      if (firstRun) {
        // baseline: existing history is NOT displayed — only future live events
        newestAt.current = list.length ? Math.max(...list.map((e) => Date.parse(e.at))) : Date.now();
        return;
      }
      const live = list.filter((e) => Date.parse(e.at) > newestAt.current);
      if (live.length) {
        newestAt.current = Math.max(...live.map((e) => Date.parse(e.at)));
        queue.current.push(...live.reverse());
        pump();
      }
    } catch {
      /* silent — popup simply stays hidden */
    }
  };

  useEffect(() => {
    fetchFeed(true);
    const iv = window.setInterval(() => fetchFeed(false), 15000);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = current
    ? current.type === 'purchase'
      ? { icon: ShoppingBag, chip: 'bg-amber-500/15 text-amber-500', text: tr('act_bought').replace('{p}', current.product || 'Digital') }
      : current.type === 'register'
        ? { icon: UserPlus, chip: 'bg-violet-500/15 text-violet-500', text: tr('act_registered') }
        : {
            icon: Wallet,
            chip: 'bg-emerald-500/15 text-emerald-500',
            text: current.method === 'usdt' ? tr('act_deposit_usdt') : tr('act_deposit_bm'),
          }
    : null;

  return (
    <div className="fixed z-[45] start-3 bottom-24 md:bottom-6 pointer-events-none" key={lang}>
      <AnimatePresence>
        {current && meta && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.94 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
            className="pointer-events-auto w-[min(320px,86vw)] bg-card/95 backdrop-blur-md border border-line rounded-2xl shadow-2xl p-3 flex items-center gap-3"
          >
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.chip}`}>
              <meta.icon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold leading-snug">{meta.text}</p>
              <p className="text-[10px] text-mut font-semibold mt-0.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulsedot" />
                {timeAgo(current.at) || tr('act_now')}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
