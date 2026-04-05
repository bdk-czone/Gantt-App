import React from 'react';
import { KeyRound, LogOut, PanelLeftClose, PanelLeftOpen, ZoomIn, ZoomOut } from 'lucide-react';
import AgendaSidebar from './components/AgendaSidebar';
import AuthGate from './components/AuthGate';
import ChangePasskeyModal from './components/ChangePasskeyModal';
import OutlookView from './components/OutlookView';
import ReminderToastStack from './components/ReminderToastStack';
import ShareWorkloadModal from './components/ShareWorkloadModal';
import Sidebar from './components/Sidebar';
import SharedWorkloadPage from './components/SharedWorkloadPage';
import ListView from './components/ListView';
import GanttView from './components/GanttView';
import { createWorkloadShare } from './api';
import {
  getDueReminderNotifications,
  loadReminderAgendaGroups,
  type DueReminderNotification,
} from './lib/reminderAgenda';
import { TASKS_MUTATED_EVENT } from './lib/taskEvents';
import type { SelectedListTarget } from './types';
import cloudzoneBackground from './assets/cloudzone-background.jpg';

type ViewMode = 'list' | 'gantt' | 'outlook';
const UI_SCALE_KEY = 'myproplanner:ui-scale:v1';
const APP_VIEW_MODE_KEY = 'myproplanner:app-view-mode:v1';
const APP_SIDEBAR_COLLAPSED_KEY = 'myproplanner:app-sidebar-collapsed:v1';
const APP_SIDEBAR_WIDTH_KEY = 'myproplanner:app-sidebar-width:v1';
const APP_AGENDA_OPEN_KEY = 'myproplanner:app-agenda-open:v1';
const SIDEBAR_TASK_TREE_DEFAULT_KEY = 'myproplanner:sidebar-task-tree-default-expanded:v1';
const UI_SCALE_OPTIONS = [0.9, 1, 1.1, 1.25];
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 520;
const REMINDER_POLL_INTERVAL_MS = 30000;

const CloudzoneWordmark: React.FC = () => (
  <div className="flex w-[136px] flex-col leading-none">
    <span
      className="text-[1.65rem] font-black tracking-[-0.055em] text-[#5C73F4]"
      style={{ fontFamily: '"Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif' }}
    >
      cloudzone
    </span>
    <span
      className="mt-0.5 self-end text-[0.46rem] tracking-[-0.01em] text-slate-800"
      style={{ fontFamily: '"Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif' }}
    >
      <span className="font-semibold italic">a matrix</span> company
    </span>
  </div>
);

function buildShareName(selectedLists: SelectedListTarget[]) {
  if (selectedLists.length === 1) return `${selectedLists[0].listName} Progress`;
  if (selectedLists.length === 2) return `${selectedLists[0].listName} + ${selectedLists[1].listName} Progress`;
  return 'My workload progress';
}

