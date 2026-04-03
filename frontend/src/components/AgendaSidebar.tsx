import React from 'react';
import { Bell, BellOff, CalendarDays, Edit2, RefreshCw, XCircle } from 'lucide-react';
import { updateTask } from '../api';
import { formatCompactDate } from '../lib/dateFormat';
import { EntityIcon, getAppearanceColor } from '../lib/appearance';
import { loadReminderAgendaGroups, type ReminderAgendaProjectGroup, type ReminderAgendaTaskItem } from '../lib/reminderAgenda';
import {
  getCompletedStatusValue,
  getOpenStatusValue,
  getStatusOption,
  isCompletedStatus,
} from '../lib/projectSettings';
import { TASKS_MUTATED_EVENT, type TaskMutationDetail, emitTasksMutated } from '../lib/taskEvents';
import { getPriorityRank, setTaskReminderDetails } from '../lib/taskReminders';
import type { SelectedListTarget } from '../types';
import ContextMenu from './ContextMenu';
import ReminderEditorModal from './ReminderEditorModal';

interface AgendaSidebarProps {
  selectedLists: SelectedListTarget[];
  onClose: () => void;
}

type AgendaContextMenuState = {
  item: ReminderAgendaTaskItem;
  x: number;
  y: number;
} | null;

function getReminderTone(reminderAt: string, completed: boolean) {
  if (completed) return 'text-slate-400';
  const reminderTime = new Date(reminderAt).getTime();
  if (!Number.isNaN(reminderTime) && reminderTime < Date.now()) {
    return 'text-red-600';
  }
  return 'text-slate-500';
}

