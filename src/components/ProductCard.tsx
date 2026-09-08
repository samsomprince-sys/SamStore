import { motion } from 'framer-motion';
import { Boxes, Package, ShoppingCart } from 'lucide-react';
import type { Product } from '../lib/types';
import { fmtDZD } from '../lib/format';
import { useApp } from '../context/AppContext';
import { Edt, EdtImage } from './Editable';

export default function ProductCard({
  p,
  onBuy,
  wholesale = false,
  discountPct = 0,
}: {
  p: Product;
  onBuy: () => void;
  wholesale?: boolean;
  discountPct?: number;
}) {
  const { tr } = useApp();
  const out = p.stock <= 0;
  const showDisc = !wholesale && discountPct > 0;
  const display = showDisc ? Math.max(1, Math.round(p.price_dzd * (1 - discountPct / 100))) : p.price_dzd;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', damping: 22, stiffness: 260 }}
      className="relative bg-card border border-line rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow flex flex-col"
    >
      {showDisc && (
        <span className="absolute top-2 start-2 z-10 bg-red-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow">
          −{discountPct}%
        </span>
      )}
      <EdtImage
        req={{ kind: 'product', type: 'image', label: `Image — ${p.name}`, productId: p.id, field: 'image_url' }}
        src={p.image_url}
        alt={p.name}
        className="aspect-[3/2] bg-soft"
        imgClassName="w-full h-full object-cover"
      />
      <div className="p-3.5 md:p-4 flex flex-col gap-2 grow">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="px-2 py-0.5 rounded-full bg-acc/10 text-acc font-bold truncate">{p.category}</span>
          <span className={`flex items-center gap-1 font-semibold shrink-0 ${out ? 'text-red-500' : 'text-mut'}`}>
            <Package size={12} />
            {out ? tr('out_of_stock') : `${p.stock} ${tr('left_suffix')}`}
          </span>
        </div>
        <h3 className="font-bold text-[14.5px] leading-snug text-ink">
          <Edt req={{ kind: 'product', type: 'text', label: 'Product name', productId: p.id, field: 'name' }} value={p.name} />
        </h3>
        <p className="text-mut text-xs leading-relaxed line-clamp-2">
          <Edt
            req={{ kind: 'product', type: 'textarea', label: 'Description', productId: p.id, field: 'description' }}
            value={p.description}
          />
        </p>
        {wholesale && (
          <div className="text-[11px] text-mut flex items-center gap-1 font-semibold">
            <Boxes size={12} /> {tr('min_order')} {p.min_qty}
          </div>
        )}
        <div className="mt-auto pt-1.5 flex items-center justify-between gap-2">
          <div className="text-[17px] font-extrabold text-gold tracking-tight">
            <Edt
              req={{ kind: 'product', type: 'price', label: 'Price (DZD)', productId: p.id, field: 'price_dzd' }}
              value={String(p.price_dzd)}
            >
              {fmtDZD(display)}
            </Edt>
            {showDisc && (
              <span className="block text-[10.5px] font-semibold text-mut line-through">{fmtDZD(p.price_dzd)}</span>
            )}
          </div>
          <button
            disabled={out}
            onClick={onBuy}
            className="tg-btn disabled:opacity-40 px-4 py-2 rounded-xl text-[13px] font-bold flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <ShoppingCart size={15} />
            {tr('buy')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
