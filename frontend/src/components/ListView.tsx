import React from 'react';
import { ArrowDown, ArrowUp, Bell, BellOff, Columns, Edit2, GitBranch, GripVertical, Plus, RefreshCw, Settings2, Trash2, Type } from 'lucide-react';
import type { List as ProjectList, SavedView, SelectedListTarget, StatusOption, Task, TaskDependency, TaskFocusMode, Workspace } from '../types';
import { createTask, deleteList, deleteTask, getList, getTaskTree, getWorkspaces, updateList, updateTask } from '../api';
import { EntityIcon, getAppearanceColor } from '../lib/appearance';
import { CUSTOM_FIELD_TYPE_OPTIONS } from '../lib/customFields';
import { TASKS_MUTATED_EVENT, type TaskMutationDetail, emitTasksMutated } from '../lib/taskEvents';
import { getTaskReminderAt, setTaskReminderDetails } from '../lib/taskReminders';
import { countTasks, filterTaskTree } from '../lib/taskFiltering';
import {
  DEFAULT_COLUMN_LABELS,
  getStatusOption,
  isCompletedStatus,
  normalizeProjectSettings,
  orderByConfiguredIds,
  resolveProjectSchedule,
} from '../lib/projectSettings';
import ContextMenu from './ContextMenu';
import type { ContextMenuAction } from './ContextMenu';
import type { ListColumnConfig } from './listColumns';
import PlannerToolbar from './PlannerToolbar';
import ProjectEditModal from './ProjectEditModal';
import ReminderEditorModal from './ReminderEditorModal';
import TaskEditModal from './TaskEditModal';
import TaskRow from './TaskRow';
import ViewSettingsModal from './ViewSettingsModal';

interface ListViewProps {
  selectedLists: SelectedListTarget[];
  viewMode: 'list' | 'gantt' | 'outlook';
  onViewModeChange: (mode: 'list' | 'gantt' | 'outlook') => void;
  defaultTaskTreeExpanded: boolean;
  onToggleDefaultTaskTreeExpanded: () => void;
  onShareWorkload: () => void;
  agendaOpen: boolean;
  agendaNotificationCount: number;
  onToggleAgenda: () => void;
  mailNotificationCount: number;
}

interface TaskSection {
  target: SelectedListTarget;
  tasks: Task[];
  dependencies: TaskDependency[];
}

interface SpaceOption {
  workspaceId: string;
  workspaceName: string;
  spaceId: string;
  spaceName: string;
}

interface VisibleTaskRow {
  sectionId: string;
  task: Task;
}

type ContextMenuState = { task: Task; x: number; y: number } | null;
type EditModalState = { taskId: string | null; parentId: string | null; listId: string } | null;
type HeaderContextMenuState = { columnId: string; x: number; y: number } | null;
type ReminderModalState = { task: Task } | null;

const DEFAULT_COLUMNS: ListColumnConfig[] = [
  { id: 'name', label: DEFAULT_COLUMN_LABELS.name, width: 320, visible: true, kind: 'builtin', key: 'name' },
  { id: 'status', label: DEFAULT_COLUMN_LABELS.status, width: 170, visible: true, kind: 'builtin', key: 'status' },
  { id: 'start_date', label: DEFAULT_COLUMN_LABELS.start_date, width: 140, visible: true, kind: 'builtin', key: 'start_date' },
  { id: 'end_date', label: DEFAULT_COLUMN_LABELS.end_date, width: 140, visible: true, kind: 'builtin', key: 'end_date' },
  {
    id: 'onboarding_completion',
    label: DEFAULT_COLUMN_LABELS.onboarding_completion,
    width: 150,
    visible: true,
    kind: 'builtin',
    key: 'onboarding_completion',
  },
  { id: 'task_type', label: DEFAULT_COLUMN_LABELS.task_type, width: 130, visible: true, kind: 'builtin', key: 'task_type' },
];

const STORAGE_KEY = 'projectflux:list-column-prefs:v1';
const LAST_LIST_VIEW_PREFIX = 'myproplanner:last-list-view:v1:';

function findTaskById(tasks: Task[], taskId: string): Task | null {
  for (const task of tasks) {
    if (task.id === taskId) return task;
    const childMatch = findTaskById(task.children, taskId);
    if (childMatch) return childMatch;
  }

  return null;
}

function findTaskContext(tasks: Task[], taskId: string, parent: Task | null = null): { task: Task; parent: Task | null } | null {
  for (const task of tasks) {
    if (task.id === taskId) {
      return { task, parent };
    }

    const childMatch = findTaskContext(task.children, taskId, task);
    if (childMatch) return childMatch;
  }

  return null;
}

function getSiblingTasks(tasks: Task[], parentId: string | null): Task[] {
  if (!parentId) return tasks;
  return findTaskContext(tasks, parentId)?.task.children ?? [];
}

function flattenVisibleTaskRows(
  sectionId: string,
  tasks: Task[],
  expandedIds: Set<string>,
  result: VisibleTaskRow[] = []
): VisibleTaskRow[] {
  for (const task of tasks) {
    result.push({ sectionId, task });
    if (task.children.length > 0 && expandedIds.has(task.id)) {
      flattenVisibleTaskRows(sectionId, task.children, expandedIds, result);
    }
  }

  return result;
}

