import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, Loader2, Pencil, UploadCloud, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { EditRequest } from '../context/AppContext';
import { api, fileToBase64, fileToDataUrl } from '../lib/api';
import { beaconProductUpdated } from '../lib/tgBeacon';

type Req = Omit<EditRequest, 'value'>;

/** Inline-editable text / price. In Super Edit mode a click opens the editor modal. */
export function Edt({
  req,
  value,
  className = '',
  children,
}: {
  req: Req;
  value: string;
  className?: string;
  children?: ReactNode;
}) {
  const { editMode, requestEdit } = useApp();
  if (!editMode) return <span className={className}>{children ?? value}</span>;
  return (
    <span
      role="button"
      title={`Edit: ${req.label}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        requestEdit({ ...req, value });
      }}
      className={`editable-target relative cursor-pointer ${className}`}
    >
      {children ?? value}
      <Pencil size={10} className="absolute -top-2.5 -right-3 text-acc" />
    </span>
  );
}

/** Inline-editable image. In Super Edit mode a click opens the image picker. */
export function EdtImage({
  req,
  src,
  alt = '',
  className = '',
  imgClassName = '',
}: {
  req: Req;
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
}) {
  const { editMode, requestEdit } = useApp();
  return (
    <div
      className={`relative overflow-hidden ${className} ${editMode ? 'editable-target cursor-pointer' : ''}`}
      onClick={
        editMode
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              requestEdit({ ...req, value: src });
            }
          : undefined
      }
    >
      <img src={src} alt={alt} loading="lazy" className={imgClassName} />
      {editMode && (
        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1 text-white pointer-events-none">
          <ImagePlus size={22} />
          <span className="text-[11px] font-bold tracking-wide">TAP TO CHANGE</span>
        </div>
      )}
    </div>
  );
}

/** Global floating editor — rendered once from the layout. */
export function EditModal() {
  const { editRequest, clearEditRequest, saveContent, adminToken, bumpProducts, toast } = useApp();
  const [val, setVal] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (editRequest) {
      setVal(editRequest.value);
      setFile(null);
      setPreview(editRequest.type === 'image' ? editRequest.value : '');
      setErr('');
    }
  }, [editRequest]);

  const save = async () => {
    if (!editRequest) return;
    setBusy(true);
    setErr('');
    try {
      let finalVal = val;
      if (editRequest.type === 'image') {
        if (!file) throw new Error('Choose an image first');
        const base64 = await fileToBase64(file);
        const bucket = editRequest.kind === 'product' ? 'products' : 'content';
        const up = await api.post<{ url: string }>(
          '/api/upload',
          { bucket, fileName: file.name, fileBase64: base64, contentType: file.type },
          adminToken
        );
        finalVal = up.url;
      }
      if (editRequest.type === 'price') {
        const n = Number(finalVal);
        if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a valid price in DZD');
        finalVal = String(Math.round(n));
      }
      if (editRequest.kind === 'content') {
        await saveContent(editRequest.ckey!, finalVal);
      } else {
        const payload: Record<string, unknown> = { id: editRequest.productId };
        payload[editRequest.field!] = editRequest.type === 'price' ? Number(finalVal) : finalVal;
        const r = await api.put<any>('/api/products', payload, adminToken);
        bumpProducts();
        // Instant CORS-proof confirmation fallback if the server-side bot send did not confirm
        if (!r?.alert_sent) beaconProductUpdated(editRequest.label, [editRequest.field!]);
      }
      toast('success', 'Saved instantly');
      clearEditRequest();
    } catch (e: any) {
      setErr(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {editRequest && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3"
          onClick={clearEditRequest}
        >
          <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            onClick={(e: any) => e.stopPropagation()}
            className="w-[min(94vw,440px)] bg-card border border-line rounded-3xl p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-extrabold tracking-widest text-acc">SUPER EDIT</p>
                <h3 className="font-bold text-base leading-tight">{editRequest.label}</h3>
              </div>
              <button
                onClick={clearEditRequest}
                className="p-2 rounded-full bg-soft text-mut hover:text-ink transition"
                aria-label="Close editor"
              >
                <X size={16} />
              </button>
            </div>

            {editRequest.type === 'text' && (
              <input
                autoFocus
                value={val}
                onChange={(e) => setVal(e.target.value)}
                className="w-full bg-soft border border-line rounded-xl px-3.5 py-3 text-sm outline-none focus:border-acc transition"
                placeholder="Type new text…"
              />
            )}

            {editRequest.type === 'textarea' && (
              <textarea
                autoFocus
                rows={5}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                className="w-full bg-soft border border-line rounded-xl px-3.5 py-3 text-sm outline-none focus:border-acc transition resize-none"
                placeholder="Type new text…"
              />
            )}

            {editRequest.type === 'price' && (
              <div className="relative">
                <input
                  autoFocus
                  inputMode="numeric"
                  value={val}
                  onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full bg-soft border border-line rounded-xl px-3.5 py-3 pr-16 text-lg font-extrabold outline-none focus:border-acc transition"
                  placeholder="0"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gold">DZD</span>
              </div>
            )}

            {editRequest.type === 'image' && (
              <div className="space-y-3">
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-line rounded-2xl p-5 cursor-pointer hover:border-acc transition text-mut">
                  <UploadCloud size={24} />
                  <span className="text-xs font-semibold">{file ? file.name : 'Tap to choose a new image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0] || null;
                      setFile(f);
                      if (f) setPreview(await fileToDataUrl(f));
                    }}
                  />
                </label>
                {preview && (
                  <img src={preview} alt="preview" className="w-full max-h-44 object-cover rounded-xl border border-line" />
                )}
              </div>
            )}

            {err && <p className="mt-3 text-xs font-semibold text-red-500">{err}</p>}

            <div className="mt-5 flex gap-2">
              <button
                onClick={clearEditRequest}
                className="flex-1 py-3 rounded-xl bg-soft text-sm font-bold text-mut hover:text-ink transition"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="flex-1 py-3 rounded-xl tg-btn text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                Save now
              </button>
            </div>
            <p className="mt-2.5 text-center text-[10px] text-mut">Instantly written to the database — no code changes.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
