import React from 'react';
import { Check, Edit2, Plus, X } from 'lucide-react';
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

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(148, 163, 184, ${alpha})`;
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
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
  const option = getStatusOption(status, {
    statuses: options ?? [],
    customFields: [],
    columnLabels: DEFAULT_COLUMN_LABELS,
    columnOrder: DEFAULT_COLUMN_ORDER,
    savedViews: [],
  });
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  React.useEffect(() => {
    if (open) return;
    setSearchQuery('');
    setEditingValue(null);
    setDraftLabel('');
    setDraftColor('#2563EB');
    setSaving(false);
  }, [open]);

  const backgroundColor = hexToRgba(option.color, 0.12);
  const optionList = options && options.length > 0 ? options : [option];
  const filteredOptions = optionList.filter((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase()));

  const openEditor = (nextValue: string | 'new', nextLabel: string, nextColor: string) => {
    setEditingValue(nextValue);
    setDraftLabel(nextLabel);
    setDraftColor(nextColor);
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
    return (
      <span
        className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ backgroundColor, color: option.color }}
      >
        {option.label}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((current) => !current)}
        className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80"
        style={{ backgroundColor, color: option.color }}
      >
        {option.label}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Status</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          </div>

          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search statuses"
            className="mb-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500"
          />

          <div className="max-h-64 space-y-1 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-400">
                No statuses match that search.
              </div>
            ) : (
              filteredOptions.map((nextOption) => (
                <div
                  key={nextOption.value}
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-gray-50"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onChange?.(nextOption.value);
                      setOpen(false);
                    }}
                    className="flex flex-1 items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-left"
                  >
                    <span
                      className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide"
                      style={{
                        backgroundColor: hexToRgba(nextOption.color, 0.14),
                        color: nextOption.color,
                      }}
                    >
                      {nextOption.label}
                    </span>
                    {nextOption.value === option.value && <Check size={16} className="text-gray-700" />}
                  </button>
                  {(onEditOption || onAddOption) && (
                    <button
                      type="button"
                      onClick={() => openEditor(nextOption.value, nextOption.label, nextOption.color)}
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                      title="Edit status"
                    >
                      <Edit2 size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {(onEditOption || onAddOption) && (
            <>
              <button
                type="button"
                onClick={() => openEditor('new', '', option.color)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
              >
                <Plus size={14} />
                Add new status
              </button>

              {editingValue !== null ? (
                <div className="mt-3 rounded-2xl border border-gray-200 bg-slate-50 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800">
                      {editingValue === 'new' ? 'New status' : 'Edit status'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingValue(null);
                        setDraftLabel('');
                        setDraftColor('#2563EB');
                      }}
                      className="rounded-full p-1 text-gray-400 transition-colors hover:bg-white hover:text-gray-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <input
                      value={draftLabel}
                      onChange={(event) => setDraftLabel(event.target.value)}
                      placeholder="Status name"
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500"
                    />
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600">
                      Color
                      <input
                        type="color"
                        value={draftColor}
                        onChange={(event) => setDraftColor(event.target.value)}
                        className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                    </label>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingValue(null);
                          setDraftLabel('');
                        }}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving || !draftLabel.trim()}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : editingValue === 'new' ? 'Add status' : 'Save changes'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default StatusPill;
