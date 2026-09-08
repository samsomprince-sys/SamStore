import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, Download, X } from 'lucide-react';
import { api } from '../lib/api';
import { hapticNotify } from '../lib/telegram';
import { downloadImageFile } from '../lib/download';
import { getFp, getHw } from '../lib/ref';
import { useApp } from '../context/AppContext';

const SEEN_KEY = 'dz_seen_deliveries';

/**
 * In-app delivery bridge (no external Telegram chats): polls the buyer's/merchant's
 * own orders; the moment the admin uploads a delivery screenshot, a glowing alert
 * badge appears on their active storefront screen — tapping it opens a focused modal
 * with the digital product image + a download option.
 */
export default function DeliveryWatcher() {
  const { customer, merchant, tgUser, tr } = useApp();
  const [notice, setNotice] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const getSeen = (): number[] => {
    try {
      return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    } catch {
      return [];
    }
  };

  const load = useCallback(async () => {
    const results: any[] = [];
    const usernames = new Set<string>();
    if (customer?.username) usernames.add(customer.username);
    if (tgUser?.username) usernames.add(tgUser.username);
    for (const u of usernames) {
      try {
        const rows = await api.get<any[]>(`/api/orders-public?tg=${encodeURIComponent(u)}`);
        if (Array.isArray(rows)) results.push(...rows);
      } catch {
        /* silent */
      }
    }
    if (merchant?.token) {
      try {
        const rows = await api.get<any[]>('/api/orders-public?tg=__merchant__', merchant.token);
        if (Array.isArray(rows)) results.push(...rows);
      } catch {
        /* silent */
      }
    }
    // FREE-PRODUCT CHALLENGE: check for an unclaimed auto-delivered gift
    const tokens = [customer?.token, merchant?.token].filter(Boolean) as string[];
    for (const tkn of tokens) {
      try {
        const ch = await api.get<any>(`/api/challenge?fp=${encodeURIComponent(getFp())}&hw=${encodeURIComponent(getHw())}`, tkn);
        const g = ch?.unclaimed_gift;
        const giftId = g ? 10000000 + g.id : 0;
        if (g && !getSeen().includes(giftId)) {
          setNotice({ id: giftId, giftId: g.id, gift: true, giftToken: tkn, product_name: '🎁 ' + tr('challenge_friends'), delivery_image: g.image_url });
          hapticNotify('success');
          return;
        }
      } catch {
        /* silent */
      }
    }

    if (!results.length) return;
    const seen = getSeen();
    const fresh = results
      .filter((o) => o.status === 'delivered' && o.delivery_image && !seen.includes(o.id))
      .sort((a, b) => a.id - b.id);
    if (fresh.length > 0 && !notice) {
      setNotice(fresh[0]);
      hapticNotify('success');
    }
  }, [customer, merchant, tgUser, notice, tr]);

  useEffect(() => {
    load();
    const iv = window.setInterval(load, 12000);
    return () => window.clearInterval(iv);
  }, [load]);

  const dismiss = () => {
    if (!notice) return;
    const seen = getSeen();
    if (!seen.includes(notice.id)) {
      seen.push(notice.id);
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-300)));
      } catch {
        /* full */
      }
    }
    // gift → claim it instantly (automatic delivery, zero manual admin step)
    if (notice.gift && notice.giftToken) {
      api.post('/api/challenge', { action: 'claim' }, notice.giftToken).catch(() => {});
    }
    setNotice(null);
    setModalOpen(false);
    window.setTimeout(load, 800); // surface the next real delivery, if any
  };

  const download = () => {
    if (!notice) return;
    // hardened: blob-fetch → body-attached <a download> → click → delayed revoke (WebView safe)
    void downloadImageFile(notice.delivery_image, notice.gift ? 'SamStore-Free-Gift.png' : `SamStore-Order-${notice.id}.png`);
    hapticNotify('success');
  };

  return (
    <>
      {/* GLOWING ALERT BADGE — prominent on the active storefront screen */}
      <AnimatePresence>
        {notice && !modalOpen && (
          <motion.button
            key={`badge-${notice.id}`}
            initial={{ opacity: 0, y: -24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.92 }}
            transition={{ type: 'spring', damping: 18, stiffness: 280 }}
            onClick={() => setModalOpen(true)}
            className="fixed top-[68px] inset-x-0 z-[65] mx-auto w-[min(94vw,380px)] flex items-center gap-2.5 rounded-2xl border border-gold/60 bg-[#1a1503]/95 backdrop-blur-md px-3.5 py-3 text-start shadow-[0_0_34px_rgba(245,164,11,0.45)]"
          >
            <motion.span
              animate={{ scale: [1, 1.15, 1], opacity: [1, 0.75, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="w-9 h-9 rounded-xl bg-gold flex items-center justify-center text-black shrink-0"
            >
              <BadgeCheck size={18} />
            </motion.span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-extrabold text-gold leading-snug">{tr('delivered_alert_title')}</span>
              <span className="block text-[10.5px] font-bold text-white/85 mt-0.5 underline underline-offset-2">{tr('delivered_alert_cta')}</span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* FOCUSED DELIVERY MODAL — clean, centered, download option */}
      <AnimatePresence>
        {notice && modalOpen && (
          <motion.div
            key={`modal-${notice.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            onClick={dismiss}
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.94 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              onClick={(e: any) => e.stopPropagation()}
              className="w-[min(94vw,480px)] bg-card border border-gold/50 rounded-3xl p-4 shadow-2xl"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-9 h-9 rounded-xl bg-gold/15 text-gold flex items-center justify-center shrink-0">
                  <BadgeCheck size={18} />
                </span>
                <p className="flex-1 font-extrabold text-[13px] leading-snug">
                  {tr('delivered_alert_title')}
                  <span className="block text-[10.5px] text-mut font-semibold">
                    {notice.product_name} · #{notice.id}
                  </span>
                </p>
                <button onClick={dismiss} className="p-2 rounded-full bg-soft text-mut hover:text-ink transition shrink-0" aria-label="Close">
                  <X size={16} />
                </button>
              </div>
              <img
                src={notice.delivery_image}
                alt="Delivered product"
                className="w-full max-h-[55dvh] object-contain rounded-2xl border border-line bg-black/30"
              />
              <button
                onClick={download}
                className="mt-3 w-full py-3 rounded-xl tg-btn font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition"
              >
                <Download size={15} /> {tr('download_img')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
