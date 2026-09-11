import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, ChevronDown, Gift, Headset, Lock, UserRound, Wallet, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

const SECTIONS: Array<{ icon: any; title: string; body: string; list: string[] }> = [
  {
    icon: UserRound,
    title: '① طريقة التسجيل والدخول',
    body: 'الدخول للمتجر أبسط ما يكون — بلا هاتف وبلا تيليجرام:',
    list: [
      'التسجيل يتم فقط بـ: اسمك + الولاية + كلمة السر.',
      'لتسجيل الدخول لاحقًا: اكتب اسمك وكلمة السر فقط.',
      'جِلستك محفوظة تلقائيًا — لن تحتاج لإعادة الدخول عند العودة.',
    ],
  },
  {
    icon: Wallet,
    title: '② المحفظة الافتراضية ($)',
    body: 'رصيدك بالدولار يشحن يدويًا وبأمان:',
    list: [
      'Baridimob (DZD): أرسل بالدينار على RIP وارفع الوصل — التحويل لدولار حسب سعر الأدمن (رسوم ثابتة بالدينار).',
      'USDT (TRC20): أرسل بالدولار — رسوم ثابتة $2.00 تُضاف للإجمالي.',
      'كل إيداع يراجعه الأدمن يدويًا، والرصيد يُقيد فور الموافقة — ثم تشتري منه مباشرة بضغطة واحدة.',
    ],
  },
  {
    icon: Gift,
    title: '③ استلام الطلبات تلقائيًا',
    body: 'لا تتحقق يدويًا من أي شيء — كل شيء يأتيك:',
    list: [
      'لوحة "طلباتي / Mes Achats" تُحمّل مشترياتك تلقائيًا وتتحدث حيًّا كل ثوانٍ.',
      'عند اعتماد الأدمن، تصلك نقطة تنبيه ذهبية متوهجة فوق شاشتك فورًا.',
      'الضغط عليها يفتح صورة منتجك (بطاقة/كود/حساب) داخل المتجر مع زر تحميل مباشر.',
    ],
  },
  {
    icon: Headset,
    title: '④ دردشة الدعم المباشرة',
    body: 'الدعم يرافقك في كل مكان:',
    list: [
      'الزر الأزرق يبقى عائمًا ثابتًا بأسفل النافذة دائمًا — لا يختفي أبدًا بالتمرير.',
      'عند رد الأدمن تضيء نقطة حمراء نابضة بعدّاد +N فوق الزر فورًا.',
      'فتح الدردشة يمسح التنبيه تلقائيًا ويحفظ سجل محادثتك الخاصة المعزولة.',
    ],
  },
];

/** Interactive dark-mode user guide — 5 expandable accordion pillars. */
export default function UserGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tr } = useApp();
  const [openIdx, setOpenIdx] = useState(0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[87] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 70, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', damping: 27, stiffness: 300 }}
            onClick={(e: any) => e.stopPropagation()}
            className="w-full sm:w-[min(94vw,500px)] max-h-[86dvh] bg-card border border-line rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="px-4 h-14 border-b border-line flex items-center gap-2.5 shrink-0">
              <span className="w-9 h-9 rounded-xl bg-emerald-500/12 text-emerald-500 flex items-center justify-center shrink-0">
                <BookOpen size={17} />
              </span>
              <p className="flex-1 font-extrabold text-[13.5px] truncate">{tr('guide_title')}</p>
              <button onClick={onClose} className="p-2 rounded-full bg-soft text-mut hover:text-ink transition shrink-0" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-3.5 space-y-2">
              {SECTIONS.map((s, i) => {
                const open = openIdx === i;
                return (
                  <div key={i} className={`rounded-2xl border overflow-hidden transition ${open ? 'border-acc/40 bg-acc/5' : 'border-line bg-soft/50'}`}>
                    <button
                      onClick={() => setOpenIdx(open ? -1 : i)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-3 text-start active:scale-[0.99] transition"
                    >
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${open ? 'bg-acc/15 text-acc' : 'bg-card border border-line text-mut'}`}>
                        <s.icon size={15} />
                      </span>
                      <span className="flex-1 min-w-0 text-[12.5px] font-extrabold leading-snug">{s.title}</span>
                      <ChevronDown size={15} className={`shrink-0 text-mut transition-transform duration-200 ${open ? 'rotate-180 text-acc' : ''}`} />
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3.5 pb-3.5 pt-0">
                            <p className="text-[11.5px] text-mut font-semibold leading-relaxed mb-2">{s.body}</p>
                            <ul className="space-y-1.5">
                              {s.list.map((li, j) => (
                                <li key={j} className="flex items-start gap-2 text-[11.5px] font-semibold leading-relaxed">
                                  <span className="w-4 h-4 rounded-md bg-acc/15 text-acc text-[9px] font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                                    {j + 1}
                                  </span>
                                  <span className="flex-1">{li}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              <div className="pt-1 pb-2 text-center text-[10px] text-mut font-semibold flex items-center justify-center gap-1.5">
                <Lock size={10} /> {tr('guide_footer')}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
