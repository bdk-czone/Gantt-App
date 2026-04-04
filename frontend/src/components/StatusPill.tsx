import React from 'react';
import { Check, ChevronDown, Edit2, Plus, X } from 'lucide-react';
import type { StatusOption, TaskStatus } from '../types';
import { DEFAULT_COLUMN_LABELS, DEFAULT_COLUMN_ORDER, getStatusOption } from '../lib/projectSettings';

interface StatusPillProps {
  status: TaskStatus;
  options?: StatusOption[];
  editable?: boolean;
  onChange?: (status: TaskStatus) => void;
  onAddOption?: (option: StatusOption) => Promise<void>;
  onEditOption?: (value: string, updates: Pick<StatusOption, 'label' | 'color'>) => Promise<void>;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return { red: 148, green: 163, blue: 184 };
  }
  return {
    red: parseInt(normalized.slice(0, 2), 16),
    green: parseInt(normalized.slice(2, 4), 16),
    blue: parseInt(normalized.slice(4, 6), 16),
  };
}

function hexToRgba(hex: string, alpha: number) {
  const { red, green, blue } = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function toStatusValue(label: string) {
  return (
    label
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'CUSTOM_STATUS'
  );
}

const StatusChip: React.FC<{
  label: string;
  color: string;
  active?: boolean;
  editable?: boolean;
}> = ({ label, color, active = false, editable = false }) => {
  const borderColor = active ? hexToRgba(color, 0.34) : hexToRgba(color, 0.22);
  const background = active
    ? `linear-gradient(135deg, ${hexToRgba(color, 0.2)} 0%, ${hexToRgba(color, 0.08)} 100%)`
    : `linear-gradient(135deg, ${hexToRgba(color, 0.14)} 0%, ${hexToRgba(color, 0.05)} 100%)`;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em] shadow-sm ${
        editable ? 'pr-2' : ''
      }`}
      style={{
        color,
        borderColor,
        background,
        boxShadow: `inset 0 1px 0 ${hexToRgba('#ffffff', 0.45)}`,
      }}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 0 4px ${hexToRgba(color, 0.14)}` }}
      />
      <span className="truncate">{label}</span>
      {editable ? <ChevronDown size={12} className="shrink-0 opacity-70" /> : null}
    </span>
  );
};

const StatusPill: React.FC<StatusPillProps> = ({
  status,
  options,
  editable = false,
  onChange,
  onAddOption,
  onEditOption,
}) => {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [editingValue, setEditingValue] = React.useState<string | 'new' | null>(null);
  const [draftLabel, setDraftLabel] = React.useState('');
  const [draftColor, setDraftColor] = React.useState('#2563EB');
  const [saving, setSaving] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const draftLabelInputRef = React.useRef<HTMLInputElement>(null);
  const option = getStatusOption(status, {
    statuses: options ?? [],
    customFields: [],
    columnLabels: DEFAULT_COLUMN_LABELS,
    columnOrder: DEFAULT_COLUMN_ORDER,
    savedViews: [],
  });

  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) return;
    setSearchQuery('');
    setEditingValue(null);
    setDraftLabel('');
    setDraftColor('#2563EB');
    setSaving(false);
  }, [open]);

  React.useEffect(() => {
    if (editingValue === null) return;
    window.setTimeout(() => draftLabelInputRef.current?.focus(), 0);
  }, [editingValue]);

  const optionList = options && options.length > 0 ? options : [option];
  const filteredOptions = optionList.filter((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase()));

  const openEditor = (nextValue: string | 'new', nextLabel: string, nextColor: string) => {
    setSearchQuery('');
    setEditingValue(nextValue);
    setDraftLabel(nextLabel);
    setDraftColor(nextColor);
  };

  const resetEditor = () => {
    setEditingValue(null);
    setDraftLabel('');
    setDraftColor('#2563EB');
  };

  const handleSave = async () => {
    const trimmedLabel = draftLabel.trim();
    if (!trimmedLabel) return;

    setSaving(true);
    try {
      if (editingValue === 'new') {
        const baseValue = toStatusValue(trimmedLabel);
        let nextValue = baseValue;
        let suffix = 2;
        while (optionList.some((item) => item.value === nextValue)) {
          nextValue = `${baseValue}_${suffix}`;
          suffix += 1;
        }
        await onAddOption?.({
          value: nextValue,
          label: trimmedLabel,
          color: draftColor,
        });
      } else {
        await onEditOption?.(editingValue as string, {
          label: trimmedLabel,
          color: draftColor,
        });
      }
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editable) {
    return <StatusChip label={option.label} color={option.color} />;
  }

  return (
    <div ref={ref} className="relative inline-flex max-w-full">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="group inline-flex max-w-full rounded-full transition-transform hover:-translate-y-[1px]"
      >
        <StatusChip label={option.label} color={option.color} active={open} editable />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-[1.25rem] border border-slate-200 bg-white p-3 shadow-2xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Update status</p>
              <p className="mt-1 text-xs text-slate-500">Pick a status or adjust the status set for this project.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current</p>
            <StatusChip label={option.label} color={option.color} active />
          </div>

          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search statuses"
            className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500"
          />

          {editingValue !== null ? (
            <div className="mt-3 rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{editingValue === 'new' ? 'New status' : 'Edit status'}</p>
                  <p className="mt-1 text-xs text-slate-500">Choose a label and color for the status pill.</p>
                </div>
                <button
                  type="button"
                  onClick={resetEditor}
                  className="rounded-full p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="space-y-3">
                <input
                  ref={draftLabelInputRef}
                  value={draftLabel}
                  onChange={(event) => setDraftLabel(event.target.value)}
                  placeholder="Status name"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500"
                />
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
                  Color
                  <input
                    type="color"
                    value={draftColor}
                    onChange={(event) => setDraftColor(event.target.value)}
                    className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                </label>
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Preview</p>
                  <StatusChip label={draftLabel.trim() || 'Status preview'} color={draftColor} active />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={resetEditor}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving || !draftLabel.trim()}
                    className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : editingValue === 'new' ? 'Add status' : 'Save changes'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {filteredOptions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-400">
                No statuses match that search.
              </div>
            ) : (
              filteredOptions.map((nextOption) => {
                const selected = nextOption.value === option.value;
                return (
                  <div
                    key={nextOption.value}
                    className={`flex items-center gap-2 rounded-2xl border px-2 py-2 transition-colors ${
                      selected ? 'border-blue-200 bg-blue-50/70' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onChange?.(nextOption.value);
                        setOpen(false);
                      }}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-1 py-1 text-left"
                    >
                      <div className="min-w-0">
                        <StatusChip label={nextOption.label} color={nextOption.color} active={selected} />
                      </div>
                      {selected ? <Check size={16} className="shrink-0 text-blue-700" /> : null}
                    </button>
                    {onEditOption || onAddOption ? (
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openEditor(nextOption.value, nextOption.label, nextOption.color);
                        }}
                        className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        title="Edit status"
                      >
                        <Edit2 size={14} />
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          {onEditOption || onAddOption ? (
            <button
              type="button"
              onClick={() => openEditor('new', '', option.color)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <Plus size={14} />
              Add new status
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default StatusPill;
