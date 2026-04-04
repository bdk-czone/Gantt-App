import React from 'react';
import { Search, Sparkles } from 'lucide-react';
import { getAppearanceIconOption, ICON_GROUPS, type AppearanceIconOption, withAlpha } from '../lib/appearance';

interface IconPickerProps {
  value: string;
  color: string;
  onChange: (value: string) => void;
}

function matchesQuery(option: AppearanceIconOption, query: string) {
  if (!query) return true;
  return option.keywords.some((keyword) => keyword.includes(query));
}

const IconPicker: React.FC<IconPickerProps> = ({ value, color, onChange }) => {
  const [query, setQuery] = React.useState('');
  const [activeGroup, setActiveGroup] = React.useState('all');

  const normalizedQuery = query.trim().toLowerCase();
  const selectedOption = getAppearanceIconOption(value, 'folder-kanban');

  const visibleGroups = React.useMemo(
    () =>
      ICON_GROUPS.map((group) => ({
        ...group,
        options: group.options.filter(
          (option) => (activeGroup === 'all' || group.id === activeGroup) && matchesQuery(option, normalizedQuery)
        ),
      })).filter((group) => group.options.length > 0),
    [activeGroup, normalizedQuery]
  );

  const selectedGlow = withAlpha(color, 0.24);
  const selectedSurface = `linear-gradient(145deg, ${withAlpha(color, 0.18)} 0%, rgba(255,255,255,0.98) 100%)`;

  return (
    <div className="space-y-3">
      <div
        className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]"
        style={{ backgroundImage: `radial-gradient(circle at top right, ${withAlpha(color, 0.14)} 0%, rgba(255,255,255,0) 38%)` }}
      >
        <div className="border-b border-slate-200/80 px-4 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div
                className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.35rem] border border-white/70 shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                style={{
                  background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.95) 0%, ${withAlpha(color, 0.16)} 48%, ${withAlpha(color, 0.28)} 100%)`,
                  boxShadow: `0 18px 36px ${selectedGlow}`,
                }}
              >
                <div
                  className="absolute inset-2 rounded-[1rem] blur-2xl"
                  style={{ background: `radial-gradient(circle, ${withAlpha(color, 0.22)} 0%, rgba(255,255,255,0) 75%)` }}
                />
                <selectedOption.Icon size={28} color={color} strokeWidth={1.9} absoluteStrokeWidth className="relative z-10" />
              </div>
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <Sparkles size={12} className="text-sky-500" />
                  Icon Studio
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-900">{selectedOption.label}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {ICON_GROUPS.reduce((sum, group) => sum + group.options.length, 0)} polished icons across {ICON_GROUPS.length} categories.
                </p>
              </div>
            </div>

            <label className="relative block w-full lg:max-w-xs">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search icons"
                className="w-full rounded-xl border border-slate-300 bg-white/95 py-2.5 pl-10 pr-3 text-sm outline-none transition-colors focus:border-blue-500"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[{ id: 'all', label: 'All icons' }, ...ICON_GROUPS.map((group) => ({ id: group.id, label: group.label }))].map((group) => {
              const selected = activeGroup === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroup(group.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                    selected
                      ? 'border-slate-900 text-slate-950 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                  style={selected ? { background: selectedSurface } : undefined}
                >
                  {group.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-h-[26rem] overflow-y-auto px-4 py-4">
          {visibleGroups.length === 0 ? (
            <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-400">
              No icons match that search.
            </div>
          ) : (
            <div className="space-y-4">
              {visibleGroups.map((group) => (
                <section key={group.id} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{group.label}</h4>
                    <span className="text-[11px] text-slate-400">{group.options.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {group.options.map((option) => {
                      const selected = value === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onChange(option.value)}
                          className={`group relative overflow-hidden rounded-[1.1rem] border p-3 text-left transition-all ${
                            selected
                              ? 'border-slate-900 shadow-[0_16px_34px_rgba(15,23,42,0.12)]'
                              : 'border-slate-200 bg-white hover:-translate-y-[1px] hover:border-slate-300 hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]'
                          }`}
                          style={selected ? { background: selectedSurface, boxShadow: `0 16px 34px ${selectedGlow}` } : undefined}
                          title={option.label}
                        >
                          <div
                            className="absolute inset-x-0 top-0 h-16 opacity-70"
                            style={{ background: `radial-gradient(circle at top, ${withAlpha(color, selected ? 0.2 : 0.1)} 0%, rgba(255,255,255,0) 72%)` }}
                          />
                          <div className="relative flex h-full flex-col justify-between gap-3">
                            <span
                              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/70 shadow-sm"
                              style={{
                                background: selected ? withAlpha(color, 0.18) : 'rgba(248,250,252,0.95)',
                                boxShadow: selected ? `0 10px 24px ${withAlpha(color, 0.2)}` : undefined,
                              }}
                            >
                              <option.Icon size={18} color={color} strokeWidth={1.9} absoluteStrokeWidth />
                            </span>
                            <div>
                              <p className="truncate text-sm font-semibold text-slate-900">{option.label}</p>
                              <p className="mt-1 truncate text-[11px] uppercase tracking-[0.14em] text-slate-400">{group.label}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IconPicker;
