import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import UserGuideModal from './UserGuideModal';

/**
 * Independent floating User Guide button — portaled directly under <body>
 * (.guide-fab-float hard-locks it at left:24 / bottom:24 / z:99999 with !important),
 * on the OPPOSITE bottom corner from the floating chat buttons.
 */
export default function GuideFab() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // The store guide is a customer-facing helper — it stays out of the admin dashboard workspace
  if (location.pathname.startsWith('/admin')) return null;

  return createPortal(
    <>
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 16, stiffness: 240, delay: 0.45 }}
        onClick={() => setOpen(true)}
        className="guide-fab-float flex items-center gap-2 rounded-full bg-slate-900 border border-white/15 px-4 py-3 text-[13px] font-extrabold text-white transition active:scale-95"
        style={{ position: 'fixed', left: 24, bottom: 24, zIndex: 99999, boxShadow: '0 0 26px rgba(16,185,129,0.35), 0 10px 30px rgba(0,0,0,0.55)' }}
        aria-label="دليل المتجر"
        title="دليل المتجر"
      >
        <BookOpen size={16} className="text-emerald-400 shrink-0" />
        دليل المتجر
      </motion.button>
      <UserGuideModal open={open} onClose={() => setOpen(false)} />
    </>,
    document.body
  );
}
