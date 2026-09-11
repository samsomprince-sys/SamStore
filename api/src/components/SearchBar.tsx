import { Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { tr } = useApp();
  return (
    <div className="relative">
      <Search size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-mut pointer-events-none" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={tr('search_placeholder')}
        className="w-full bg-card border border-line rounded-2xl ps-10 pe-10 py-3 text-sm outline-none focus:border-acc transition shadow-sm placeholder:text-mut/70"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute end-3 top-1/2 -translate-y-1/2 text-mut hover:text-ink transition"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
