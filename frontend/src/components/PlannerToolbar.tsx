import React from 'react';
import { BarChart2, CalendarDays, List, Mail, RefreshCw, Settings2, Share2, X } from 'lucide-react';
import type { SavedView, SelectedListTarget, StatusOption, TaskFocusMode } from '../types';
import cloudzoneBackground from '../assets/cloudzone-background.jpg';

type ViewMode = 'list' | 'gantt' | 'outlook';

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


const PlannerToolbar: React.FC<PlannerToolbarProps> = ({
  selectedLists,
  resultSummary: _resultSummary,
  searchQuery = '',
  onSearchQueryChange: _onSearchQueryChange,
  statusOptions: _statusOptions,
  selectedStatuses,
  onToggleStatus: _onToggleStatus,
  hideCompleted,
  onToggleHideCompleted: _onToggleHideCompleted,
  focusMode,
  onFocusModeChange: _onFocusModeChange,
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
  const hasActiveFilters = searchQuery.trim().length > 0 || selectedStatuses.length > 0 || hideCompleted || focusMode !== 'all';
  const toolbarLabel =
    selectedLists.length === 1 && selectedLists[0]
      ? `Planner toolbar for ${selectedLists[0].listName}`
      : 'Planner toolbar';
  const customizeTitle =
    viewBuilderTitle ?? (activeSavedViewName?.trim() ? `Customize ${activeSavedViewName}` : 'Customize view');

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

      <div className="relative z-20 flex min-h-[5.75rem] flex-col justify-between gap-2">
        {/* Row 1: View mode switcher + accessories */}
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
          {extraActions}
        </div>

        {/* Row 2: Customize / Share / Agenda / Refresh — left-aligned below view switcher */}
        <div className="flex min-h-[2.5rem] flex-wrap items-center gap-2">
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
              Clear filters
            </button>
          )}
          {subControls && (
            <div className="flex min-w-0 flex-wrap items-center gap-2 whitespace-nowrap">{subControls}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlannerToolbar;
