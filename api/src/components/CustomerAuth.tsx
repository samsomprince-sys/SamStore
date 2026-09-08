import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, Lock, UserRound, X } from 'lucide-react';
import { api } from '../lib/api';
import { getFp, getHw } from '../lib/ref';
import { hapticNotify } from '../lib/telegram';
import { useApp } from '../context/AppContext';

const WILAYAS =
  '01 Adrar,02 Chlef,03 Laghouat,04 Oum El Bouaghi,05 Batna,06 Béjaïa,07 Biskra,08 Béchar,09 Blida,10 Bouira,11 Tamanrasset,12 Tébessa,13 Tlemcen,14 Tiaret,15 Tizi Ouzou,16 Alger,17 Djelfa,18 Jijel,19 Sétif,20 Saïda,21 Skikda,22 Sidi Bel Abbès,23 Annaba,24 Guelma,25 Constantine,26 Médéa,27 Mostaganem,28 MSila,29 Mascara,30 Ouargla,31 Oran,32 El Bayadh,33 Illizi,34 Bordj Bou Arréridj,35 Boumerdès,36 El Tarf,37 Tindouf,38 Tissemsilt,39 El Oued,40 Khenchela,41 Souk Ahras,42 Tipaza,43 Mila,44 Aïn Defla,45 Naâma,46 Aïn Témouchent,47 Ghardaïa,48 Relizane,49 Timimoun,50 Bordj Badji Mokhtar,51 Ouled Djellal,52 Béni Abbès,53 In Salah,54 In Guezzam,55 Touggourt,56 Djanet,57 El MGhair,58 El Meniaa'.split(
    ','
  );

const inputCls =
  'w-full bg-soft border border-line rounded-xl px-3.5 py-3 text-sm outline-none focus:border-acc transition placeholder:text-mut/70';

/** Clean retail login/registration form (Name + Username + Password). */
export function CustomerAuthForm({ onSuccess }: { onSuccess?: () => void }) {
  const { setCustomer, toast, tr, lang } = useApp();
  const [tab, setTab] = useState<'register' | 'login'>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [wilaya, setWilaya] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      let r: any;
      if (tab === 'register') {
        if (username.trim().length < 2) throw new Error(tr('v_name'));
        r = await api.post('/api/customers', {
          name: username.trim(),
          username: username.trim(),
          password,
          wilaya,
          fp: getFp(),
          hw: getHw(),
        });
      } else {
        r = await api.post('/api/auth', { type: 'customer', username: username.trim(), password });
      }
      setCustomer({ token: r.token, id: r.customer.id, name: r.customer.name, username: r.customer.username });
      toast('success', `${tr('hello')}, ${r.customer.name}!`);
      hapticNotify('success');
      onSuccess?.();
    } catch (e: any) {
      setErr(e.message || 'Error');
      hapticNotify('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-soft/60 rounded-3xl overflow-hidden" key={lang}>
      <div className="grid grid-cols-2 p-1.5 gap-1.5 bg-soft">
        {(['register', 'login'] as const).map((x) => (
          <button
            key={x}
            onClick={() => {
              setTab(x);
              setErr('');
            }}
            className={`py-2.5 rounded-2xl text-sm font-bold transition ${tab === x ? 'bg-card shadow text-ink' : 'text-mut'}`}
          >
            {x === 'register' ? tr('tab_register') : tr('tab_login')}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="p-4 space-y-3">
        {/* Name is the login + registration identity (phone removed globally) */}
        <div className="relative">
          <UserRound size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-mut" />
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={tr('ph_name')} className={`${inputCls} ps-9 bg-card`} autoComplete="name" />
        </div>
        {tab === 'register' && (
          <div className="grid grid-cols-1 gap-2.5">
            <select value={wilaya} onChange={(e) => setWilaya(e.target.value)} className={`${inputCls} bg-card font-semibold`}>
              <option value="">{tr('ph_wilaya')}</option>
              {WILAYAS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="relative">
          <input
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={tab === 'register' ? tr('ph_pass_new') : tr('ph_password')}
            className={`${inputCls} pe-11 bg-card`}
            autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
          />
          <button type="button" onClick={() => setShowPass((s) => !s)} className="absolute end-3 top-1/2 -translate-y-1/2 text-mut hover:text-ink transition" aria-label="Toggle password">
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {err && <p className="text-xs font-semibold text-red-500">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-3.5 rounded-2xl tg-btn font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
          {tab === 'register' ? tr('cust_register') : tr('submit_login')}
        </button>
      </form>
    </div>
  );
}

/** Standalone modal wrapper around the retail auth form. */
export default function CustomerAuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tr } = useApp();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            onClick={(e: any) => e.stopPropagation()}
            className="w-[min(94vw,420px)] bg-card border border-line rounded-3xl p-5 shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="w-10 h-10 rounded-xl bg-acc/10 text-acc flex items-center justify-center shrink-0">
                <Lock size={17} />
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="font-extrabold text-base leading-tight">{tr('cust_login_title')}</h3>
                <p className="text-[11px] text-mut leading-snug">{tr('cust_need_login')}</p>
              </div>
              <button onClick={onClose} className="p-2 rounded-full bg-soft text-mut hover:text-ink transition shrink-0" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <CustomerAuthForm onSuccess={onClose} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
