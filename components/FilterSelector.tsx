'use client';

import { FILTERS, FilterId } from '@/lib/filters';

type Props = {
  active: FilterId;
  onSelect: (id: FilterId) => void;
  allowed?: FilterId[];
};

export default function FilterSelector({ active, onSelect, allowed }: Props) {
  const visible = allowed ? FILTERS.filter((f) => allowed.includes(f.id)) : FILTERS;
  return (
    <div className="w-full">
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 py-3">
        {visible.map((f) => {
          const isActive = f.id === active;
          return (
            <button
              key={f.id}
              onClick={() => onSelect(f.id)}
              className={[
                'shrink-0 rounded-full px-4 py-2 text-xs uppercase tracking-widest transition-all',
                'border',
                isActive
                  ? 'bg-gold text-cream border-gold'
                  : 'bg-black/30 text-cream/85 border-cream/20 backdrop-blur-sm',
              ].join(' ')}
              aria-pressed={isActive}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