const App: React.FC = () => {
  const sharedWorkloadToken = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    const match = window.location.pathname.match(/^\/share\/([^/]+)$/);
    return match?.[1] ?? null;
  }, []);
  const [viewMode, setViewMode] = React.useState<ViewMode>(() => {
    try {
      const raw = localStorage.getItem(APP_VIEW_MODE_KEY);
      return raw === 'gantt' || raw === 'outlook' ? raw : 'list';
    } catch {
      return 'list';
    }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    try {
      return localStorage.getItem(APP_SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [selectedLists, setSelectedLists] = React.useState<SelectedListTarget[]>([]);
  const [selectedListIds, setSelectedListIds] = React.useState<string[]>([]);
  const [agendaOpen, setAgendaOpen] = React.useState(() => {
    try {
      return localStorage.getItem(APP_AGENDA_OPEN_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [triggeredReminders, setTriggeredReminders] = React.useState<DueReminderNotification[]>([]);
  const [shareModalOpen, setShareModalOpen] = React.useState(false);
  const [shareLoading, setShareLoading] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState('');
  const [shareName, setShareName] = React.useState('My workload progress');
  const [shareError, setShareError] = React.useState<string | null>(null);
  const [defaultTaskTreeExpanded, setDefaultTaskTreeExpanded] = React.useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_TASK_TREE_DEFAULT_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [sidebarWidth, setSidebarWidth] = React.useState(() => {
    try {
      const raw = localStorage.getItem(APP_SIDEBAR_WIDTH_KEY);
      const parsed = raw ? Number(raw) : 320;
      return Number.isFinite(parsed)
        ? Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsed))
        : 320;
    } catch {
      return 320;
    }
  });
  const [uiScale, setUiScale] = React.useState(() => {
    try {
      const raw = localStorage.getItem(UI_SCALE_KEY);
      const parsed = raw ? Number(raw) : 1;
      return UI_SCALE_OPTIONS.includes(parsed) ? parsed : 1;
    } catch {
      return 1;
    }
  });
  const announcedReminderIdsRef = React.useRef<Set<string>>(new Set());

  const handleSelectionChange = React.useCallback(
    ({
      selectedLists: nextLists,
      selectedListIds: nextListIds,
    }: {
      selectedLists: SelectedListTarget[];
      selectedListIds: string[];
      selectedWorkspaceIds: string[];
    }) => {
      setSelectedLists(nextLists);
      setSelectedListIds(nextListIds);
    },
    []
  );

  React.useEffect(() => {
    document.documentElement.style.fontSize = `${uiScale * 100}%`;
    localStorage.setItem(UI_SCALE_KEY, String(uiScale));
  }, [uiScale]);

  React.useEffect(() => {
    localStorage.setItem(APP_VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  React.useEffect(() => {
    localStorage.setItem(APP_SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  React.useEffect(() => {
    localStorage.setItem(APP_SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  React.useEffect(() => {
    localStorage.setItem(APP_AGENDA_OPEN_KEY, String(agendaOpen));
  }, [agendaOpen]);

  React.useEffect(() => {
    localStorage.setItem(SIDEBAR_TASK_TREE_DEFAULT_KEY, String(defaultTaskTreeExpanded));
  }, [defaultTaskTreeExpanded]);

  const openAgenda = React.useCallback(() => {
    setTriggeredReminders([]);
    setAgendaOpen(true);
  }, []);

  const toggleAgenda = React.useCallback(() => {
    setAgendaOpen((current) => {
      const next = !current;
      if (next) {
        setTriggeredReminders([]);
      }
      return next;
    });
  }, []);

  const dismissReminderNotification = React.useCallback((id: string) => {
    setTriggeredReminders((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const createShareLink = React.useCallback(async () => {
    if (selectedLists.length === 0) return;

    setShareLoading(true);
    setShareError(null);

    try {
      const share = await createWorkloadShare({
        listIds: selectedLists.map((list) => list.listId),
        name: buildShareName(selectedLists),
      });
      const url = new URL(`/share/${share.token}`, window.location.origin).toString();
      setShareName(share.name);
      setShareUrl(url);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setShareLoading(false);
    }
  }, [selectedLists]);

  const openShareModal = React.useCallback(() => {
    setShareModalOpen(true);
    void createShareLink();
  }, [createShareLink]);

  React.useEffect(() => {
    setShareUrl('');
    setShareName(buildShareName(selectedLists));
    setShareError(null);
  }, [selectedLists]);

  const syncReminderNotifications = React.useCallback(async () => {
    if (selectedLists.length === 0) {
      announcedReminderIdsRef.current = new Set();
      setTriggeredReminders([]);
      return;
    }

    try {
      const groups = await loadReminderAgendaGroups(selectedLists);
      const currentReminderIds = new Set(groups.flatMap((group) => group.tasks.map((item) => `${item.task.id}:${item.reminderAt}`)));
      announcedReminderIdsRef.current = new Set(
        Array.from(announcedReminderIdsRef.current).filter((id) => currentReminderIds.has(id))
      );

      const dueNotifications = getDueReminderNotifications(groups);
      const dueIds = new Set(dueNotifications.map((notification) => notification.id));

      if (agendaOpen) {
        dueNotifications.forEach((notification) => announcedReminderIdsRef.current.add(notification.id));
        setTriggeredReminders([]);
        return;
      }

      const newNotifications = dueNotifications
        .filter((notification) => !announcedReminderIdsRef.current.has(notification.id))
        .map((notification) => ({
          ...notification,
        }));

      newNotifications.forEach((notification) => announcedReminderIdsRef.current.add(notification.id));

      setTriggeredReminders((current) => {
        const preserved = current.filter((notification) => dueIds.has(notification.id));
        const merged = new Map<string, DueReminderNotification>(preserved.map((notification) => [notification.id, notification]));
        for (const notification of newNotifications) {
          merged.set(notification.id, notification);
        }
        return Array.from(merged.values()).sort((left, right) => new Date(right.reminderAt).getTime() - new Date(left.reminderAt).getTime());
      });
    } catch (err) {
      console.error('Failed to sync reminder notifications:', err);
    }
  }, [agendaOpen, selectedLists]);

  React.useEffect(() => {
    void syncReminderNotifications();

    const intervalId = window.setInterval(() => {
      void syncReminderNotifications();
    }, REMINDER_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [syncReminderNotifications]);

  React.useEffect(() => {
    const handleReminderRefresh = () => {
      void syncReminderNotifications();
    };

    window.addEventListener(TASKS_MUTATED_EVENT, handleReminderRefresh);
    window.addEventListener('myproplanner:project-settings-updated', handleReminderRefresh);
    return () => {
      window.removeEventListener(TASKS_MUTATED_EVENT, handleReminderRefresh);
      window.removeEventListener('myproplanner:project-settings-updated', handleReminderRefresh);
    };
  }, [syncReminderNotifications]);

  const updateUiScale = (direction: -1 | 1) => {
    setUiScale((current) => {
      const currentIndex = UI_SCALE_OPTIONS.indexOf(current);
      const fallbackIndex = currentIndex === -1 ? UI_SCALE_OPTIONS.indexOf(1) : currentIndex;
      const nextIndex = Math.max(0, Math.min(UI_SCALE_OPTIONS.length - 1, fallbackIndex + direction));
      return UI_SCALE_OPTIONS[nextIndex];
    });
  };

  const startSidebarResize = (startX: number, startWidth: number) => {
    const handleMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - startX;
      setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, startWidth + delta)));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const [changePasskeyOpen, setChangePasskeyOpen] = React.useState(false);

  if (sharedWorkloadToken) {
    return <SharedWorkloadPage token={sharedWorkloadToken} />;
  }

  return (
    <AuthGate>
      {(onLogout) => (
    <div className="flex h-screen flex-col bg-white">
      <header className="relative z-20 flex flex-shrink-0 items-center justify-between overflow-hidden border-b border-slate-200 bg-white px-4 py-3">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[34rem] opacity-[0.56]"
          style={{
            backgroundImage: `url(${cloudzoneBackground})`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'cover',
            backgroundPosition: 'right top',
            maskImage: 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.65) 40%, rgba(0,0,0,0) 100%)',
            WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.65) 40%, rgba(0,0,0,0) 100%)',
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#FF7A59] via-[#4F6BED] to-[#B54DFF]" />

        <div className="relative z-10 flex min-w-0 items-center gap-3">
          <button
            onClick={() => setSidebarCollapsed((current) => !current)}
            className="rounded-lg border border-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-50"
            title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>

          <div className="flex items-center gap-[1cm]">
            <CloudzoneWordmark />
            <div className="min-w-0">
              <span
                className="text-[1.225rem] font-extrabold text-gray-900"
                style={{
                  fontFamily: '"Nunito", "Varela Round", "Quicksand", "Trebuchet MS", system-ui, sans-serif',
                  letterSpacing: '-0.01em',
                }}
              >
                Shlomi's Project Planner
              </span>
            </div>
          </div>
        </div>

        <div className="relative z-10 mr-[5cm] flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChangePasskeyOpen(true)}
            className="rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50"
            title="Change passkey"
          >
            <KeyRound size={15} />
          </button>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50"
            title="Lock app"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarCollapsed ? (
          <aside className="flex w-12 flex-col items-center border-r border-gray-200 bg-slate-50 py-3">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50"
              title="Show sidebar"
            >
              <PanelLeftOpen size={15} />
            </button>
            <div className="mt-4 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
              {selectedLists.length}
            </div>
          </aside>
        ) : (
          <>
            <div
              className="min-h-0 flex-shrink-0 overflow-hidden border-r border-gray-200 bg-white"
              style={{ width: sidebarWidth }}
            >
              <Sidebar
                onSelectionChange={handleSelectionChange}
                defaultTaskTreeExpanded={defaultTaskTreeExpanded}
              />
            </div>
            <div
              className="group relative z-10 w-2 flex-shrink-0 cursor-col-resize bg-transparent"
              onMouseDown={(event) => {
                event.preventDefault();
                startSidebarResize(event.clientX, sidebarWidth);
              }}
              title="Resize sidebar"
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-blue-400" />
            </div>
          </>
        )}

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {selectedLists.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              {viewMode === 'list' ? (
                <ListView
                  selectedLists={selectedLists}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  defaultTaskTreeExpanded={defaultTaskTreeExpanded}
                  onToggleDefaultTaskTreeExpanded={() => setDefaultTaskTreeExpanded((current) => !current)}
                  onShareWorkload={openShareModal}
                  agendaOpen={agendaOpen}
                  agendaNotificationCount={triggeredReminders.length}
                  onToggleAgenda={toggleAgenda}
                  mailNotificationCount={0}
                  uiScale={uiScale}
                  onUiScaleChange={setUiScale}
                />
              ) : viewMode === 'gantt' ? (
                <GanttView
                  selectedLists={selectedLists}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  defaultTaskTreeExpanded={defaultTaskTreeExpanded}
                  onToggleDefaultTaskTreeExpanded={() => setDefaultTaskTreeExpanded((current) => !current)}
                  onShareWorkload={openShareModal}
                  agendaOpen={agendaOpen}
                  agendaNotificationCount={triggeredReminders.length}
                  onToggleAgenda={toggleAgenda}
                  mailNotificationCount={0}
                  uiScale={uiScale}
                  onUiScaleChange={setUiScale}
                />
              ) : (
                <OutlookView
                  selectedLists={selectedLists}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  mailNotificationCount={0}
                  uiScale={uiScale}
                  onUiScaleChange={setUiScale}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
              <CloudzoneWordmark />
              <p className="text-lg font-medium">Select projects or workspaces to get started</p>
              <p className="mt-1 text-sm">Use the checkboxes in the sidebar to combine projects in one view.</p>
            </div>
          )}
        </main>

        {agendaOpen && (
          <div className="min-h-0 flex-shrink-0 overflow-hidden border-l border-slate-200 bg-slate-50" style={{ width: 380 }}>
            <AgendaSidebar selectedLists={selectedLists} onClose={() => setAgendaOpen(false)} />
          </div>
        )}
      </div>

      <ReminderToastStack
        notifications={triggeredReminders}
        onDismiss={dismissReminderNotification}
        onOpenAgenda={openAgenda}
      />

      <ShareWorkloadModal
        open={shareModalOpen}
        shareName={shareName}
        shareUrl={shareUrl}
        loading={shareLoading}
        error={shareError}
        onClose={() => setShareModalOpen(false)}
        onCreateLink={() => {
          void createShareLink();
        }}
      />

      <ChangePasskeyModal
        open={changePasskeyOpen}
        onClose={() => setChangePasskeyOpen(false)}
      />

      <div className="pointer-events-none fixed bottom-4 right-4 z-40">
        <div className="pointer-events-auto hidden items-center gap-1 rounded-full border border-gray-200 bg-white/95 p-1 shadow-lg backdrop-blur sm:flex">
          <button
            type="button"
            onClick={() => updateUiScale(-1)}
            disabled={uiScale === UI_SCALE_OPTIONS[0]}
            className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            title="Decrease interface size"
          >
            <ZoomOut size={14} />
          </button>
          <select
            value={String(uiScale)}
            onChange={(e) => setUiScale(Number(e.target.value))}
            className="rounded-full border-0 bg-transparent px-2 py-1 text-xs text-gray-600 outline-none"
            title="Interface scale"
          >
            {UI_SCALE_OPTIONS.map((scale) => (
              <option key={scale} value={scale}>
                {Math.round(scale * 100)}%
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => updateUiScale(1)}
            disabled={uiScale === UI_SCALE_OPTIONS[UI_SCALE_OPTIONS.length - 1]}
            className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            title="Increase interface size"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>
    </div>
      )}
    </AuthGate>
  );
};

export default App;