const AgendaSidebar: React.FC<AgendaSidebarProps> = ({ selectedLists, onClose }) => {
  const [groups, setGroups] = React.useState<ReminderAgendaProjectGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyTaskIds, setBusyTaskIds] = React.useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = React.useState<AgendaContextMenuState>(null);
  const [editingReminderItem, setEditingReminderItem] = React.useState<ReminderAgendaTaskItem | null>(null);

  const loadAgenda = React.useCallback(async () => {
    if (selectedLists.length === 0) {
      setGroups([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setGroups(await loadReminderAgendaGroups(selectedLists));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agenda');
    } finally {
      setLoading(false);
    }
  }, [selectedLists]);

  React.useEffect(() => {
    void loadAgenda();
  }, [loadAgenda]);

  React.useEffect(() => {
    const handleTasksMutated = (event: Event) => {
      const detail = (event as CustomEvent<TaskMutationDetail>).detail;
      if (detail?.source === 'agenda') return;
      void loadAgenda();
    };

    const handleProjectSettingsUpdated = () => {
      void loadAgenda();
    };

    window.addEventListener(TASKS_MUTATED_EVENT, handleTasksMutated);
    window.addEventListener('myproplanner:project-settings-updated', handleProjectSettingsUpdated);
    return () => {
      window.removeEventListener(TASKS_MUTATED_EVENT, handleTasksMutated);
      window.removeEventListener('myproplanner:project-settings-updated', handleProjectSettingsUpdated);
    };
  }, [loadAgenda]);

  const totalTasks = React.useMemo(() => groups.reduce((sum, group) => sum + group.tasks.length, 0), [groups]);
  const completedTasks = React.useMemo(
    () =>
      groups.reduce(
        (sum, group) => sum + group.tasks.filter((item) => isCompletedStatus(item.task.status, item.projectSettings)).length,
        0
      ),
    [groups]
  );

  const runTaskAction = async (taskId: string, action: () => Promise<void>) => {
    setBusyTaskIds((current) => new Set(current).add(taskId));
    try {
      await action();
      emitTasksMutated('agenda');
      await loadAgenda();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update agenda item');
    } finally {
      setBusyTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleToggleCompleted = async (item: ReminderAgendaTaskItem) => {
    const completed = isCompletedStatus(item.task.status, item.projectSettings);
    const nextStatus = completed
      ? getOpenStatusValue(item.projectSettings, item.task.status)
      : getCompletedStatusValue(item.projectSettings);

    await runTaskAction(item.task.id, async () => {
      await updateTask(item.task.id, { status: nextStatus });
    });
  };

  const handleRemoveReminder = async (item: ReminderAgendaTaskItem) => {
    if (!window.confirm(`Remove the reminder for "${item.task.name}"? The task itself will stay in the project.`)) {
      return;
    }

    await runTaskAction(item.task.id, async () => {
      await updateTask(item.task.id, {
        custom_fields: setTaskReminderDetails(item.task.custom_fields, {
          reminderAt: null,
          note: null,
        }),
      });
    });
  };

  const handleReminderSave = async (
    item: ReminderAgendaTaskItem,
    details: { reminderAt: string | null; note: string | null }
  ) => {
    await runTaskAction(item.task.id, async () => {
      await updateTask(item.task.id, {
        custom_fields: setTaskReminderDetails(item.task.custom_fields, details),
      });
    });
  };

  const buildContextMenuActions = (item: ReminderAgendaTaskItem) => [
    {
      label: 'Edit Reminder',
      icon: <Edit2 size={13} />,
      onClick: () => setEditingReminderItem(item),
    },
    {
      label: 'Remove Reminder',
      icon: <BellOff size={13} />,
      onClick: () => void handleRemoveReminder(item),
      divider: true,
    },
  ];

  return (
    <aside className="flex h-full min-h-0 flex-col bg-slate-50/70">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">Agenda</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Reminder checklist grouped by project and priority.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
          title="Close agenda"
        >
          <XCircle size={16} />
        </button>
      </div>

      <div className="border-b border-slate-200 bg-white/90 px-4 py-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{totalTasks} reminder{totalTasks === 1 ? '' : 's'}</span>
          <span>{completedTasks} completed</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center gap-2 text-sm text-slate-500">
            <RefreshCw size={16} className="animate-spin" />
            Loading agenda...
          </div>
        ) : error ? (
          <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadAgenda()}
              className="rounded-xl bg-red-600 px-3 py-2 text-white transition-colors hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : selectedLists.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-4 py-8 text-center text-sm text-slate-500">
            Select a project in the left sidebar to view its reminders here.
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-4 py-8 text-center text-sm text-slate-500">
            No reminders yet. Right-click any task and choose Set Reminder to add one.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const accentColor = getAppearanceColor(group.target.listColor, '#2563EB');
              const priorityBuckets = group.tasks.reduce<Record<string, ReminderAgendaTaskItem[]>>((result, item) => {
                const key = item.priorityLabel?.trim() || 'No Priority';
                result[key] = result[key] ? [...result[key], item] : [item];
                return result;
              }, {});
              const sortedPriorityLabels = Object.keys(priorityBuckets).sort((left, right) => {
                const rankDiff = getPriorityRank(left === 'No Priority' ? null : left) - getPriorityRank(right === 'No Priority' ? null : right);
                if (rankDiff !== 0) return rankDiff;
                return left.localeCompare(right);
              });

              return (
                <section key={group.target.listId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <EntityIcon icon={group.target.listIcon} fallbackIcon="folder-kanban" color={accentColor} size={15} />
                      <h3 className="truncate text-sm font-semibold text-slate-900">{group.target.listName}</h3>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {group.target.workspaceName} / {group.target.spaceName}
                    </p>
                  </div>

                  <div className="space-y-3 px-4 py-4">
                    {sortedPriorityLabels.map((priorityLabel) => (
                      <div key={priorityLabel} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {priorityLabel}
                          </p>
                          <span className="text-[11px] text-slate-400">{priorityBuckets[priorityLabel].length}</span>
                        </div>

                        <div className="space-y-2">
                          {priorityBuckets[priorityLabel].map((item) => {
                            const completed = isCompletedStatus(item.task.status, item.projectSettings);
                            const status = getStatusOption(item.task.status, item.projectSettings);
                            const isBusy = busyTaskIds.has(item.task.id);

                            return (
                              <div
                                key={item.task.id}
                                className={`rounded-xl border px-2.5 py-2 transition-colors ${
                                  completed ? 'border-slate-200 bg-slate-50/80' : 'border-slate-200 bg-white'
                                }`}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  setContextMenu({
                                    item,
                                    x: event.clientX,
                                    y: event.clientY,
                                  });
                                }}
                              >
                                <div className="flex items-start gap-2.5">
                                  <input
                                    type="checkbox"
                                    checked={completed}
                                    disabled={isBusy}
                                    onChange={() => void handleToggleCompleted(item)}
                                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                                  />

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p
                                          className={`truncate text-sm font-medium ${
                                            completed ? 'text-slate-400 line-through' : 'text-slate-800'
                                          }`}
                                          title={item.task.name}
                                        >
                                          {item.task.name}
                                        </p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                                          <span className={getReminderTone(item.reminderAt, completed)}>
                                            {formatCompactDate(item.reminderAt)}
                                          </span>
                                          <span
                                            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                            style={{
                                              backgroundColor: `${status.color}18`,
                                              color: status.color,
                                            }}
                                          >
                                            {status.label}
                                          </span>
                                        </div>
                                        {item.note && (
                                          <p
                                            className={`mt-1 whitespace-pre-wrap text-[11px] leading-4 ${
                                              completed ? 'text-slate-400' : 'text-slate-600'
                                            }`}
                                          >
                                            {item.note}
                                          </p>
                                        )}
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => void handleRemoveReminder(item)}
                                        disabled={isBusy}
                                        className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                                        title="Remove reminder"
                                      >
                                        <BellOff size={14} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={buildContextMenuActions(contextMenu.item)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {editingReminderItem && (
        <ReminderEditorModal
          task={editingReminderItem.task}
          onClose={() => setEditingReminderItem(null)}
          onSave={(details) => handleReminderSave(editingReminderItem, details)}
        />
      )}
    </aside>
  );
};

export default AgendaSidebar;