const ListView: React.FC<ListViewProps> = ({
  selectedLists,
  viewMode,
  onViewModeChange,
  defaultTaskTreeExpanded,
  onToggleDefaultTaskTreeExpanded,
  onShareWorkload,
  agendaOpen,
  agendaNotificationCount,
  onToggleAgenda,
  mailNotificationCount,
}) => {
  const [sections, setSections] = React.useState<TaskSection[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState>(null);
  const [headerContextMenu, setHeaderContextMenu] = React.useState<HeaderContextMenuState>(null);
  const [editingColumnId, setEditingColumnId] = React.useState<string | null>(null);
  const [editingColumnValue, setEditingColumnValue] = React.useState('');
  const [editModal, setEditModal] = React.useState<EditModalState>(null);
  const [reminderModal, setReminderModal] = React.useState<ReminderModalState>(null);
  const [editingProjectTarget, setEditingProjectTarget] = React.useState<SelectedListTarget | null>(null);
  const [hoveredProjectId, setHoveredProjectId] = React.useState<string | null>(null);
  const [viewSettingsOpen, setViewSettingsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>([]);
  const [hideCompleted, setHideCompleted] = React.useState(false);
  const [focusMode, setFocusMode] = React.useState<TaskFocusMode>('all');
  const [activeSavedViewId, setActiveSavedViewId] = React.useState('');
  const [activeColumnOrder, setActiveColumnOrder] = React.useState<string[]>([]);
  const [loadedViewStateKey, setLoadedViewStateKey] = React.useState('');
  const [spaceOptions, setSpaceOptions] = React.useState<SpaceOption[]>([]);
  const [columnPrefs, setColumnPrefs] = React.useState<Record<string, { width?: number; visible?: boolean }>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const editingProject = React.useMemo<ProjectList | null>(
    () =>
      editingProjectTarget
        ? {
            id: editingProjectTarget.listId,
            space_id: editingProjectTarget.spaceId,
            folder_id: editingProjectTarget.folderId,
            name: editingProjectTarget.listName,
            color: editingProjectTarget.listColor,
            icon: editingProjectTarget.listIcon,
            start_date: editingProjectTarget.startDate,
            end_date: editingProjectTarget.endDate,
            baseline_start_date: editingProjectTarget.baselineStartDate,
            baseline_end_date: editingProjectTarget.baselineEndDate,
            settings: editingProjectTarget.listSettings,
            folder_name: null,
            created_at: editingProjectTarget.createdAt,
          }
        : null,
    [editingProjectTarget]
  );
  const editingTask = React.useMemo(() => {
    if (!editModal?.taskId) return null;

    for (const section of sections) {
      const match = findTaskById(section.tasks, editModal.taskId);
      if (match) return match;
    }

    return null;
  }, [editModal, sections]);
  const editingTaskSection = React.useMemo(
    () => (editModal ? sections.find((section) => section.target.listId === editModal.listId) ?? null : null),
    [editModal, sections]
  );
  const syncSectionDependencyState = React.useCallback(
    (data: { listId: string; tasks: Task[]; dependencies: TaskDependency[] }) => {
      setSections((prev) =>
        prev.map((section) =>
          section.target.listId === data.listId
            ? {
                ...section,
                tasks: data.tasks,
                dependencies: data.dependencies,
              }
            : section
        )
      );
    },
    []
  );

  const activeProjectSettings = React.useMemo(() => normalizeProjectSettings(selectedLists[0]?.listSettings), [selectedLists]);
  const activeColumnLabels = activeProjectSettings.columnLabels;
  const editableListTarget = selectedLists[0] ?? null;
  const singleSelectedList = selectedLists.length === 1 ? selectedLists[0] : null;
  const viewStateKey = React.useMemo(
    () => `${LAST_LIST_VIEW_PREFIX}${selectedLists.map((item) => item.listId).sort().join('|') || 'none'}`,
    [selectedLists]
  );

  React.useEffect(() => {
    setActiveColumnOrder(activeProjectSettings.columnOrder);
  }, [activeProjectSettings.columnOrder, singleSelectedList?.listId]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(viewStateKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          searchQuery?: string;
          selectedStatuses?: string[];
          hideCompleted?: boolean;
          focusMode?: TaskFocusMode;
          activeSavedViewId?: string;
          activeColumnOrder?: string[];
        };
        setSearchQuery(parsed.searchQuery ?? '');
        setSelectedStatuses(parsed.selectedStatuses ?? []);
        setHideCompleted(Boolean(parsed.hideCompleted));
        setFocusMode(parsed.focusMode ?? 'all');
        setActiveSavedViewId(parsed.activeSavedViewId ?? '');
        setActiveColumnOrder(parsed.activeColumnOrder ?? activeProjectSettings.columnOrder);
      } else {
        setSearchQuery('');
        setSelectedStatuses([]);
        setHideCompleted(false);
        setFocusMode('all');
        setActiveSavedViewId('');
        setActiveColumnOrder(activeProjectSettings.columnOrder);
      }
    } catch {
      setSearchQuery('');
      setSelectedStatuses([]);
      setHideCompleted(false);
      setFocusMode('all');
      setActiveSavedViewId('');
      setActiveColumnOrder(activeProjectSettings.columnOrder);
    }
    setLoadedViewStateKey(viewStateKey);
  }, [activeProjectSettings.columnOrder, viewStateKey]);

  React.useEffect(() => {
    if (loadedViewStateKey !== viewStateKey) return;
    localStorage.setItem(
      viewStateKey,
      JSON.stringify({
        searchQuery,
        selectedStatuses,
        hideCompleted,
        focusMode,
        activeSavedViewId,
        activeColumnOrder,
      })
    );
  }, [activeColumnOrder, activeSavedViewId, focusMode, hideCompleted, loadedViewStateKey, searchQuery, selectedStatuses, viewStateKey]);

  const columns = React.useMemo(() => {
    const customFields = new Map<string, ListColumnConfig>();
    for (const target of selectedLists) {
      for (const field of normalizeProjectSettings(target.listSettings).customFields) {
        if (!customFields.has(field.id)) {
          customFields.set(field.id, {
            id: `custom:${field.id}`,
            label: field.name,
            width: 160,
            visible: true,
            kind: 'custom',
            field,
          });
        }
      }
    }

    const mappedColumns = [...DEFAULT_COLUMNS, ...customFields.values()].map((column) => ({
      ...column,
      label:
        column.kind === 'builtin' && column.key
          ? activeColumnLabels[column.key] || column.label
          : column.label,
      type:
        column.kind === 'builtin' && column.key
          ? activeProjectSettings.builtInColumnTypes?.[column.key]
          : column.field?.type,
      width: columnPrefs[column.id]?.width ?? column.width,
      visible:
        column.kind === 'builtin' && column.key
          ? !(activeProjectSettings.hiddenBuiltInColumns ?? []).includes(column.key)
          : columnPrefs[column.id]?.visible ?? column.visible,
    }));

    return orderByConfiguredIds(mappedColumns, activeColumnOrder.length > 0 ? activeColumnOrder : activeProjectSettings.columnOrder);
  }, [activeColumnLabels, activeColumnOrder, activeProjectSettings.builtInColumnTypes, activeProjectSettings.columnOrder, activeProjectSettings.hiddenBuiltInColumns, columnPrefs, selectedLists]);

  const visibleColumns = React.useMemo(() => columns.filter((column) => column.visible), [columns]);
  const availableStatuses = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof normalizeProjectSettings>['statuses'][number]>();
    for (const target of selectedLists) {
      for (const status of normalizeProjectSettings(target.listSettings).statuses) {
        if (!map.has(status.value)) {
          map.set(status.value, status);
        }
      }
    }
    return Array.from(map.values());
  }, [selectedLists]);

  const filteredSections = React.useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const hasActiveFilters =
      normalizedSearch.length > 0 || selectedStatuses.length > 0 || hideCompleted || focusMode !== 'all';

    return sections
      .map((section) => {
        const settings = section.target.listSettings;
        const filteredTasks = hasActiveFilters
          ? filterTaskTree(section.tasks, (task) => {
              if (selectedStatuses.length > 0 && !selectedStatuses.includes(task.status)) {
                return false;
              }

              if (hideCompleted && isCompletedStatus(task.status, settings)) {
                return false;
              }

              if (focusMode === 'projects' && task.task_type !== 'project') {
                return false;
              }

              if (focusMode === 'milestones' && task.task_type !== 'milestone') {
                return false;
              }

              if (focusMode === 'tasks' && (task.task_type === 'project' || task.task_type === 'milestone')) {
                return false;
              }

              if (!normalizedSearch) {
                return true;
              }

              const searchableText = [
                task.name,
                task.task_type || '',
                getStatusOption(task.status, settings).label,
                ...Object.values(task.custom_fields ?? {}).map((value) =>
                  value === true ? 'yes' : value === false ? 'no' : String(value ?? '')
                ),
              ]
                .join(' ')
                .toLowerCase();

              return searchableText.includes(normalizedSearch);
            })
          : section.tasks;

        return {
          ...section,
          tasks: filteredTasks,
        };
      })
      .filter((section) => !hasActiveFilters || section.tasks.length > 0);
  }, [focusMode, hideCompleted, searchQuery, sections, selectedStatuses]);

  const visibleTaskCount = React.useMemo(
    () => filteredSections.reduce((sum, section) => sum + countTasks(section.tasks), 0),
    [filteredSections]
  );
  const totalTaskCount = React.useMemo(
    () => sections.reduce((sum, section) => sum + countTasks(section.tasks), 0),
    [sections]
  );
  const visibleTaskRows = React.useMemo(
    () =>
      filteredSections.flatMap((section) =>
        flattenVisibleTaskRows(section.target.listId, section.tasks, expandedIds)
      ),
    [expandedIds, filteredSections]
  );

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columnPrefs));
  }, [columnPrefs]);

  React.useEffect(() => {
    let cancelled = false;

    const loadSpaceOptions = async () => {
      try {
        const workspaces = await getWorkspaces();
        if (cancelled) return;
        setSpaceOptions(
          workspaces.flatMap((workspace: Workspace) =>
            workspace.spaces.map((space) => ({
              workspaceId: workspace.id,
              workspaceName: workspace.name,
              spaceId: space.id,
              spaceName: space.name,
            }))
          )
        );
      } catch (err) {
        console.error('Failed to load project space options:', err);
      }
    };

    void loadSpaceOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadTasks = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const nextSections = await Promise.all(
        selectedLists.map(async (target) => {
          const [data, list] = await Promise.all([getTaskTree(target.listId), getList(target.listId)]);
          const schedule = resolveProjectSchedule(list.start_date, list.end_date, list.settings);
          return {
            target: {
              ...target,
              listName: list.name,
              listColor: list.color,
              listIcon: list.icon,
              folderId: list.folder_id,
              startDate: schedule.startDate,
              endDate: schedule.endDate,
              baselineStartDate: list.baseline_start_date,
              baselineEndDate: list.baseline_end_date,
              listSettings: list.settings,
              spaceId: list.space_id,
              createdAt: list.created_at,
            },
            tasks: data.tasks,
            dependencies: data.dependencies,
          };
        })
      );

      setSections(nextSections);

      const toExpand = new Set<string>();
      const collectIds = (tasks: Task[]) => {
        for (const task of tasks) {
          if (task.children.length > 0) {
            toExpand.add(task.id);
            collectIds(task.children);
          }
        }
      };

      nextSections.forEach((section) => collectIds(section.tasks));
      setExpandedIds(toExpand);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [selectedLists]);

  React.useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  React.useEffect(() => {
    const handleTasksMutated = (event: Event) => {
      const detail = (event as CustomEvent<TaskMutationDetail>).detail;
      if (detail?.source === 'list-view') return;
      void loadTasks();
    };

    window.addEventListener(TASKS_MUTATED_EVENT, handleTasksMutated);
    return () => window.removeEventListener(TASKS_MUTATED_EVENT, handleTasksMutated);
  }, [loadTasks]);

  const handleUpdate = async (id: string, data: Partial<Task>) => {
    try {
      await updateTask(id, data as Parameters<typeof updateTask>[1]);
      await loadTasks();
      emitTasksMutated('list-view');
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task and all its subtasks?')) return;
    try {
      await deleteTask(id);
      await loadTasks();
      emitTasksMutated('list-view');
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const handleProjectDelete = async (target: SelectedListTarget) => {
    if (!confirm(`Delete project "${target.listName}" and all its tasks?`)) return;

    try {
      await deleteList(target.listId);
      setSections((prev) => prev.filter((section) => section.target.listId !== target.listId));
      window.dispatchEvent(new Event('myproplanner:project-settings-updated'));
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  const handleAddChild = async (parentId: string, listId: string) => {
    try {
      const defaultStatus =
        normalizeProjectSettings(selectedLists.find((item) => item.listId === listId)?.listSettings).statuses[0]?.value ||
        'NOT_STARTED';
      await createTask({
        list_id: listId,
        parent_id: parentId,
        name: 'New Task',
        status: defaultStatus,
      });
      setExpandedIds((prev) => new Set([...prev, parentId]));
      await loadTasks();
      emitTasksMutated('list-view');
    } catch (err) {
      console.error('Failed to create subtask:', err);
    }
  };

  const handleAddTopLevel = async (listId: string) => {
    try {
      const defaultStatus =
        normalizeProjectSettings(selectedLists.find((item) => item.listId === listId)?.listSettings).statuses[0]?.value ||
        'NOT_STARTED';
      await createTask({ list_id: listId, parent_id: null, name: 'New Task', status: defaultStatus });
      await loadTasks();
      emitTasksMutated('list-view');
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const handleReminderSave = async (task: Task, details: { reminderAt: string | null; note: string | null }) => {
    await updateTask(task.id, {
      custom_fields: setTaskReminderDetails(task.custom_fields, details),
    });
    await loadTasks();
    emitTasksMutated('list-view');
  };

  const persistTaskPositions = React.useCallback(
    async (updates: Array<{ id: string; data: Parameters<typeof updateTask>[1] }>) => {
      const merged = new Map<string, Parameters<typeof updateTask>[1]>();
      for (const update of updates) {
        merged.set(update.id, { ...(merged.get(update.id) ?? {}), ...update.data });
      }
      if (merged.size === 0) return;

      try {
        await Promise.all(Array.from(merged.entries()).map(([id, data]) => updateTask(id, data)));
        await loadTasks();
        emitTasksMutated('list-view');
      } catch (err) {
        console.error('Failed to rearrange tasks:', err);
        await loadTasks();
      }
    },
    [loadTasks]
  );

  const handleMakeSubtaskOfAbove = React.useCallback(
    async (task: Task) => {
      const currentIndex = visibleTaskRows.findIndex((row) => row.task.id === task.id);
      if (currentIndex <= 0) {
        window.alert('There is no task above this one to nest under.');
        return;
      }

      const targetRow = [...visibleTaskRows.slice(0, currentIndex)]
        .reverse()
        .find((row) => row.sectionId === task.list_id);
      if (!targetRow) {
        window.alert('There is no task above this one in the current project.');
        return;
      }

      const section = sections.find((item) => item.target.listId === task.list_id);
      if (!section) return;

      const sourceContext = findTaskContext(section.tasks, task.id);
      if (!sourceContext) return;
      if (sourceContext.parent?.id === targetRow.task.id) return;

      const oldSiblings = getSiblingTasks(section.tasks, sourceContext.parent?.id ?? null).filter((item) => item.id !== task.id);
      const targetChildren = getSiblingTasks(section.tasks, targetRow.task.id);

      await persistTaskPositions([
        ...oldSiblings.map((item, index) => ({ id: item.id, data: { position: index } })),
        ...targetChildren.map((item, index) => ({ id: item.id, data: { position: index } })),
        { id: task.id, data: { parent_id: targetRow.task.id, position: targetChildren.length } },
      ]);
      setExpandedIds((current) => new Set([...current, targetRow.task.id]));
    },
    [persistTaskPositions, sections, visibleTaskRows]
  );

  const handleOutdentTask = React.useCallback(
    async (task: Task) => {
      const section = sections.find((item) => item.target.listId === task.list_id);
      if (!section) return;

      const sourceContext = findTaskContext(section.tasks, task.id);
      const parentTask = sourceContext?.parent;
      if (!sourceContext || !parentTask) {
        window.alert('This task is already at the top level.');
        return;
      }

      const grandParentContext = parentTask.parent_id ? findTaskContext(section.tasks, parentTask.parent_id) : null;
      const targetParentId = grandParentContext?.task.id ?? null;
      const oldSiblings = getSiblingTasks(section.tasks, parentTask.id).filter((item) => item.id !== task.id);
      const targetSiblings = getSiblingTasks(section.tasks, targetParentId).filter((item) => item.id !== task.id);
      const parentIndex = targetSiblings.findIndex((item) => item.id === parentTask.id);
      const insertIndex = parentIndex >= 0 ? parentIndex + 1 : targetSiblings.length;
      const reorderedTargetSiblings = [...targetSiblings];
      reorderedTargetSiblings.splice(insertIndex, 0, sourceContext.task);

      await persistTaskPositions([
        ...oldSiblings.map((item, index) => ({ id: item.id, data: { position: index } })),
        ...reorderedTargetSiblings.map((item, index) => ({
          id: item.id,
          data: item.id === task.id ? { parent_id: targetParentId, position: index } : { position: index },
        })),
      ]);
    },
    [persistTaskPositions, sections]
  );

  const buildContextMenuActions = (task: Task) => {
    const hasReminder = Boolean(getTaskReminderAt(task));
    const canLevelDown = task.parent_id !== null;

    return [
      {
        label: 'Edit Task',
        icon: <Edit2 size={13} />,
        onClick: () => setEditModal({ taskId: task.id, parentId: null, listId: task.list_id }),
      },
      {
        label: hasReminder ? 'Edit Reminder...' : 'Set Reminder...',
        icon: <Bell size={13} />,
        onClick: () => setReminderModal({ task }),
      },
      ...(hasReminder
        ? [
            {
              label: 'Clear Reminder',
              icon: <BellOff size={13} />,
              onClick: () => void handleReminderSave(task, { reminderAt: null, note: null }),
            },
          ]
        : []),
      {
        label: 'Move to List...',
        icon: <GitBranch size={13} />,
        onClick: () => setEditModal({ taskId: task.id, parentId: null, listId: task.list_id }),
        divider: true,
      },
      {
        label: 'Level Up Under Task Above',
        icon: <GitBranch size={13} />,
        onClick: () => void handleMakeSubtaskOfAbove(task),
      },
      ...(canLevelDown
        ? [
            {
              label: 'Level Down To Parent Level',
              icon: <GripVertical size={13} />,
              onClick: () => void handleOutdentTask(task),
            },
          ]
        : []),
      {
        label: 'New Subtask',
        icon: <GitBranch size={13} />,
        onClick: () => setEditModal({ taskId: null, parentId: task.id, listId: task.list_id }),
      },
      {
        label: 'New Task at Same Level',
        icon: <Plus size={13} />,
        onClick: () => setEditModal({ taskId: null, parentId: task.parent_id, listId: task.list_id }),
      },
      {
        label: 'Delete Task',
        icon: <Trash2 size={13} />,
        onClick: () => void handleDelete(task.id),
        danger: true,
        divider: true,
      },
    ];
  };

  const startResize = (columnId: string, startWidth: number, startX: number) => {
    const onMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - startX;
      setActiveSavedViewId('');
      setColumnPrefs((prev) => ({
        ...prev,
        [columnId]: {
          ...prev[columnId],
          width: Math.max(90, startWidth + delta),
        },
      }));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const moveColumn = (columnId: string, direction: -1 | 1) => {
    setActiveSavedViewId('');
    setActiveColumnOrder((current) => {
      const resolved = current.length > 0 ? [...current] : columns.map((column) => column.id);
      const index = resolved.indexOf(columnId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= resolved.length) return resolved;
      const next = [...resolved];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };


  const moveColumnToEdge = (columnId: string, edge: 'start' | 'end') => {
    setActiveSavedViewId('');
    setActiveColumnOrder((current) => {
      const resolved = current.length > 0 ? [...current] : columns.map((column) => column.id);
      const next = resolved.filter((id) => id !== columnId);
      if (edge === 'start') {
        next.unshift(columnId);
      } else {
        next.push(columnId);
      }
      return next;
    });
  };

  const toggleColumnVisibility = (columnId: string, visible: boolean) => {
    setActiveSavedViewId('');
    const column = columns.find((item) => item.id === columnId);
    if (!column) return;

    if (column.kind === 'builtin' && column.key) {
      const columnKey = column.key;
      void updateProjectSettings((settings) => ({
        ...settings,
        hiddenBuiltInColumns: visible
          ? (settings.hiddenBuiltInColumns ?? []).filter((item) => item !== columnKey)
          : [...(settings.hiddenBuiltInColumns ?? []).filter((item) => item !== columnKey), columnKey],
      }));
      return;
    }

    setColumnPrefs((prev) => ({
      ...prev,
      [column.id]: {
        ...prev[column.id],
        visible,
      },
    }));
  };

  const applySavedView = React.useCallback(
    (view: SavedView | null) => {
      if (!view) {
        setSearchQuery('');
        setSelectedStatuses([]);
        setHideCompleted(false);
        setFocusMode('all');
        return;
      }

      setSearchQuery(view.searchQuery || '');
      setSelectedStatuses(view.statusFilters || []);
      setHideCompleted(Boolean(view.hideCompleted));
      setFocusMode(view.focusMode || 'all');
      if (view.columnOrder && view.columnOrder.length > 0) {
        setActiveColumnOrder(view.columnOrder);
      }
      if (view.columnVisibility || view.columnWidths) {
        setColumnPrefs((prev) => {
          const nextPrefs = { ...prev };

          for (const [columnId, visible] of Object.entries(view.columnVisibility ?? {})) {
            nextPrefs[columnId] = {
              ...nextPrefs[columnId],
              visible,
            };
          }

          for (const [columnId, width] of Object.entries(view.columnWidths ?? {})) {
            nextPrefs[columnId] = {
              ...nextPrefs[columnId],
              width,
            };
          }

          return nextPrefs;
        });
      }
    },
    []
  );

  const handleSavedViewSelect = React.useCallback(
    (viewId: string) => {
      setActiveSavedViewId(viewId);
      const nextView = activeProjectSettings.savedViews.find((view) => view.id === viewId) || null;
      applySavedView(nextView);
    },
    [activeProjectSettings.savedViews, applySavedView]
  );

  const handleSaveCurrentView = async () => {
    if (!singleSelectedList) return;
    const name = window.prompt('Name this saved view');
    if (!name?.trim()) return;

    const nextView: SavedView = {
      id: crypto.randomUUID(),
      name: name.trim(),
      searchQuery,
      statusFilters: selectedStatuses,
      hideCompleted,
      focusMode,
      columnVisibility: Object.fromEntries(columns.map((column) => [column.id, column.visible])),
      columnWidths: Object.fromEntries(columns.map((column) => [column.id, column.width])),
      columnOrder: columns.map((column) => column.id),
    };

    try {
      await updateList(singleSelectedList.listId, {
        settings: {
          ...activeProjectSettings,
          savedViews: [...activeProjectSettings.savedViews, nextView],
        },
      });
      setActiveSavedViewId(nextView.id);
      window.dispatchEvent(new Event('myproplanner:project-settings-updated'));
    } catch (err) {
      console.error('Failed to save view:', err);
    }
  };

  const updateProjectSettings = async (
    updater: (settings: ReturnType<typeof normalizeProjectSettings>) => ReturnType<typeof normalizeProjectSettings>
  ) => {
    if (!editableListTarget) return;

    try {
      const nextSettings = updater(activeProjectSettings);
      await updateList(editableListTarget.listId, {
        settings: nextSettings,
      });
      window.dispatchEvent(new Event('myproplanner:project-settings-updated'));
    } catch (err) {
      console.error('Failed to update project settings:', err);
    }
  };

  const updateStatusesForList = async (
    listId: string,
    updater: (statuses: ReturnType<typeof normalizeProjectSettings>['statuses']) => ReturnType<typeof normalizeProjectSettings>['statuses']
  ) => {
    const currentTarget = sections.find((section) => section.target.listId === listId)?.target
      ?? selectedLists.find((item) => item.listId === listId);
    const currentSettings = normalizeProjectSettings(currentTarget?.listSettings);

    try {
      await updateList(listId, {
        settings: {
          ...currentSettings,
          statuses: updater(currentSettings.statuses),
        },
      });
      window.dispatchEvent(new Event('myproplanner:project-settings-updated'));
      await loadTasks();
    } catch (err) {
      console.error('Failed to update statuses:', err);
    }
  };

  const handleAddStatusOption = async (task: Task, option: StatusOption) => {
    await updateStatusesForList(task.list_id, (statuses) => [...statuses, option]);
  };

  const handleEditStatusOption = async (
    task: Task,
    value: string,
    updates: Pick<StatusOption, 'label' | 'color'>
  ) => {
    await updateStatusesForList(task.list_id, (statuses) =>
      statuses.map((status) => (status.value === value ? { ...status, ...updates } : status))
    );
  };

  const renameColumn = async (columnId: string, nextLabelInput?: string) => {
    if (!editableListTarget) return;
    const column = columns.find((item) => item.id === columnId);
    if (!column) return;

    const currentLabel = column.kind === 'builtin' && column.key
      ? activeProjectSettings.columnLabels[column.key] || column.label
      : column.field?.name || column.label;
    const nextLabel = nextLabelInput ?? window.prompt('Column name', currentLabel) ?? '';
    if (!nextLabel?.trim()) return;

    if (column.kind === 'builtin' && column.key) {
      await updateProjectSettings((settings) => ({
        ...settings,
        columnLabels: {
          ...settings.columnLabels,
          [column.key!]: nextLabel.trim(),
        },
      }));
      return;
    }

    if (column.kind === 'custom' && column.field) {
      await updateProjectSettings((settings) => ({
        ...settings,
        customFields: settings.customFields.map((field) =>
          field.id === column.field!.id ? { ...field, name: nextLabel.trim() } : field
        ),
      }));
    }
  };

  const resetColumnLabel = async (columnId: string) => {
    if (!editableListTarget) return;
    const column = columns.find((item) => item.id === columnId);
    if (!column || column.kind !== 'builtin' || !column.key) return;

    await updateProjectSettings((settings) => ({
      ...settings,
      columnLabels: {
        ...settings.columnLabels,
        [column.key!]: DEFAULT_COLUMN_LABELS[column.key!],
      },
    }));
  };

  const changeCustomFieldType = async (columnId: string, explicitType?: string) => {
    if (!editableListTarget) return;
    const column = columns.find((item) => item.id === columnId);
    if (!column || column.kind !== 'custom' || !column.field) return;

    const currentType = column.field.type;
    const nextType = explicitType ?? window.prompt(
      `Field type (${CUSTOM_FIELD_TYPE_OPTIONS.map((option) => option.value).join(', ')})`,
      currentType
    );
    if (!nextType?.trim()) return;

    const normalizedType = nextType.trim().toLowerCase();
    if (!CUSTOM_FIELD_TYPE_OPTIONS.some((option) => option.value === normalizedType)) return;

    await updateProjectSettings((settings) => ({
      ...settings,
      customFields: settings.customFields.map((field) =>
        field.id === column.field!.id ? { ...field, type: normalizedType as typeof field.type } : field
      ),
    }));
  };

  const setBuiltInColumnType = async (columnId: string, nextType: string) => {
    const column = columns.find((item) => item.id === columnId);
    if (!column || column.kind !== 'builtin' || !column.key) return;

    await updateProjectSettings((settings) => ({
      ...settings,
      builtInColumnTypes: {
        ...settings.builtInColumnTypes,
        [column.key!]: nextType as any,
      },
    }));
  };

  const startHeaderEditing = (columnId: string) => {
    const column = columns.find((item) => item.id === columnId);
    if (!column) return;
    const currentLabel =
      column.kind === 'builtin' && column.key
        ? activeProjectSettings.columnLabels[column.key] || column.label
        : column.field?.name || column.label;
    setEditingColumnId(columnId);
    setEditingColumnValue(currentLabel);
  };

  const saveHeaderEditing = async () => {
    if (!editingColumnId) return;
    const columnId = editingColumnId;
    const nextLabel = editingColumnValue.trim();
    setEditingColumnId(null);
    setEditingColumnValue('');
    if (!nextLabel) return;
    await renameColumn(columnId, nextLabel);
  };

  const activeSavedViewName = React.useMemo(
    () => activeProjectSettings.savedViews.find((view) => view.id === activeSavedViewId)?.name ?? '',
    [activeProjectSettings.savedViews, activeSavedViewId]
  );

  const headerContextColumn = headerContextMenu
    ? columns.find((column) => column.id === headerContextMenu.columnId) ?? null
    : null;

  const headerContextActions = React.useMemo<ContextMenuAction[]>(() => {
    if (!headerContextMenu || !headerContextColumn) return [];

    const actions: ContextMenuAction[] = [
      {
        label: headerContextColumn.kind === 'custom' ? 'Edit field' : 'Rename column',
        icon: <Edit2 size={13} />,
        onClick: () => startHeaderEditing(headerContextMenu.columnId),
      },
      {
        label: 'Move to start',
        icon: <ArrowUp size={13} />,
        onClick: () => moveColumnToEdge(headerContextMenu.columnId, 'start'),
      },
      {
        label: 'Move to end',
        icon: <ArrowDown size={13} />,
        onClick: () => moveColumnToEdge(headerContextMenu.columnId, 'end'),
      },
      {
        label: 'Hide column',
        icon: <Columns size={13} />,
        onClick: () => toggleColumnVisibility(headerContextMenu.columnId, false),
      },
    ];

    if (headerContextColumn.kind === 'builtin') {
      if (headerContextColumn.key === 'onboarding_completion') {
        actions.push(
          {
            label: 'Use as text',
            icon: <Type size={13} />,
            onClick: () => void setBuiltInColumnType(headerContextMenu.columnId, 'text'),
            divider: true,
          },
          {
            label: 'Use as date',
            icon: <Columns size={13} />,
            onClick: () => void setBuiltInColumnType(headerContextMenu.columnId, 'date'),
          },
          {
            label: 'Use as progress bar',
            icon: <Columns size={13} />,
            onClick: () => void setBuiltInColumnType(headerContextMenu.columnId, 'progress'),
          }
        );
      }

      actions.push({
        label: 'Reset label',
        icon: <RefreshCw size={13} />,
        onClick: () => void resetColumnLabel(headerContextMenu.columnId),
        divider: headerContextColumn.key !== 'onboarding_completion',
      });
    }

    if (headerContextColumn.kind === 'custom') {
      actions.push(
        {
          label: 'Use as text field',
          icon: <Type size={13} />,
          onClick: () => void changeCustomFieldType(headerContextMenu.columnId, 'text'),
          divider: true,
        },
        {
          label: 'Use as number field',
          icon: <Type size={13} />,
          onClick: () => void changeCustomFieldType(headerContextMenu.columnId, 'number'),
        },
        {
          label: 'Use as date field',
          icon: <Columns size={13} />,
          onClick: () => void changeCustomFieldType(headerContextMenu.columnId, 'date'),
        },
        {
          label: 'Use as progress bar',
          icon: <Columns size={13} />,
          onClick: () => void changeCustomFieldType(headerContextMenu.columnId, 'progress'),
        },
        {
          label: 'More field types...',
          icon: <Settings2 size={13} />,
          onClick: () => void changeCustomFieldType(headerContextMenu.columnId),
        }
      );
    }

    actions.push({
      label: 'Open Customize',
      icon: <Settings2 size={13} />,
      onClick: () => setViewSettingsOpen(true),
      divider: true,
    });

    return actions;
  }, [changeCustomFieldType, columns, headerContextColumn, headerContextMenu, moveColumnToEdge, resetColumnLabel, setViewSettingsOpen, setBuiltInColumnType, toggleColumnVisibility]);

  const listCustomizeOverview = (
    <section className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">List options</p>
      <div className="rounded-[1.4rem] border border-slate-200 bg-white p-1.5 shadow-sm">
        <button
          type="button"
          onClick={onToggleDefaultTaskTreeExpanded}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-50"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-slate-900">Tasks open by default</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Start project task trees expanded whenever you open the planner.</p>
          </div>
          <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${defaultTaskTreeExpanded ? 'bg-blue-600' : 'bg-slate-200'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${defaultTaskTreeExpanded ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
          </span>
        </button>
        <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-slate-900">Visible fields</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Use Fields below to show, hide, and reorder the columns you rely on every day.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {columns.filter((column) => column.visible).length} shown
          </span>
        </div>
      </div>
    </section>
  );

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading tasks...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-3">
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => void loadTasks()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PlannerToolbar
        selectedLists={selectedLists}
        resultSummary={
          visibleTaskCount === totalTaskCount
            ? `${totalTaskCount} tasks across ${selectedLists.length} selected project${selectedLists.length === 1 ? '' : 's'}`
            : `${visibleTaskCount} of ${totalTaskCount} tasks match the current filters`
        }
        searchQuery={searchQuery}
        onSearchQueryChange={(value) => {
          setActiveSavedViewId('');
          setSearchQuery(value);
        }}
        statusOptions={availableStatuses}
        selectedStatuses={selectedStatuses}
        hideCompleted={hideCompleted}
        onToggleHideCompleted={() => {
          setActiveSavedViewId('');
          setHideCompleted((current) => !current);
        }}
        focusMode={focusMode}
        onFocusModeChange={(mode) => {
          setActiveSavedViewId('');
          setFocusMode(mode);
        }}
        onToggleStatus={(status) =>
          {
            setActiveSavedViewId('');
            setSelectedStatuses((prev) =>
              prev.includes(status) ? prev.filter((value) => value !== status) : [...prev, status]
            );
          }
        }
        onClearFilters={() => {
          setActiveSavedViewId('');
          setSearchQuery('');
          setSelectedStatuses([]);
          setHideCompleted(false);
          setFocusMode('all');
        }}
        onOpenViewBuilder={() => setViewSettingsOpen(true)}
        onRefresh={() => void loadTasks()}
        viewBuilderDisabled={!editableListTarget}
        viewBuilderTitle={
          editableListTarget
            ? 'Change fields, labels, and saved views.'
            : 'Select a project to customize it.'
        }
        savedViews={singleSelectedList ? activeProjectSettings.savedViews : []}
        activeSavedViewId={activeSavedViewId}
        activeSavedViewName={singleSelectedList ? activeSavedViewName || undefined : undefined}
        onSavedViewSelect={singleSelectedList ? handleSavedViewSelect : undefined}
        onSaveCurrentView={singleSelectedList ? handleSaveCurrentView : undefined}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        defaultTaskTreeExpanded={defaultTaskTreeExpanded}
        onToggleDefaultTaskTreeExpanded={onToggleDefaultTaskTreeExpanded}
        onShareWorkload={onShareWorkload}
        agendaOpen={agendaOpen}
        agendaNotificationCount={agendaNotificationCount}
        onToggleAgenda={onToggleAgenda}
        mailNotificationCount={mailNotificationCount}
        extraActions={
          <details className="relative z-30">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50">
              <Columns size={14} />
              Fields
            </summary>
            <div className="absolute right-0 top-full z-[90] mt-2 w-44 rounded-[1rem] border border-slate-200 bg-white p-2 shadow-2xl">
              <div className="max-h-[68vh] space-y-2 overflow-y-auto">
                {columns.map((column, index) => (
                  <div key={column.id} className="flex items-center justify-between gap-3 text-xs text-slate-700">
                    <label className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <span className="truncate">{column.label}</span>
                      <input
                        type="checkbox"
                        checked={column.visible}
                        onChange={(e) => toggleColumnVisibility(column.id, e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveColumn(column.id, -1)}
                        disabled={index === 0}
                        className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30"
                        title="Move column left"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveColumn(column.id, 1)}
                        disabled={index === columns.length - 1}
                        className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30"
                        title="Move column right"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </details>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-collapse" style={{ minWidth: visibleColumns.reduce((sum, column) => sum + column.width, 0), width: '100%' }}>
          <colgroup>
            {visibleColumns.map((column) => (
              <col key={column.id} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-gray-200">
              {visibleColumns.map((column) => (
                <th
                  key={column.id}
                  className="relative px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                  onDoubleClick={() => startHeaderEditing(column.id)}
                  onContextMenu={(event) => {
                    if (!editableListTarget) return;
                    event.preventDefault();
                    setHeaderContextMenu({ columnId: column.id, x: event.clientX, y: event.clientY });
                  }}
                >
                  {editingColumnId === column.id ? (
                    <input
                      value={editingColumnValue}
                      onChange={(event) => setEditingColumnValue(event.target.value)}
                      onBlur={() => void saveHeaderEditing()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void saveHeaderEditing();
                        }
                        if (event.key === 'Escape') {
                          setEditingColumnId(null);
                          setEditingColumnValue('');
                        }
                      }}
                      className="w-full rounded border border-blue-300 px-2 py-1 text-xs font-semibold normal-case tracking-normal text-gray-700 outline-none focus:border-blue-500"
                      autoFocus
                    />
                  ) : (
                    <span className="cursor-text">{column.label}</span>
                  )}
                  <button
                    type="button"
                    onMouseDown={(event) => startResize(column.id, column.width, event.clientX)}
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
                    title="Resize column"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredSections.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length || 1} className="py-12 text-center text-sm text-gray-400">
                  {sections.length === 0 ? 'No selected projects found.' : 'No tasks match the current filters.'}
                </td>
              </tr>
            ) : (
              filteredSections.map((section) => {
                const accentColor = getAppearanceColor(section.target.listColor, '#2563EB');
                const sectionSettings = normalizeProjectSettings(section.target.listSettings);
                const statusOptions = sectionSettings.statuses;
                return (
                  <React.Fragment key={section.target.listId}>
                    <tr
                      className="border-y border-gray-200 bg-slate-50"
                      onMouseEnter={() => setHoveredProjectId(section.target.listId)}
                      onMouseLeave={() => setHoveredProjectId((current) => (current === section.target.listId ? null : current))}
                      onDoubleClick={() => setEditingProjectTarget(section.target)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setEditingProjectTarget(section.target);
                      }}
                    >
                      <td colSpan={visibleColumns.length || 1} className="px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div className="flex min-w-0 items-center gap-2">
                            <EntityIcon
                              icon={section.target.listIcon}
                              fallbackIcon="folder-kanban"
                              color={accentColor}
                              size={14}
                            />
                            <span className="truncate text-sm font-semibold text-gray-800">
                              {section.target.listName}
                            </span>
                            <span className="truncate text-xs text-gray-500">
                              {section.target.workspaceName} / {section.target.spaceName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {hoveredProjectId === section.target.listId && (
                              <>
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setEditingProjectTarget(section.target);
                                  }}
                                  className="rounded p-1 text-gray-400 transition-colors hover:bg-slate-200 hover:text-gray-700"
                                  title="Edit project"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleAddTopLevel(section.target.listId);
                                  }}
                                  className="rounded p-1 text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700"
                                  title="Add task"
                                >
                                  <Plus size={12} />
                                </button>
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleProjectDelete(section.target);
                                  }}
                                  className="rounded p-1 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600"
                                  title="Delete project"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {section.tasks.length === 0 ? (
                      <tr>
                        <td colSpan={visibleColumns.length || 1} className="py-8 text-center text-sm text-gray-400">
                          No tasks yet in this project.
                        </td>
                      </tr>
                    ) : (
                      section.tasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          depth={0}
                          projectColor={section.target.listColor}
                          projectIcon={section.target.listIcon}
                          statusOptions={statusOptions}
                          builtInColumnTypes={sectionSettings.builtInColumnTypes}
                          columns={columns}
                          onUpdate={handleUpdate}
                          onAddStatusOption={handleAddStatusOption}
                          onEditStatusOption={handleEditStatusOption}
                          onDelete={handleDelete}
                          onAddChild={(parentId) => void handleAddChild(parentId, task.list_id)}
                          onEdit={(nextTask) =>
                            setEditModal({ taskId: nextTask.id, parentId: null, listId: nextTask.list_id })
                          }
                          expandedIds={expandedIds}
                          onToggleExpand={(id) => {
                            setExpandedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return next;
                            });
                          }}
                          onContextMenu={(nextTask, x, y) => setContextMenu({ task: nextTask, x, y })}
                        />
                      ))
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={buildContextMenuActions(contextMenu.task)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {headerContextMenu && (
        <ContextMenu
          x={headerContextMenu.x}
          y={headerContextMenu.y}
          actions={headerContextActions}
          onClose={() => setHeaderContextMenu(null)}
        />
      )}

      {editModal && (
        <TaskEditModal
          key={`${editModal.taskId ?? 'new'}:${editModal.listId}:${editModal.parentId ?? 'root'}`}
          taskId={editModal.taskId}
          task={editingTask}
          listId={editModal.listId}
          parentId={editModal.parentId}
          initialTasks={editingTaskSection?.tasks}
          initialDependencies={editingTaskSection?.dependencies}
          onDependencyAdded={syncSectionDependencyState}
          onDependencyRemoved={syncSectionDependencyState}
          onClose={() => setEditModal(null)}
          onSaved={async () => {
            await loadTasks();
            emitTasksMutated('list-view');
          }}
          onMoved={async () => {
            await loadTasks();
            emitTasksMutated('list-view');
          }}
        />
      )}

      {reminderModal && (
        <ReminderEditorModal
          task={reminderModal.task}
          onClose={() => setReminderModal(null)}
          onSave={(details) => handleReminderSave(reminderModal.task, details)}
        />
      )}

      {viewSettingsOpen && editableListTarget && (
        <ViewSettingsModal
          project={{
            id: editableListTarget.listId,
            name: editableListTarget.listName,
            start_date: editableListTarget.startDate,
            end_date: editableListTarget.endDate,
            settings: editableListTarget.listSettings,
          }}
          onClose={() => setViewSettingsOpen(false)}
          onSaved={loadTasks}
          viewType="list"
          currentViewName={activeSavedViewName || 'Working view'}
          overviewContent={listCustomizeOverview}
        />
      )}

      {editingProject && (
        <ProjectEditModal
          project={editingProject}
          spaceOptions={spaceOptions}
          onClose={() => setEditingProjectTarget(null)}
          onSaved={loadTasks}
        />
      )}
    </div>
  );
};

export default ListView;
