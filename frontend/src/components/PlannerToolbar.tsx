import React from 'react';
import { BarChart2, CalendarDays, Check, ChevronDown, Filter, List, Mail, RefreshCw, Settings2, Share2, X } from 'lucide-react';
import type { SavedView, SelectedListTarget, StatusOption, TaskFocusMode } from '../types';
import cloudzoneBackground from '../assets/cloudzone-background.jpg';

type ViewMode = 'list' | 'gantt' | 'outlook';
type OpenMenuId = 'filter' | null;

interface PlannerToolbarProps {
  selectedLists: SelectedListTarget[];
  resultSummary: string;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
  statusOptions: StatusOption[];
  selectedStatuses: string[];
  onToggleStatus: (status: string) => void;
  hideCompleted: boolean;
  onToggleHideCompleted: () => void;
  focusMode: TaskFocusMode;
  onFocusModeChange: (mode: TaskFocusMode) => void;
  onClearFilters: () => void;
  onOpenViewBuilder: () => void;
  onRefresh: () => void;
  viewBuilderDisabled?: boolean;
  viewBuilderTitle?: string;
  savedViews?: SavedView[];
  activeSavedViewId?: string;
  activeSavedViewName?: string;
  onSavedViewSelect?: (value: string) => void;
  onSaveCurrentView?: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  defaultTaskTreeExpanded?: boolean;
  onToggleDefaultTaskTreeExpanded?: () => void;
  onShareWorkload?: () => void;
  viewModeAccessory?: React.ReactNode;
  agendaOpen?: boolean;
  agendaNotificationCount?: number;
  onToggleAgenda?: () => void;
  mailNotificationCount?: number;
  extraActions?: React.ReactNode;
  subControls?: React.ReactNode;
  fillHeight?: boolean;
}

const focusOptions: Array<{ value: TaskFocusMode; label: string }> = [
  { value: 'all', label: 'All items' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'milestones', label: 'Milestones' },
  { value: 'projects', label: 'Projects' },
];

