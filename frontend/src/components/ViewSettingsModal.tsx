import React from 'react';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  CalendarRange,
  ChevronRight,
  Columns,
  Filter,
  Hash,
  Layers3,
  Link2,
  List,
  Plus,
  Search,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import type { BuiltInColumnEditorType, CustomFieldDefinition, ProjectSettings, StatusOption, ViewPersistenceSettings } from '../types';
import { updateList } from '../api';
import { CUSTOM_FIELD_TYPE_OPTIONS, getColumnTypeLabel } from '../lib/customFields';
import {
  DEFAULT_BUILT_IN_COLUMN_TYPES,
  DEFAULT_COLUMN_LABELS,
  DEFAULT_STATUSES,
  DEFAULT_VIEW_PERSISTENCE,
  normalizeProjectSettings,
  parseProjectDateValue,
  resolveColumnOrder,
  resolveProjectSchedule,
} from '../lib/projectSettings';
import ColorPicker from './ColorPicker';
import DatePicker from './DatePicker';

interface ViewSettingsModalProps {
  project: {
    id: string;
    name: string;
    start_date?: string | null;
    end_date?: string | null;
    settings: ProjectSettings | null;
  };
  onClose: () => void;
  onSaved: () => void;
}

type DrawerPanel = 'overview' | 'fields' | 'statuses' | 'layout' | 'schedule' | 'views' | 'filter' | 'group';
type FieldPanelTab = 'create' | 'existing';

const FIELD_TYPE_META: Record<string, { token: string; description: string }> = {
  text: { token: 'Aa', description: 'Single-line notes, owners, or labels.' },
  number: { token: '#', description: 'Quantities, effort, or numeric estimates.' },
  date: { token: 'D', description: 'Standalone due dates and checkpoints.' },
  select: { token: '≡', description: 'Controlled dropdown values.' },
  checkbox: { token: '✓', description: 'Simple yes or no states.' },
  url: { token: '↗', description: 'Reference links and external docs.' },
  progress: { token: '%', description: 'Progress bars and completion values.' },
  status: { token: 'S', description: 'Status pills with text labels.' },
  status_bar: { token: 'SB', description: 'Compact status bar visuals.' },
  start_date: { token: 'SD', description: 'Project-driven start dates.' },
  end_date: { token: 'ED', description: 'Project-driven finish dates.' },
};

const BUILT_IN_ROW_ORDER = Object.keys(DEFAULT_COLUMN_LABELS);

function toMachineValue(label: string) {
  return (
    label
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'CUSTOM_STATUS'
  );
}

function ColumnTypePreview({ type, label }: { type: string; label: string }) {
  if (type === 'progress') {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-slate-500">
          <span>Preview</span>
          <span>62%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-[62%] rounded-full bg-blue-500" />
        </div>
      </div>
    );
  }

  if (type === 'status' || type === 'status_bar') {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <p className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">Preview</p>
        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">In Progress</span>
      </div>
    );
  }

  if (type === 'date' || type === 'start_date' || type === 'end_date') {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <p className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">Preview</p>
        <div className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] text-slate-500">2026-04-28</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      <p className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">Preview</p>
      <div className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] text-slate-500">{label || 'Example content'}</div>
    </div>
  );
}