const SwitchRow: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
}> = ({ label, description, checked, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-slate-50"
  >
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-slate-800">{label}</p>
      {description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>}
    </div>
    <span
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-blue-600' : 'bg-slate-200'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </span>
  </button>
);

const ToolbarMenuButton: React.FC<{
  active?: boolean;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}> = ({ active = false, label, icon, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
      active
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    }`}
  >
    {icon}
    <span>{label}</span>
    <ChevronDown size={14} />
  </button>
);

const PlannerToolbar: React.FC<PlannerToolbarProps> = ({
  selectedLists,
  resultSummary: _resultSummary,
  searchQuery = '',
  onSearchQueryChange: _onSearchQueryChange,
  statusOptions,
  selectedStatuses,
  onToggleStatus,
  hideCompleted,
  onToggleHideCompleted,
  focusMode,
  onFocusModeChange,
  onClearFilters,
  onOpenViewBuilder,
  onRefresh,
  viewBuilderDisabled = false,
  viewBuilderTitle,
  savedViews: _savedViews = [],
  activeSavedViewId: _activeSavedViewId = '',
  activeSavedViewName,
  onSavedViewSelect: _onSavedViewSelect,
  onSaveCurrentView: _onSaveCurrentView,
  viewMode,
  onViewModeChange,
  defaultTaskTreeExpanded: _defaultTaskTreeExpanded = false,
  onToggleDefaultTaskTreeExpanded: _onToggleDefaultTaskTreeExpanded,
  onShareWorkload,
  viewModeAccessory,
  agendaOpen = false,
  agendaNotificationCount = 0,
  onToggleAgenda,
  mailNotificationCount = 0,
  extraActions,
  subControls,
  fillHeight = false,
}) => {
  const [openMenu, setOpenMenu] = React.useState<OpenMenuId>(null);
  const menuBarRef = React.useRef<HTMLDivElement>(null);
  const closeMenuTimeoutRef = React.useRef<number | null>(null);
  const hasActiveFilters = searchQuery.trim().length > 0 || selectedStatuses.length > 0 || hideCompleted || focusMode !== 'all';
  const toolbarLabel =
    selectedLists.length === 1 && selectedLists[0]
      ? `Planner toolbar for ${selectedLists[0].listName}`
      : 'Planner toolbar';
  const customizeTitle =
    viewBuilderTitle ?? (activeSavedViewName?.trim() ? `Customize ${activeSavedViewName}` : 'Customize view');

  const clearScheduledClose = React.useCallback(() => {
    if (closeMenuTimeoutRef.current !== null) {
      window.clearTimeout(closeMenuTimeoutRef.current);
      closeMenuTimeoutRef.current = null;
    }
  }, []);

  const openHoverMenu = React.useCallback(
    (menu: Exclude<OpenMenuId, null>) => {
      clearScheduledClose();
      setOpenMenu(menu);
    },
    [clearScheduledClose]
  );

  const toggleMenu = React.useCallback(
    (menu: Exclude<OpenMenuId, null>) => {
      clearScheduledClose();
      setOpenMenu((current) => (current === menu ? null : menu));
    },
    [clearScheduledClose]
  );

  const scheduleMenuClose = React.useCallback(
    (menu: Exclude<OpenMenuId, null>) => {
      clearScheduledClose();
      closeMenuTimeoutRef.current = window.setTimeout(() => {
        setOpenMenu((current) => (current === menu ? null : current));
        closeMenuTimeoutRef.current = null;
      }, 120);
    },
    [clearScheduledClose]
  );

  React.useEffect(() => {
    if (!openMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [openMenu]);

  React.useEffect(() => () => clearScheduledClose(), [clearScheduledClose]);

  return (
    <div
      className={`relative overflow-visible border-b border-slate-200 bg-white px-4 py-2.5 ${
        fillHeight ? 'flex h-full flex-col justify-end' : ''
      }`}
      aria-label={toolbarLabel}
    >
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-[34rem] opacity-[0.56]"
        style={{
          backgroundImage: `url(${cloudzoneBackground})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: 'right center',
          maskImage: 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.65) 40%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.65) 40%, rgba(0,0,0,0) 100%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white via-white/88 to-white/74" />

      <div ref={menuBarRef} className="relative z-10 flex min-h-[5.75rem] flex-col justify-between gap-2">
        <div className="flex min-h-[2.5rem] flex-wrap items-center gap-2">
          {viewMode && onViewModeChange && (
            <div className="flex items-center rounded-full border border-slate-200 bg-white/95 p-1 shadow-sm">
              <button
                type="button"
                onClick={() => onViewModeChange('list')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                  viewMode === 'list' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <List size={14} />
                List
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('gantt')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                  viewMode === 'gantt' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
                >
                  <BarChart2 size={14} />
                  Gantt
                </button>
              <button
                type="button"
                onClick={() => onViewModeChange('outlook')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                  viewMode === 'outlook' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Mail size={14} />
                Outlook
                {mailNotificationCount > 0 && (
                  <span
                    className={`inline-flex min-w-[1.15rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                      viewMode === 'outlook' ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
                    }`}
                  >
                    {mailNotificationCount > 99 ? '99+' : mailNotificationCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {viewModeAccessory}

          <div
            className="relative"
            onMouseEnter={() => openHoverMenu('filter')}
            onMouseLeave={() => scheduleMenuClose('filter')}
          >
            <ToolbarMenuButton
              active={hasActiveFilters}
              label={
                hasActiveFilters
                  ? `Filter${selectedStatuses.length > 0 ? ` · ${selectedStatuses.length} status` : ''}`
                  : 'Filter'
              }
              icon={<Filter size={14} />}
              onClick={() => toggleMenu('filter')}
            />

            {openMenu === 'filter' && (
              <div className="absolute left-0 top-full z-50 mt-2 max-h-[68vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[1rem] border border-slate-200 bg-white p-2 shadow-2xl">
                <div className="rounded-[1rem] border border-slate-200 bg-slate-50/70 p-1">
                  <SwitchRow
                    label="Hide completed"
                    description="Keep finished work out of the main view."
                    checked={hideCompleted}
                    onToggle={onToggleHideCompleted}
                  />
                </div>

                <div className="mt-3">
                  <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Focus</p>
                  <div className="mt-2 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
                    {focusOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onFocusModeChange(option.value)}
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] transition-colors ${
                          focusMode === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-2 flex items-center justify-between px-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Statuses</p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={onClearFilters}
                        className="text-[11px] text-blue-600 transition-colors hover:text-blue-700"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    {statusOptions.length === 0 ? (
                      <p className="px-2 py-1.5 text-xs text-slate-400">No statuses configured.</p>
                    ) : (
                      statusOptions.map((option) => {
                        const checked = selectedStatuses.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => onToggleStatus(option.value)}
                            className={`flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-xs transition-colors ${
                              checked ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.color }} />
                              {option.label}
                            </span>
                            {checked && <Check size={14} />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {extraActions}
        </div>

        <div className={`flex min-h-[2.5rem] flex-wrap items-center gap-2 ${subControls ? 'justify-between' : 'justify-end'}`}>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 whitespace-nowrap">{subControls}</div>
          <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
            <button
              type="button"
              onClick={onOpenViewBuilder}
              disabled={viewBuilderDisabled}
              title={customizeTitle}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Settings2 size={14} />
              Customize
            </button>
            {onShareWorkload && (
              <button
                type="button"
                onClick={onShareWorkload}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                <Share2 size={14} />
                Share
              </button>
            )}
            {onToggleAgenda && (
              <button
                type="button"
                onClick={onToggleAgenda}
                className={`relative inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  agendaOpen
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white/95 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
                title={agendaOpen ? 'Hide agenda sidebar' : 'Show agenda sidebar'}
              >
                <CalendarDays size={15} />
                <span>Agenda</span>
                {agendaNotificationCount > 0 && (
                  <span className="inline-flex min-w-[1.3rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    {agendaNotificationCount > 99 ? '99+' : agendaNotificationCount}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
              >
                <X size={14} />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlannerToolbar;