const SwitchRow: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
}> = ({ label, description, checked, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className="flex w-full items-center justify-between gap-2.5 overflow-hidden rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-slate-50"
  >
    <div className="min-w-0 flex-1">
      <p className="text-[13px] font-medium text-slate-900">{label}</p>
      {description && <p className="mt-0.5 break-words text-[11px] leading-4 text-slate-500">{description}</p>}
    </div>
    <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-200'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </span>
  </button>
);

const NavigationRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  badge: string;
  onClick: () => void;
}> = ({ icon, label, badge, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-2.5 overflow-hidden rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
  >
    <span className="shrink-0 rounded-lg bg-slate-100 p-1.5 text-slate-700">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-[13px] font-medium text-slate-900">{label}</span>
      <span className="block break-words text-[11px] leading-4 text-slate-500">{badge}</span>
    </span>
    <ChevronRight size={16} className="shrink-0 text-slate-400" />
  </button>
);

const ViewSettingsModal: React.FC<ViewSettingsModalProps> = ({ project, onClose, onSaved }) => {
  const initialSettings = React.useMemo(() => normalizeProjectSettings(project.settings), [project.settings]);
  const initialSchedule = React.useMemo(
    () => resolveProjectSchedule(project.start_date, project.end_date, project.settings),
    [project.end_date, project.settings, project.start_date]
  );
  const initialColumnLabels = React.useMemo(
    () =>
      Object.fromEntries(
        Object.entries(initialSettings.columnLabels).map(([key, value]) => {
          if ((key === 'start_date' || key === 'end_date') && parseProjectDateValue(value)) {
            return [key, DEFAULT_COLUMN_LABELS[key] || key];
          }
          return [key, value];
        })
      ),
    [initialSettings.columnLabels]
  );

  const [panel, setPanel] = React.useState<DrawerPanel>('overview');
  const [fieldTab, setFieldTab] = React.useState<FieldPanelTab>('create');
  const [fieldSearch, setFieldSearch] = React.useState('');
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [columnLabels, setColumnLabels] = React.useState<Record<string, string>>(initialColumnLabels);
  const [projectStartDate, setProjectStartDate] = React.useState<string | null>(initialSchedule.startDate);
  const [projectEndDate, setProjectEndDate] = React.useState<string | null>(initialSchedule.endDate);
  const [statuses, setStatuses] = React.useState<StatusOption[]>(initialSettings.statuses);
  const [customFields, setCustomFields] = React.useState<CustomFieldDefinition[]>(initialSettings.customFields);
  const [columnOrder, setColumnOrder] = React.useState<string[]>(initialSettings.columnOrder);
  const [savedViews, setSavedViews] = React.useState(initialSettings.savedViews);
  const [hiddenBuiltInColumns, setHiddenBuiltInColumns] = React.useState<string[]>(initialSettings.hiddenBuiltInColumns ?? []);
  const [builtInColumnTypes, setBuiltInColumnTypes] = React.useState<Record<string, BuiltInColumnEditorType>>(
    initialSettings.builtInColumnTypes as Record<string, BuiltInColumnEditorType>
  );
  const [viewPersistence, setViewPersistence] = React.useState<ViewPersistenceSettings>({
    ...DEFAULT_VIEW_PERSISTENCE,
    ...(initialSettings.viewPersistence ?? {}),
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setColumnOrder((current) => resolveColumnOrder(current, customFields));
  }, [customFields]);

  const orderedColumnItems = React.useMemo(
    () =>
      resolveColumnOrder(columnOrder, customFields).map((columnId) => {
        const customFieldId = columnId.startsWith('custom:') ? columnId.slice('custom:'.length) : null;
        const customField = customFieldId ? customFields.find((field) => field.id === customFieldId) : null;

        return {
          id: columnId,
          label: customField ? customField.name || 'Untitled custom field' : columnLabels[columnId] || DEFAULT_COLUMN_LABELS[columnId] || columnId,
          typeLabel: customField ? getColumnTypeLabel(customField.type) : getColumnTypeLabel(builtInColumnTypes[columnId] ?? DEFAULT_BUILT_IN_COLUMN_TYPES[columnId as keyof typeof DEFAULT_BUILT_IN_COLUMN_TYPES]),
        };
      }),
    [builtInColumnTypes, columnLabels, columnOrder, customFields]
  );

  const hiddenBuiltIns = React.useMemo(
    () =>
      BUILT_IN_ROW_ORDER.filter((key) => hiddenBuiltInColumns.includes(key)).map((key) => ({
        key,
        label: columnLabels[key] || DEFAULT_COLUMN_LABELS[key] || key,
      })),
    [columnLabels, hiddenBuiltInColumns]
  );

  const filteredFieldTypeOptions = React.useMemo(() => {
    const query = fieldSearch.trim().toLowerCase();
    return CUSTOM_FIELD_TYPE_OPTIONS.filter((option) => {
      const meta = FIELD_TYPE_META[option.value];
      return query.length === 0 || option.label.toLowerCase().includes(query) || meta?.description.toLowerCase().includes(query);
    });
  }, [fieldSearch]);

  const moveColumn = (columnId: string, direction: -1 | 1) => {
    setColumnOrder((current) => {
      const resolved = resolveColumnOrder(current, customFields);
      const index = resolved.indexOf(columnId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= resolved.length) return resolved;
      const next = [...resolved];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const toggleBuiltInColumnVisibility = (columnKey: string) => {
    setHiddenBuiltInColumns((current) =>
      current.includes(columnKey) ? current.filter((item) => item !== columnKey) : [...current, columnKey]
    );
  };

  const addCustomField = (type: CustomFieldDefinition['type']) => {
    const label = CUSTOM_FIELD_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? 'Field';
    setCustomFields((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `New ${label}`,
        type,
        options: type === 'select' ? ['Option 1'] : undefined,
      },
    ]);
    setPanel('fields');
    setFieldTab('existing');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      setCopiedLink(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    if (projectStartDate && projectEndDate && projectStartDate > projectEndDate) {
      setError('Project start date must be on or before the end date.');
      setSaving(false);
      return;
    }

    try {
      const sanitizedCustomFields = customFields
        .filter((field) => field.name.trim())
        .map((field) => ({
          ...field,
          options: field.type === 'select' ? (field.options ?? []).filter((option) => option.trim()) : undefined,
        }));

      const sanitizedColumnLabels = Object.fromEntries(
        Object.entries(columnLabels).map(([key, value]) => {
          const trimmedValue = value.trim() || DEFAULT_COLUMN_LABELS[key] || key;
          if ((key === 'start_date' || key === 'end_date') && parseProjectDateValue(trimmedValue)) {
            return [key, DEFAULT_COLUMN_LABELS[key] || key];
          }
          return [key, trimmedValue];
        })
      );

      await updateList(project.id, {
        start_date: projectStartDate,
        end_date: projectEndDate,
        settings: {
          ...initialSettings,
          statuses:
            statuses
              .filter((status) => status.label.trim())
              .map((status) => ({
                ...status,
                value: toMachineValue(status.label),
              })) || DEFAULT_STATUSES,
          columnLabels: sanitizedColumnLabels,
          builtInColumnTypes,
          columnOrder: resolveColumnOrder(columnOrder, sanitizedCustomFields),
          customFields: sanitizedCustomFields,
          hiddenBuiltInColumns,
          savedViews: savedViews
            .filter((view) => view.name.trim())
            .map((view) => ({
              ...view,
              name: view.name.trim(),
            })),
          viewPersistence,
        },
      });
      window.dispatchEvent(new Event('myproplanner:project-settings-updated'));
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save view settings');
      setSaving(false);
    }
  };

  const panelTitle =
    panel === 'overview'
      ? 'Customize view'
      : panel === 'fields'
        ? 'Fields'
        : panel === 'statuses'
          ? 'Statuses'
          : panel === 'layout'
            ? 'Column layout'
            : panel === 'schedule'
              ? 'Project schedule'
              : panel === 'views'
                ? 'Saved views'
                : panel === 'filter'
                  ? 'Filter'
                  : 'Group';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-[32rem] flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {panel !== 'overview' && (
                <button
                  type="button"
                  onClick={() => setPanel('overview')}
                  className="mb-2 inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-500 transition-colors hover:bg-slate-50"
                >
                  <ArrowLeft size={12} />
                  Back
                </button>
              )}
              <h3 className="text-[1.35rem] font-semibold tracking-tight text-slate-900">{panelTitle}</h3>
              <p className="mt-1 text-[13px] text-slate-500">{project.name}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500 transition-colors hover:bg-slate-200">
              <X size={18} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-x-hidden overflow-y-auto px-4 py-4">
            {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            {panel === 'overview' && (
              <>
                <section className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">View selector</p>
                  <div className="flex items-center gap-2.5 overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                    <span className="shrink-0 rounded-lg bg-slate-100 p-1.5 text-slate-600">
                      <List size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-slate-800">Current view</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {savedViews.length > 0 ? `${savedViews.length} saved view${savedViews.length === 1 ? '' : 's'} available` : 'Unsaved view settings'}
                      </p>
                    </div>
                  </div>
                  <details className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">View options</p>
                        <p className="break-words text-xs text-slate-500">Autosave, pin, and privacy controls</p>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-slate-400" />
                    </summary>
                    <div className="border-t border-slate-100 px-2 py-2">
                      <SwitchRow
                        label="Autosave"
                        description="Keep this project’s current view preferences synced automatically."
                        checked={viewPersistence.autosave}
                        onToggle={() => setViewPersistence((current) => ({ ...current, autosave: !current.autosave }))}
                      />
                      <SwitchRow
                        label="Pin"
                        description="Treat this as a preferred default view setup."
                        checked={viewPersistence.pinned}
                        onToggle={() => setViewPersistence((current) => ({ ...current, pinned: !current.pinned }))}
                      />
                      <SwitchRow
                        label="Private"
                        description="Keep the saved view setup scoped to your own workspace defaults."
                        checked={viewPersistence.private}
                        onToggle={() => setViewPersistence((current) => ({ ...current, private: !current.private }))}
                      />
                    </div>
                  </details>
                </section>

                <section className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Show in this view</p>
                  <div className="rounded-[1.4rem] border border-slate-200 bg-white p-2">
                    {BUILT_IN_ROW_ORDER.filter((key) => key !== 'gantt_task').map((key) => (
                      <SwitchRow
                        key={key}
                        label={columnLabels[key] || DEFAULT_COLUMN_LABELS[key] || key}
                        description={getColumnTypeLabel(builtInColumnTypes[key] ?? DEFAULT_BUILT_IN_COLUMN_TYPES[key as keyof typeof DEFAULT_BUILT_IN_COLUMN_TYPES])}
                        checked={!hiddenBuiltInColumns.includes(key)}
                        onToggle={() => toggleBuiltInColumnVisibility(key)}
                      />
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Menu</p>
                  <div className="space-y-2">
                    <NavigationRow icon={<Columns size={16} />} label="Fields" badge={`${customFields.length} custom · ${hiddenBuiltIns.length} hidden built-ins`} onClick={() => setPanel('fields')} />
                    <NavigationRow icon={<Filter size={16} />} label="Filter" badge={`${savedViews.length} saved view preset${savedViews.length === 1 ? '' : 's'}`} onClick={() => setPanel('filter')} />
                    <NavigationRow icon={<Layers3 size={16} />} label="Group" badge="Manual ordering for now" onClick={() => setPanel('group')} />
                    <NavigationRow icon={<Hash size={16} />} label="Statuses" badge={`${statuses.length} statuses configured`} onClick={() => setPanel('statuses')} />
                    <NavigationRow icon={<CalendarRange size={16} />} label="Schedule" badge={`${projectStartDate || 'No start'} → ${projectEndDate || 'No end'}`} onClick={() => setPanel('schedule')} />
                    <NavigationRow icon={<List size={16} />} label="Saved views" badge={`${savedViews.length} saved`} onClick={() => setPanel('views')} />
                    <NavigationRow icon={<Columns size={16} />} label="Column layout" badge={`${orderedColumnItems.length} columns in order`} onClick={() => setPanel('layout')} />
                  </div>
                </section>
              </>
            )}

            {panel === 'fields' && (
              <>
                <section className="space-y-3">
                  <div className="flex items-center gap-3 rounded-[1.4rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <Search size={16} className="text-slate-400" />
                    <input
                      value={fieldSearch}
                      onChange={(e) => setFieldSearch(e.target.value)}
                      placeholder="Search for new or existing fields."
                      className="w-full bg-transparent text-sm text-slate-700 outline-none"
                    />
                  </div>

                  <div className="rounded-[1.2rem] bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setFieldTab('create')}
                      className={`rounded-[0.95rem] px-3 py-2 text-sm transition-colors ${fieldTab === 'create' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                    >
                      Create new
                    </button>
                    <button
                      type="button"
                      onClick={() => setFieldTab('existing')}
                      className={`rounded-[0.95rem] px-3 py-2 text-sm transition-colors ${fieldTab === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                    >
                      Add existing
                    </button>
                  </div>
                </section>

                {fieldTab === 'create' ? (
                  <section className="space-y-2">
                    {filteredFieldTypeOptions.map((option) => {
                      const meta = FIELD_TYPE_META[option.value];
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => addCustomField(option.value)}
                          className="flex w-full items-center gap-3 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50"
                        >
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-700">{meta?.token || option.label[0]}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-900">{option.label}</span>
                            <span className="block text-xs text-slate-500">{meta?.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </section>
                ) : (
                  <section className="space-y-3">
                    <div className="space-y-2">
                      {hiddenBuiltIns.length === 0 ? (
                        <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                          All built-in fields are already shown.
                        </div>
                      ) : (
                        hiddenBuiltIns.map((column) => (
                          <button
                            key={column.key}
                            type="button"
                            onClick={() => toggleBuiltInColumnVisibility(column.key)}
                            className="flex w-full items-center justify-between rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50"
                          >
                            <span className="flex items-center gap-3">
                              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                                <Type size={15} />
                              </span>
                              <span>
                                <span className="block text-sm font-medium text-slate-900">{column.label}</span>
                                <span className="block text-xs text-slate-500">Hidden built-in field</span>
                              </span>
                            </span>
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">Show</span>
                          </button>
                        ))
                      )}
                    </div>
                  </section>
                )}

                {customFields.length > 0 && (
                  <section className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current fields</p>
                    <div className="space-y-3">
                      {customFields.map((field, index) => (
                        <div key={field.id} className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{field.name || 'Untitled field'}</p>
                              <p className="text-xs text-slate-500">{getColumnTypeLabel(field.type)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setCustomFields((prev) => prev.filter((_, currentIndex) => currentIndex !== index))}
                              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              title="Remove field"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="grid gap-3 md:grid-cols-[1.5fr_1fr]">
                            <input
                              value={field.name}
                              onChange={(e) =>
                                setCustomFields((prev) =>
                                  prev.map((current, currentIndex) => (currentIndex === index ? { ...current, name: e.target.value } : current))
                                )
                              }
                              className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                              placeholder="Field name"
                            />
                            <select
                              value={field.type}
                              onChange={(e) =>
                                setCustomFields((prev) =>
                                  prev.map((current, currentIndex) =>
                                    currentIndex === index
                                      ? {
                                          ...current,
                                          type: e.target.value as CustomFieldDefinition['type'],
                                          options: e.target.value === 'select' ? current.options && current.options.length > 0 ? current.options : ['Option 1'] : undefined,
                                        }
                                      : current
                                  )
                                )
                              }
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                            >
                              {CUSTOM_FIELD_TYPE_OPTIONS.map((type) => (
                                <option key={type.value} value={type.value}>
                                  {type.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {field.type === 'select' && (
                            <div className="mt-3">
                              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Options</label>
                              <input
                                value={(field.options ?? []).join(', ')}
                                onChange={(e) =>
                                  setCustomFields((prev) =>
                                    prev.map((current, currentIndex) =>
                                      currentIndex === index
                                        ? {
                                            ...current,
                                            options: e.target.value.split(',').map((option) => option.trim()).filter(Boolean),
                                          }
                                        : current
                                    )
                                  )
                                }
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                placeholder="Option 1, Option 2"
                              />
                            </div>
                          )}

                          <div className="mt-3">
                            <ColumnTypePreview type={field.type} label={field.name} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {panel === 'statuses' && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Task statuses</p>
                    <p className="text-xs text-slate-500">Update labels and colors directly from the planner.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStatuses((prev) => [...prev, { value: `CUSTOM_${prev.length + 1}`, label: 'New Status', color: '#2563EB' }])}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    <Plus size={12} />
                    Add status
                  </button>
                </div>

                <div className="space-y-3">
                  {statuses.map((status, index) => (
                    <div key={`${status.value}-${index}`} className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <input
                          value={status.label}
                          onChange={(e) => setStatuses((prev) => prev.map((current, currentIndex) => (currentIndex === index ? { ...current, label: e.target.value } : current)))}
                          className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                          placeholder="Status name"
                        />
                        <button
                          type="button"
                          onClick={() => setStatuses((prev) => prev.filter((_, currentIndex) => currentIndex !== index))}
                          className="rounded-full p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Remove status"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <ColorPicker
                        value={status.color}
                        onChange={(nextColor) => setStatuses((prev) => prev.map((current, currentIndex) => (currentIndex === index ? { ...current, color: nextColor } : current)))}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {panel === 'layout' && (
              <section className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">Column order</p>
                <p className="text-xs text-slate-500">Move the most important fields higher so they appear earlier in the list view.</p>
                <div className="space-y-2">
                  {orderedColumnItems.map((column, index) => (
                    <div key={column.id} className="flex items-center justify-between rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{column.label}</p>
                        <p className="text-xs text-slate-500">{column.typeLabel}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveColumn(column.id, -1)}
                          disabled={index === 0}
                          className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveColumn(column.id, 1)}
                          disabled={index === orderedColumnItems.length - 1}
                          className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {panel === 'schedule' && (
              <section className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Project schedule</p>
                  <p className="text-xs text-slate-500">These dates drive the project bar in the Gantt view.</p>
                </div>
                <div className="grid gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">Project start</label>
                    <div className="rounded-xl border border-slate-300 px-3 py-2.5">
                      <DatePicker value={projectStartDate} onChange={setProjectStartDate} placeholder="Set start date" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">Project end</label>
                    <div className="rounded-xl border border-slate-300 px-3 py-2.5">
                      <DatePicker value={projectEndDate} onChange={setProjectEndDate} placeholder="Set end date" />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {panel === 'views' && (
              <section className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">Saved views</p>
                <p className="text-xs text-slate-500">Rename or remove the toolbar presets saved for this project.</p>
                <div className="space-y-2">
                  {savedViews.length === 0 ? (
                    <p className="rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                      No saved views yet. Save one from the List or Gantt toolbar.
                    </p>
                  ) : (
                    savedViews.map((view, index) => (
                      <div key={view.id} className="flex items-center gap-3 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3">
                        <input
                          value={view.name}
                          onChange={(e) => setSavedViews((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: e.target.value } : item)))}
                          className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                          placeholder="Saved view name"
                        />
                        <button
                          type="button"
                          onClick={() => setSavedViews((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          className="rounded-full p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {panel === 'filter' && (
              <section className="space-y-3">
                <div className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 rounded-xl bg-slate-100 p-2 text-slate-700">
                      <Filter size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">Saved filter presets live in views</p>
                      <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                        Use the planner menu bar to set statuses, focus, and completion filters, then save the current view. Those presets appear here and in the View menu.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  {savedViews.length === 0 ? (
                    <p className="rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                      No filter presets saved yet.
                    </p>
                  ) : (
                    savedViews.map((view) => (
                      <div key={view.id} className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3">
                        <p className="text-sm font-semibold text-slate-900">{view.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {view.statusFilters.length} status filters · {view.hideCompleted ? 'Hides completed' : 'Shows completed'} · {view.focusMode || 'all'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {panel === 'group' && (
              <section className="space-y-3">
                <div className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 rounded-xl bg-slate-100 p-2 text-slate-700">
                      <Layers3 size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">Grouping stays manual for now</p>
                      <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                        The list currently follows project sections plus the column order you configure here. This drawer now reserves a dedicated Group panel so the later grouping work can land cleanly without reworking the navigation again.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4">
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50"
            >
              <Link2 size={14} />
              {copiedLink ? 'Link copied' : 'Copy link'}
            </button>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ViewSettingsModal;
