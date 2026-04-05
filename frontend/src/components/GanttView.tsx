import React from 'react';
import { AlertTriangle, Bell, BellOff, CalendarDays, ChevronDown, ChevronRight, Download, Edit2, FileText, GitBranch, GripVertical, Plus, RefreshCw, Trash2, Type, X } from 'lucide-react';
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInDays,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { GanttZoomLevel, List as ProjectList, SavedView, SelectedListTarget, Task, TaskDependency, TaskFocusMode, Workspace } from '../types';
import { addDependency, createTask, deleteList, deleteTask, getList, getTaskTree, getWorkspaces, removeDependency, updateList, updateTask } from '../api';
import { EntityIcon, getAppearanceColor } from '../lib/appearance';
import { countTasks, filterTaskTree } from '../lib/taskFiltering';
import { TASKS_MUTATED_EVENT, type TaskMutationDetail, emitTasksMutated } from '../lib/taskEvents';
import { getTaskReminderAt, setTaskReminderDetails } from '../lib/taskReminders';
import { createWorkbookBlob } from '../lib/xlsx';
import {
  DEFAULT_COLUMN_LABELS,
  getStatusOption,
  isCompletedStatus,
  normalizeProjectSettings,
  resolveProjectSchedule,
} from '../lib/projectSettings';
import ContextMenu from './ContextMenu';
import PlannerToolbar from './PlannerToolbar';
import ProjectEditModal from './ProjectEditModal';
import ReminderEditorModal from './ReminderEditorModal';
import TaskEditModal from './TaskEditModal';
import ViewSettingsModal from './ViewSettingsModal';

type ZoomLevel = GanttZoomLevel;

const MIN_ROW_HEIGHT = 38;
const DEFAULT_GANTT_FONT_SIZE = 12;
const DEFAULT_GANTT_ZOOM_SCALE = 100;
const GANTT_LABEL_WIDTH_KEY = 'projectflux:gantt-label-width:v1';
const GANTT_PLANNER_HEIGHT_KEY = 'projectflux:gantt-planner-height:v1';
const MAX_PLANNER_PANEL_HEIGHT = 280;
const MIN_PLANNER_PANEL_HEIGHT = 96;
const LAST_GANTT_VIEW_PREFIX = 'myproplanner:last-gantt-view:v1:';

interface GanttViewProps {
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
  uiScale: number;
  onUiScaleChange: (scale: number) => void;
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

interface TaskRowItem {
  kind: 'task';
  section: TaskSection;
  task: Task;
  depth: number;
}

interface SectionRowItem {
  kind: 'section';
  section: TaskSection;
}

type GanttRow = TaskRowItem | SectionRowItem;
type ContextMenuState = { task: Task; x: number; y: number } | null;
type EditModalState = { taskId: string | null; parentId: string | null; listId: string } | null;
type ReminderModalState = { task: Task } | null;
type DependencyContextMenuState = DependencyEditorState | null;
type DependencyEditorState = {
  dependency: TaskDependency;
  sectionId: string;
  x: number;
  y: number;
  predecessorName: string;
  successorName: string;
  conflictMessages: string[];
};
type ProjectHealthStatus = 'healthy' | 'watch' | 'at_risk';
type ProjectHealthSummary = {
  listId: string;
  listName: string;
  health: ProjectHealthStatus;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  slippedTasks: number;
  criticalTasks: number;
  finishDrivers: number;
  averageProgress: number;
  totalVarianceDays: number;
  maxVarianceDays: number;
};
type CriticalPathDetails = {
  criticalTaskIds: Set<string>;
  criticalDependencyIds: Set<string>;
  finishDriverTaskIds: Set<string>;
  slackByTaskId: Map<string, number>;
  sectionFinishDate: string | null;
};
type HoverToolbarMenuId = 'display' | null;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEPENDENCY_TYPE_LABELS: Record<string, string> = {
  FS: 'Finish before next task starts',
};
const DEPENDENCY_TYPE_HINTS: Record<string, string> = {
  FS: 'The next task can only start after the previous task is done.',
};

function calculateDraggedDates(
  dragging: { origStart: string; origEnd: string; mode: 'move' | 'start' | 'end' },
  daysDelta: number
) {
  const origStart = parseISO(dragging.origStart);
  const origEnd = parseISO(dragging.origEnd);
  let nextStart = origStart;
  let nextEnd = origEnd;

  if (dragging.mode === 'move') {
    nextStart = addDays(origStart, daysDelta);
    nextEnd = addDays(origEnd, daysDelta);
  }

  if (dragging.mode === 'start') {
    const candidateStart = addDays(origStart, daysDelta);
    nextStart = candidateStart.getTime() > origEnd.getTime() ? origEnd : candidateStart;
    nextEnd = origEnd;
  }

  if (dragging.mode === 'end') {
    const candidateEnd = addDays(origEnd, daysDelta);
    nextStart = origStart;
    nextEnd = candidateEnd.getTime() < origStart.getTime() ? origStart : candidateEnd;
  }

  return {
    start_date: format(nextStart, 'yyyy-MM-dd'),
    end_date: format(nextEnd, 'yyyy-MM-dd'),
  };
}

function flattenVisibleTaskRows(section: TaskSection, tasks: Task[], collapsedTaskIds: Set<string>, depth = 0): TaskRowItem[] {
  const result: TaskRowItem[] = [];
  for (const task of tasks) {
    result.push({ kind: 'task', section, task, depth });
    if (task.children.length > 0 && !collapsedTaskIds.has(task.id)) {
      result.push(...flattenVisibleTaskRows(section, task.children, collapsedTaskIds, depth + 1));
    }
  }
  return result;
}

function getDayWidth(zoom: ZoomLevel, zoomScale = DEFAULT_GANTT_ZOOM_SCALE) {
  const multiplier = Math.max(0.4, Math.min(3, zoomScale / 100));
  switch (zoom) {
    case 'days':
      return Math.max(12, Math.round(30 * multiplier));
    case 'weeks':
      return Math.max(6, Math.round(14 * multiplier));
    case 'months':
      return Math.max(2, Math.round(6 * multiplier));
  }
}

function updateTaskInTree(taskList: Task[], id: string, data: Partial<Task>): Task[] {
  return taskList.map((task) => {
    if (task.id === id) return { ...task, ...data };
    if (task.children.length > 0) {
      return { ...task, children: updateTaskInTree(task.children, id, data) };
    }
    return task;
  });
}

function getTaskProgress(task: Task): number | null {
  const value = task.custom_fields?.progress;
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function flattenTasks(tasks: Task[], result: Task[] = []): Task[] {
  for (const task of tasks) {
    result.push(task);
    if (task.children.length > 0) {
      flattenTasks(task.children, result);
    }
  }
  return result;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseHexColor(color: string) {
  const normalized = color.trim().replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : normalized;

  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;

  return {
    red: parseInt(expanded.slice(0, 2), 16),
    green: parseInt(expanded.slice(2, 4), 16),
    blue: parseInt(expanded.slice(4, 6), 16),
  };
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function mixHexColors(baseColor: string, targetColor: string, amount: number) {
  const base = parseHexColor(baseColor);
  const target = parseHexColor(targetColor);
  if (!base || !target) return baseColor;

  const ratio = clamp(amount, 0, 1);
  return rgbToHex(
    base.red + (target.red - base.red) * ratio,
    base.green + (target.green - base.green) * ratio,
    base.blue + (target.blue - base.blue) * ratio
  );
}

function getColorLuminance(color: string) {
  const parsed = parseHexColor(color);
  if (!parsed) return 0.5;
  return (0.2126 * parsed.red + 0.7152 * parsed.green + 0.0722 * parsed.blue) / 255;
}

function getStatusCompletionRatio(status: string, settings: ReturnType<typeof normalizeProjectSettings>) {
  if (isCompletedStatus(status, settings)) return 1;
  const statuses = settings.statuses;
  const statusIndex = statuses.findIndex((option) => option.value === status);
  if (statusIndex <= 0 || statuses.length <= 1) return 0;
  return clamp(statusIndex / (statuses.length - 1), 0, 1);
}

function getTaskCompletionRatio(task: Task, settings: ReturnType<typeof normalizeProjectSettings>) {
  if (isCompletedStatus(task.status, settings)) return 1;
  const progress = getTaskProgress(task);
  if (progress !== null) return clamp(progress / 100, 0, 1);
  return getStatusCompletionRatio(task.status, settings);
}

function getTaskBarVisualStyle(task: Task, settings: ReturnType<typeof normalizeProjectSettings>, baseColor: string) {
  const completionRatio = getTaskCompletionRatio(task, settings);
  const lightStateColor = mixHexColors(baseColor, '#FFFFFF', 0.52);
  const darkStateColor = mixHexColors(baseColor, '#0F172A', 0.2);
  const fillColor = mixHexColors(lightStateColor, darkStateColor, completionRatio);
  const topHighlightColor = mixHexColors(fillColor, '#FFFFFF', 0.18);
  const bottomShadeColor = mixHexColors(fillColor, '#0F172A', 0.12 + completionRatio * 0.08);
  const labelColor = getColorLuminance(fillColor) > 0.63 ? '#0F172A' : '#FFFFFF';
  const progressAccent = labelColor === '#0F172A' ? 'rgba(15, 23, 42, 0.18)' : 'rgba(255,255,255,0.28)';

  return {
    completionRatio,
    fillColor,
    topHighlightColor,
    bottomShadeColor,
    labelColor,
    progressAccent,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getProjectHealthLabel(status: ProjectHealthStatus) {
  if (status === 'healthy') return 'Healthy';
  if (status === 'watch') return 'Watch';
  return 'At risk';
}

function buildStakeholderReportHtml(params: {
  generatedAt: string;
  summaryCards: Array<[string, string]>;
  reportSummaries: ProjectHealthSummary[];
  slippedTaskRows: Array<{ taskName: string; listName: string; varianceDays: number }>;
}) {
  const { generatedAt, summaryCards, reportSummaries, slippedTaskRows } = params;

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>MyProPlanner Stakeholder Report</title>
        <style>
          @page { size: auto; margin: 16mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; padding: 32px; background: #ffffff; }
          h1, h2 { margin: 0 0 12px; }
          p { margin: 0; }
          .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 20px 0 28px; }
          .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; background: #fff; }
          .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
          .value { font-size: 24px; font-weight: 700; margin-top: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; }
          th, td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 14px; vertical-align: top; }
          th { font-size: 12px; color: #475569; text-transform: uppercase; letter-spacing: 0.04em; }
          .pill { display: inline-block; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; }
          .healthy { background: #dcfce7; color: #166534; }
          .watch { background: #fef3c7; color: #92400e; }
          .at_risk { background: #fee2e2; color: #b91c1c; }
        </style>
      </head>
      <body>
        <h1>MyProPlanner Stakeholder Report</h1>
        <p>Generated on ${escapeHtml(generatedAt)}</p>
        <div class="grid">
          ${summaryCards
            .map(
              ([label, value]) =>
                `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`
            )
            .join('')}
        </div>
        <h2>Project Health</h2>
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Health</th>
              <th>Progress</th>
              <th>Critical</th>
              <th>Slipped</th>
              <th>Overdue</th>
            </tr>
          </thead>
          <tbody>
            ${reportSummaries
              .map(
                (item) => `<tr>
                  <td>${escapeHtml(item.listName)}</td>
                  <td><span class="pill ${item.health}">${escapeHtml(getProjectHealthLabel(item.health))}</span></td>
                  <td>${item.averageProgress}%</td>
                  <td>${item.criticalTasks}</td>
                  <td>${item.slippedTasks}</td>
                  <td>${item.overdueTasks}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
        <h2 style="margin-top: 28px;">Slipped Tasks</h2>
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Project</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            ${
              slippedTaskRows.length > 0
                ? slippedTaskRows
                    .map(
                      (item) =>
                        `<tr><td>${escapeHtml(item.taskName)}</td><td>${escapeHtml(item.listName)}</td><td>${item.varianceDays} day${item.varianceDays === 1 ? '' : 's'}</td></tr>`
                    )
                    .join('')
                : '<tr><td colspan="3">No slipped tasks in the current selection.</td></tr>'
            }
          </tbody>
        </table>
      </body>
    </html>
  `;
}

function printReportHtml(html: string) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';

  let cleanedUp = false;
  let startedPrint = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    iframe.remove();
  };

  const triggerPrint = () => {
    if (startedPrint) return;
    startedPrint = true;

    const reportWindow = iframe.contentWindow;
    if (!reportWindow) {
      cleanup();
      return;
    }

    const finalize = () => window.setTimeout(cleanup, 1000);

    try {
      reportWindow.onafterprint = finalize;
    } catch {
      // Ignore environments that do not allow attaching afterprint handlers.
    }

    reportWindow.focus();
    window.setTimeout(() => {
      try {
        reportWindow.print();
      } catch {
        finalize();
        return;
      }

      window.setTimeout(finalize, 2000);
    }, 120);
  };

  iframe.addEventListener('load', triggerPrint, { once: true });
  document.body.appendChild(iframe);
  iframe.srcdoc = html;
  window.setTimeout(triggerPrint, 600);
}

function computeTaskDurationMs(task: Task) {
  if (!task.start_date || !task.end_date) return 0;
  const start = parseISO(task.start_date);
  const end = parseISO(task.end_date);
  if (!isValid(start) || !isValid(end)) return 0;
  return Math.max(0, end.getTime() - start.getTime());
}

function serializeSvg(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  return `<?xml version="1.0" standalone="no"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function computeCriticalPath(section: TaskSection): CriticalPathDetails {
  const allScheduledTasks = flattenTasks(section.tasks).filter((task) => task.start_date && task.end_date);
  if (allScheduledTasks.length === 0) {
    return {
      criticalTaskIds: new Set(),
      criticalDependencyIds: new Set(),
      finishDriverTaskIds: new Set(),
      slackByTaskId: new Map(),
      sectionFinishDate: null,
    };
  }

  const allTaskMap = new Map(allScheduledTasks.map((task) => [task.id, task]));
  const relevantDependencies = section.dependencies.filter(
    (dependency) => allTaskMap.has(dependency.predecessor_id) && allTaskMap.has(dependency.successor_id)
  );
  const connectedTaskIds = new Set(relevantDependencies.flatMap((dependency) => [dependency.predecessor_id, dependency.successor_id]));
  if (connectedTaskIds.size === 0) {
    return {
      criticalTaskIds: new Set(),
      criticalDependencyIds: new Set(),
      finishDriverTaskIds: new Set(),
      slackByTaskId: new Map(),
      sectionFinishDate: null,
    };
  }

  const flatTasks = allScheduledTasks.filter((task) => connectedTaskIds.has(task.id));
  const taskMap = new Map(flatTasks.map((task) => [task.id, task]));
  const filteredDependencies = relevantDependencies.filter(
    (dependency) => connectedTaskIds.has(dependency.predecessor_id) && connectedTaskIds.has(dependency.successor_id)
  );
  const outgoingDeps = new Map<string, TaskDependency[]>();
  const incomingCounts = new Map(flatTasks.map((task) => [task.id, 0]));

  for (const dependency of filteredDependencies) {
    outgoingDeps.set(dependency.predecessor_id, [...(outgoingDeps.get(dependency.predecessor_id) ?? []), dependency]);
    incomingCounts.set(dependency.successor_id, (incomingCounts.get(dependency.successor_id) ?? 0) + 1);
  }

  const order: string[] = [];
  const queue = flatTasks.filter((task) => (incomingCounts.get(task.id) ?? 0) === 0).map((task) => task.id);
  const remainingIncoming = new Map(incomingCounts);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    order.push(currentId);
    for (const dependency of outgoingDeps.get(currentId) ?? []) {
      const nextCount = (remainingIncoming.get(dependency.successor_id) ?? 1) - 1;
      remainingIncoming.set(dependency.successor_id, nextCount);
      if (nextCount === 0) {
        queue.push(dependency.successor_id);
      }
    }
  }

  for (const task of flatTasks) {
    if (!order.includes(task.id)) {
      order.push(task.id);
    }
  }

  const projectFinishDate = flatTasks
    .map((task) => parseISO(task.end_date!))
    .filter((date) => isValid(date))
    .reduce((latest, current) => (current.getTime() > latest.getTime() ? current : latest));
  const projectFinish = projectFinishDate.getTime();

  const latestStartByTask = new Map<string, number>();
  const latestFinishByTask = new Map<string, number>();
  const actualStartByTask = new Map<string, number>();
  const actualFinishByTask = new Map<string, number>();

  for (const task of flatTasks) {
    const start = parseISO(task.start_date!);
    const end = parseISO(task.end_date!);
    if (!isValid(start) || !isValid(end)) continue;
    const durationMs = computeTaskDurationMs(task);
    actualStartByTask.set(task.id, start.getTime());
    actualFinishByTask.set(task.id, end.getTime());
    latestFinishByTask.set(task.id, projectFinish);
    latestStartByTask.set(task.id, projectFinish - durationMs);
  }

  for (const taskId of [...order].reverse()) {
    const task = taskMap.get(taskId);
    if (!task) continue;
    const durationMs = computeTaskDurationMs(task);
    let latestStart = latestStartByTask.get(taskId) ?? projectFinish - durationMs;
    let latestFinish = latestFinishByTask.get(taskId) ?? projectFinish;

    for (const dependency of outgoingDeps.get(taskId) ?? []) {
      const successorLatestStart = latestStartByTask.get(dependency.successor_id);
      if (successorLatestStart === undefined) continue;

      latestFinish = Math.min(latestFinish, successorLatestStart);
      latestStart = latestFinish - durationMs;
    }

    latestStartByTask.set(taskId, latestStart);
    latestFinishByTask.set(taskId, latestFinish);
  }

  const criticalTaskIds = new Set<string>();
  const finishDriverTaskIds = new Set<string>();
  const slackByTaskId = new Map<string, number>();

  for (const task of flatTasks) {
    const actualStart = actualStartByTask.get(task.id);
    const actualFinish = actualFinishByTask.get(task.id);
    const latestStart = latestStartByTask.get(task.id);
    const latestFinish = latestFinishByTask.get(task.id);
    if (
      actualStart === undefined ||
      actualFinish === undefined ||
      latestStart === undefined ||
      latestFinish === undefined
    ) {
      continue;
    }

    const startSlack = Math.round((latestStart - actualStart) / DAY_MS);
    const finishSlack = Math.round((latestFinish - actualFinish) / DAY_MS);
    const slackDays = Math.min(startSlack, finishSlack);
    slackByTaskId.set(task.id, slackDays);

    if (slackDays <= 0) {
      criticalTaskIds.add(task.id);
      if (actualFinish === projectFinish) {
        finishDriverTaskIds.add(task.id);
      }
    }
  }

  const criticalDependencyIds = new Set<string>();
  for (const dependency of filteredDependencies) {
    const predecessor = taskMap.get(dependency.predecessor_id);
    const successor = taskMap.get(dependency.successor_id);
    if (!predecessor || !successor) continue;
    if (!criticalTaskIds.has(predecessor.id) || !criticalTaskIds.has(successor.id)) continue;

    const predecessorFinish = actualFinishByTask.get(predecessor.id);
    const successorStart = actualStartByTask.get(successor.id);
    if (
      predecessorFinish === undefined ||
      successorStart === undefined
    ) {
      continue;
    }

    if (successorStart === predecessorFinish) {
      criticalDependencyIds.add(dependency.id);
    }
  }

  return {
    criticalTaskIds,
    criticalDependencyIds,
    finishDriverTaskIds,
    slackByTaskId,
    sectionFinishDate: format(projectFinishDate, 'yyyy-MM-dd'),
  };
}

const GanttView: React.FC<GanttViewProps> = ({
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
  uiScale,
  onUiScaleChange,
}) => {
  const [sections, setSections] = React.useState<TaskSection[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState<ZoomLevel>('days');
  const [dragging, setDragging] = React.useState<{
    taskId: string;
    startX: number;
    origStart: string;
    origEnd: string;
    mode: 'move' | 'start' | 'end';
  } | null>(null);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState>(null);
  const [dependencyContextMenu, setDependencyContextMenu] = React.useState<DependencyContextMenuState>(null);
  const [editModal, setEditModal] = React.useState<EditModalState>(null);
  const [reminderModal, setReminderModal] = React.useState<ReminderModalState>(null);
  const [editingProjectTarget, setEditingProjectTarget] = React.useState<SelectedListTarget | null>(null);
  const [viewSettingsOpen, setViewSettingsOpen] = React.useState(false);
  const [hoveredRowId, setHoveredRowId] = React.useState<string | null>(null);
  const [hoveredProjectId, setHoveredProjectId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>([]);
  const [hideCompleted, setHideCompleted] = React.useState(false);
  const [focusMode, setFocusMode] = React.useState<TaskFocusMode>('all');
  const [activeSavedViewId, setActiveSavedViewId] = React.useState('');
  const [showDependencies, setShowDependencies] = React.useState(true);
  const [autoShiftDependencies, setAutoShiftDependencies] = React.useState(true);
  const [criticalOnly, setCriticalOnly] = React.useState(false);
  const [loadedViewStateKey, setLoadedViewStateKey] = React.useState('');
  const [spaceOptions, setSpaceOptions] = React.useState<SpaceOption[]>([]);
  const [dependencyEditor, setDependencyEditor] = React.useState<DependencyEditorState | null>(null);
  const [taskReorderDrag, setTaskReorderDrag] = React.useState<{ taskId: string; parentId: string | null; sectionId: string } | null>(null);
  const [taskReorderTargetId, setTaskReorderTargetId] = React.useState<string | null>(null);
  const [reportsOpen, setReportsOpen] = React.useState(false);
  const [collapsedSectionIds, setCollapsedSectionIds] = React.useState<Set<string>>(new Set());
  const [collapsedTaskIds, setCollapsedTaskIds] = React.useState<Set<string>>(new Set());
  const [labelWidth, setLabelWidth] = React.useState(() => {
    try {
      const raw = localStorage.getItem(GANTT_LABEL_WIDTH_KEY);
      return raw ? Math.max(180, Number(raw)) : 320;
    } catch {
      return 320;
    }
  });
  const [plannerPanelHeight, setPlannerPanelHeight] = React.useState<number | null>(null);
  const [ganttFontSize, setGanttFontSize] = React.useState(DEFAULT_GANTT_FONT_SIZE);
  const [zoomScale, setZoomScale] = React.useState(DEFAULT_GANTT_ZOOM_SCALE);
  const [hoverToolbarMenu, setHoverToolbarMenu] = React.useState<HoverToolbarMenuId>(null);

  const svgRef = React.useRef<SVGSVGElement>(null);
  const plannerPanelRef = React.useRef<HTMLDivElement>(null);
  const timelineHeaderInnerRef = React.useRef<HTMLDivElement>(null);
  const labelScrollRef = React.useRef<HTMLDivElement>(null);
  const timelineScrollRef = React.useRef<HTMLDivElement>(null);
  const hoverToolbarMenuTimeoutRef = React.useRef<number | null>(null);
  const autoScrolledViewKeyRef = React.useRef('');
  const timelinePanRef = React.useRef<{ startX: number; startLeft: number } | null>(null);
  const scrollSyncRef = React.useRef<'labels' | 'timeline' | null>(null);
  const dependencyEditorRef = React.useRef<HTMLDivElement>(null);
  const [isTimelinePanning, setIsTimelinePanning] = React.useState(false);
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
      const match = findTaskContext(section.tasks, editModal.taskId);
      if (match) return match.task;
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
    () => `${LAST_GANTT_VIEW_PREFIX}${selectedLists.map((item) => item.listId).sort().join('|') || 'none'}`,
    [selectedLists]
  );
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
  const rowHeight = React.useMemo(() => Math.max(MIN_ROW_HEIGHT, ganttFontSize + 22), [ganttFontSize]);
  const barHeight = React.useMemo(() => Math.max(20, Math.min(28, ganttFontSize + 8)), [ganttFontSize]);
  const secondaryFontSize = React.useMemo(() => Math.max(9, ganttFontSize - 2), [ganttFontSize]);
  const tinyFontSize = React.useMemo(() => Math.max(9, ganttFontSize - 3), [ganttFontSize]);
  const headerPrimaryFontSize = React.useMemo(() => Math.max(11, Math.min(16, ganttFontSize)), [ganttFontSize]);
  const headerSecondaryFontSize = React.useMemo(() => Math.max(10, Math.min(14, ganttFontSize - 1)), [ganttFontSize]);

  const clearHoverToolbarMenuClose = React.useCallback(() => {
    if (hoverToolbarMenuTimeoutRef.current !== null) {
      window.clearTimeout(hoverToolbarMenuTimeoutRef.current);
      hoverToolbarMenuTimeoutRef.current = null;
    }
  }, []);

  const openHoverToolbarMenu = React.useCallback(
    (menu: HoverToolbarMenuId) => {
      clearHoverToolbarMenuClose();
      setHoverToolbarMenu(menu);
    },
    [clearHoverToolbarMenuClose]
  );

  const scheduleHoverToolbarMenuClose = React.useCallback(
    (menu: Exclude<HoverToolbarMenuId, null>) => {
      clearHoverToolbarMenuClose();
      hoverToolbarMenuTimeoutRef.current = window.setTimeout(() => {
        setHoverToolbarMenu((current) => (current === menu ? null : current));
        hoverToolbarMenuTimeoutRef.current = null;
      }, 120);
    },
    [clearHoverToolbarMenuClose]
  );

  React.useEffect(() => {
    localStorage.setItem(GANTT_LABEL_WIDTH_KEY, String(labelWidth));
  }, [labelWidth]);

  React.useEffect(() => {
    try {
      if (plannerPanelHeight === null) {
        localStorage.removeItem(GANTT_PLANNER_HEIGHT_KEY);
        return;
      }
      localStorage.setItem(GANTT_PLANNER_HEIGHT_KEY, String(plannerPanelHeight));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [plannerPanelHeight]);

  React.useEffect(() => () => clearHoverToolbarMenuClose(), [clearHoverToolbarMenuClose]);

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
          zoom?: ZoomLevel;
          showDependencies?: boolean;
          autoShiftDependencies?: boolean;
          criticalOnly?: boolean;
          labelWidth?: number;
          ganttFontSize?: number;
          zoomScale?: number;
        };
        setSearchQuery(parsed.searchQuery ?? '');
        setSelectedStatuses(parsed.selectedStatuses ?? []);
        setHideCompleted(Boolean(parsed.hideCompleted));
        setFocusMode(parsed.focusMode ?? 'all');
        setActiveSavedViewId(parsed.activeSavedViewId ?? '');
        setZoom(parsed.zoom ?? 'days');
        setShowDependencies(parsed.showDependencies ?? true);
        setAutoShiftDependencies(parsed.autoShiftDependencies ?? true);
        setCriticalOnly(Boolean(parsed.criticalOnly));
        setLabelWidth(typeof parsed.labelWidth === 'number' ? Math.max(180, parsed.labelWidth) : 320);
        setGanttFontSize(typeof parsed.ganttFontSize === 'number' ? Math.max(9, Math.min(20, parsed.ganttFontSize)) : DEFAULT_GANTT_FONT_SIZE);
        setZoomScale(typeof parsed.zoomScale === 'number' ? Math.max(40, Math.min(300, parsed.zoomScale)) : DEFAULT_GANTT_ZOOM_SCALE);
      } else {
        setSearchQuery('');
        setSelectedStatuses([]);
        setHideCompleted(false);
        setFocusMode('all');
        setActiveSavedViewId('');
        setZoom('days');
        setShowDependencies(true);
        setAutoShiftDependencies(true);
        setCriticalOnly(false);
        setGanttFontSize(DEFAULT_GANTT_FONT_SIZE);
        setZoomScale(DEFAULT_GANTT_ZOOM_SCALE);
      }
    } catch {
      setSearchQuery('');
      setSelectedStatuses([]);
      setHideCompleted(false);
      setFocusMode('all');
      setActiveSavedViewId('');
      setZoom('days');
      setShowDependencies(true);
      setAutoShiftDependencies(true);
      setCriticalOnly(false);
      setGanttFontSize(DEFAULT_GANTT_FONT_SIZE);
      setZoomScale(DEFAULT_GANTT_ZOOM_SCALE);
    }
    setLoadedViewStateKey(viewStateKey);
  }, [viewStateKey]);

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
        zoom,
        showDependencies,
        autoShiftDependencies,
        criticalOnly,
        labelWidth,
        ganttFontSize,
        zoomScale,
      })
    );
  }, [
    activeSavedViewId,
    autoShiftDependencies,
    focusMode,
    ganttFontSize,
    hideCompleted,
    labelWidth,
    loadedViewStateKey,
    searchQuery,
    selectedStatuses,
    showDependencies,
    criticalOnly,
    viewStateKey,
    zoomScale,
    zoom,
  ]);

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
      if (detail?.source === 'gantt-view') return;
      void loadTasks();
    };

    window.addEventListener(TASKS_MUTATED_EVENT, handleTasksMutated);
    return () => window.removeEventListener(TASKS_MUTATED_EVENT, handleTasksMutated);
  }, [loadTasks]);

  const criticalPathBySection = React.useMemo(() => {
    const map = new Map<string, CriticalPathDetails>();
    for (const section of sections) {
      map.set(section.target.listId, computeCriticalPath(section));
    }
    return map;
  }, [sections]);

  const filteredSections = React.useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const hasActiveFilters =
      normalizedSearch.length > 0 || selectedStatuses.length > 0 || hideCompleted || focusMode !== 'all' || criticalOnly;

    return sections
      .map((section) => {
        const settings = section.target.listSettings;
        const criticalPath = criticalPathBySection.get(section.target.listId);
        const filteredTasks = hasActiveFilters
          ? filterTaskTree(section.tasks, (task) => {
              if (criticalOnly && !criticalPath?.criticalTaskIds.has(task.id)) {
                return false;
              }

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
  }, [criticalOnly, criticalPathBySection, focusMode, hideCompleted, searchQuery, sections, selectedStatuses]);

  const visibleTaskCount = React.useMemo(
    () => filteredSections.reduce((sum, section) => sum + countTasks(section.tasks), 0),
    [filteredSections]
  );
  const totalTaskCount = React.useMemo(
    () => sections.reduce((sum, section) => sum + countTasks(section.tasks), 0),
    [sections]
  );

  const rows = React.useMemo<GanttRow[]>(
    () =>
      filteredSections.flatMap((section) => [
        { kind: 'section', section } satisfies SectionRowItem,
        ...(collapsedSectionIds.has(section.target.listId)
          ? []
          : flattenVisibleTaskRows(section, section.tasks, collapsedTaskIds)),
      ]),
    [collapsedSectionIds, collapsedTaskIds, filteredSections]
  );

  const taskRows = React.useMemo(
    () => rows.filter((row): row is TaskRowItem => row.kind === 'task'),
    [rows]
  );

  const { timelineStart, timelineEnd, totalDays } = React.useMemo(() => {
    const allDates: Date[] = [];
    for (const section of filteredSections) {
      if (section.target.startDate) allDates.push(parseISO(section.target.startDate));
      if (section.target.endDate) allDates.push(parseISO(section.target.endDate));
    }
    for (const row of taskRows) {
      if (row.task.start_date) allDates.push(parseISO(row.task.start_date));
      if (row.task.end_date) allDates.push(parseISO(row.task.end_date));
    }

    if (allDates.length === 0) {
      const now = new Date();
      return {
        timelineStart: startOfMonth(now),
        timelineEnd: endOfMonth(addMonths(now, 2)),
        totalDays: 90,
      };
    }

    const minDate = allDates.reduce((a, b) => (a < b ? a : b));
    const maxDate = allDates.reduce((a, b) => (a > b ? a : b));
    const start = startOfMonth(addDays(minDate, -7));
    const end = endOfMonth(addDays(maxDate, 14));
    const days = differenceInDays(end, start) + 1;

    return { timelineStart: start, timelineEnd: end, totalDays: days };
  }, [taskRows]);

  const dayWidth = getDayWidth(zoom, zoomScale);
  const totalWidth = totalDays * dayWidth;

  const scrollToToday = React.useCallback(() => {
    if (!timelineScrollRef.current) return;
    const todayOffset = Math.max(0, differenceInDays(new Date(), timelineStart) * dayWidth - 220);
    timelineScrollRef.current.scrollTo({ left: todayOffset, behavior: 'smooth' });
  }, [dayWidth, timelineStart]);

  const scrollToDate = React.useCallback(
    (dateString: string, behavior: ScrollBehavior = 'smooth') => {
      if (!timelineScrollRef.current) return;
      const targetDate = parseISO(dateString);
      if (!isValid(targetDate)) return;
      const offset = Math.max(0, differenceInDays(targetDate, timelineStart) * dayWidth - 140);
      timelineScrollRef.current.scrollTo({ left: offset, behavior });
    },
    [dayWidth, timelineStart]
  );

  const scrollToProjectStart = React.useCallback(() => {
    if (!singleSelectedList) return;
    const section = sections.find((item) => item.target.listId === singleSelectedList.listId);
    const derivedTaskStart = section
      ? flattenTasks(section.tasks)
          .map((task) => task.start_date)
          .filter((value): value is string => Boolean(value))
          .sort()[0] ?? null
      : null;
    const projectStart = singleSelectedList.startDate || derivedTaskStart;
    if (!projectStart) return;
    scrollToDate(projectStart);
  }, [scrollToDate, sections, singleSelectedList]);

  const applySavedView = React.useCallback((view: SavedView | null) => {
    if (!view) {
      setSearchQuery('');
      setSelectedStatuses([]);
      setHideCompleted(false);
      setFocusMode('all');
      setAutoShiftDependencies(true);
      setCriticalOnly(false);
      setGanttFontSize(DEFAULT_GANTT_FONT_SIZE);
      setZoomScale(DEFAULT_GANTT_ZOOM_SCALE);
      return;
    }

    setSearchQuery(view.searchQuery || '');
    setSelectedStatuses(view.statusFilters || []);
    setHideCompleted(Boolean(view.hideCompleted));
    setFocusMode(view.focusMode || 'all');
    if (view.ganttZoom) {
      setZoom(view.ganttZoom);
    }
    if (typeof view.ganttLabelWidth === 'number') {
      setLabelWidth(Math.max(180, view.ganttLabelWidth));
    }
    if (typeof view.ganttShowDependencies === 'boolean') {
      setShowDependencies(view.ganttShowDependencies);
    }
    if (typeof view.ganttAutoShiftDependencies === 'boolean') {
      setAutoShiftDependencies(view.ganttAutoShiftDependencies);
    }
    if (typeof view.ganttCriticalOnly === 'boolean') {
      setCriticalOnly(view.ganttCriticalOnly);
    }
    if (typeof view.ganttFontSize === 'number') {
      setGanttFontSize(Math.max(9, Math.min(20, view.ganttFontSize)));
    }
    if (typeof view.ganttZoomScale === 'number') {
      setZoomScale(Math.max(40, Math.min(300, view.ganttZoomScale)));
    }
  }, []);

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
      ganttZoom: zoom,
      ganttLabelWidth: labelWidth,
      ganttShowDependencies: showDependencies,
      ganttAutoShiftDependencies: autoShiftDependencies,
      ganttCriticalOnly: criticalOnly,
      ganttFontSize,
      ganttZoomScale: zoomScale,
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

  const headerColumns = React.useMemo(() => {
    const cols: { label: string; x: number; width: number }[] = [];

    if (zoom === 'days') {
      for (let i = 0; i < totalDays; i += 1) {
        const date = addDays(timelineStart, i);
        cols.push({ label: format(date, 'd'), x: i * dayWidth, width: dayWidth });
      }
    } else if (zoom === 'weeks') {
      let current = startOfWeek(timelineStart, { weekStartsOn: 1 });
      while (current <= timelineEnd) {
        const weekEnd = endOfWeek(current, { weekStartsOn: 1 });
        const xStart = Math.max(0, differenceInDays(current, timelineStart)) * dayWidth;
        const xEnd = Math.min(totalDays, differenceInDays(weekEnd, timelineStart) + 1) * dayWidth;
        if (xEnd > xStart) {
          cols.push({ label: format(current, 'MMM d'), x: xStart, width: xEnd - xStart });
        }
        current = addWeeks(current, 1);
      }
    } else {
      let current = startOfMonth(timelineStart);
      while (current <= timelineEnd) {
        const monthEnd = endOfMonth(current);
        const xStart = Math.max(0, differenceInDays(current, timelineStart)) * dayWidth;
        const xEnd = Math.min(totalDays, differenceInDays(monthEnd, timelineStart) + 1) * dayWidth;
        if (xEnd > xStart) {
          cols.push({ label: format(current, 'MMM yyyy'), x: xStart, width: xEnd - xStart });
        }
        current = addMonths(current, 1);
      }
    }

    return cols;
  }, [dayWidth, timelineEnd, timelineStart, totalDays, zoom]);

  const taskRowIndexMap = React.useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, index) => {
      if (row.kind === 'task') {
        map.set(row.task.id, index);
      }
    });
    return map;
  }, [rows]);

  const getBarMetrics = (task: Task) => {
    if (!task.start_date || !task.end_date) return null;
    const start = parseISO(task.start_date);
    const end = parseISO(task.end_date);
    if (!isValid(start) || !isValid(end)) return null;
    const x = differenceInDays(start, timelineStart) * dayWidth;
    const width = Math.max((differenceInDays(end, start) + 1) * dayWidth, dayWidth);
    return { x, width };
  };

  const getDateRangeMetrics = React.useCallback(
    (startDate: string | null, endDate: string | null) => {
      if (!startDate || !endDate) return null;
      const start = parseISO(startDate);
      const end = parseISO(endDate);
      if (!isValid(start) || !isValid(end)) return null;
      const x = differenceInDays(start, timelineStart) * dayWidth;
      const width = Math.max((differenceInDays(end, start) + 1) * dayWidth, dayWidth);
      return { x, width };
    },
    [dayWidth, timelineStart]
  );

  const sectionTimelineMap = React.useMemo(() => {
    const map = new Map<string, { start_date: string; end_date: string }>();

    for (const section of filteredSections) {
      if (section.target.startDate && section.target.endDate) {
        map.set(section.target.listId, {
          start_date: section.target.startDate,
          end_date: section.target.endDate,
        });
        continue;
      }

      const flatTasks = flattenTasks(section.tasks);
      const datedProjectTasks = flatTasks.filter(
        (task) => task.task_type === 'project' && task.start_date && task.end_date
      );
      const datedTasks = (datedProjectTasks.length > 0 ? datedProjectTasks : flatTasks).filter(
        (task) => task.start_date && task.end_date
      );
      if (datedTasks.length === 0) continue;

      const startDates = datedTasks
        .map((task) => parseISO(task.start_date!))
        .filter((date) => isValid(date));
      const endDates = datedTasks
        .map((task) => parseISO(task.end_date!))
        .filter((date) => isValid(date));

      if (startDates.length === 0 || endDates.length === 0) continue;

      const minStart = startDates.reduce((left, right) => (left < right ? left : right));
      const maxEnd = endDates.reduce((left, right) => (left > right ? left : right));

      map.set(section.target.listId, {
        start_date: format(minStart, 'yyyy-MM-dd'),
        end_date: format(maxEnd, 'yyyy-MM-dd'),
      });
    }

    return map;
  }, [filteredSections]);

  const dependencyInsights = React.useMemo(() => {
    const conflictedTaskIds = new Set<string>();
    const conflictedDependencyIds = new Set<string>();
    const conflictMessages = new Map<string, string[]>();
    const dependencyMessages = new Map<string, string[]>();

    for (const section of filteredSections) {
      const flatTasks = flattenTasks(section.tasks);
      const taskMap = new Map(flatTasks.map((task) => [task.id, task]));

      for (const dependency of section.dependencies) {
        const predecessor = taskMap.get(dependency.predecessor_id);
        const successor = taskMap.get(dependency.successor_id);
        if (!predecessor?.start_date || !predecessor?.end_date || !successor?.start_date || !successor?.end_date) {
          continue;
        }

        const predecessorStart = predecessor.start_date;
        const predecessorEnd = predecessor.end_date;
        const successorStart = successor.start_date;
        const successorEnd = successor.end_date;

        let message: string | null = null;
        if (successorStart < predecessorEnd) {
          message = `${successor.name} starts before ${predecessor.name} finishes.`;
        }

        if (!message) continue;

        conflictedDependencyIds.add(dependency.id);
        conflictedTaskIds.add(predecessor.id);
        conflictedTaskIds.add(successor.id);
        conflictMessages.set(successor.id, [...(conflictMessages.get(successor.id) ?? []), message]);
        dependencyMessages.set(dependency.id, [...(dependencyMessages.get(dependency.id) ?? []), message]);
      }
    }

    return {
      conflictedTaskIds,
      conflictedDependencyIds,
      conflictMessages,
      dependencyMessages,
      totalConflicts: conflictedDependencyIds.size,
    };
  }, [filteredSections]);

  const reportSummaries = React.useMemo<ProjectHealthSummary[]>(() => {
    return sections.map((section) => {
      const flatTasks = flattenTasks(section.tasks);
      const completedTasks = flatTasks.filter((task) =>
        isCompletedStatus(task.status, section.target.listSettings)
      ).length;
      const overdueTasks = flatTasks.filter(
        (task) =>
          Boolean(task.end_date) &&
          (task.end_date as string) < format(new Date(), 'yyyy-MM-dd') &&
          !isCompletedStatus(task.status, section.target.listSettings)
      ).length;
      const slippedTasks = flatTasks.filter(
        (task) =>
          Boolean(task.end_date) &&
          Boolean(task.baseline_end_date) &&
          (task.end_date as string) > (task.baseline_end_date as string)
      );
      const progressValues = flatTasks
        .map((task) => {
          if (isCompletedStatus(task.status, section.target.listSettings)) return 100;
          const progress = getTaskProgress(task);
          return progress ?? 0;
        })
        .filter((value) => Number.isFinite(value));
      const averageProgress =
        progressValues.length > 0
          ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length)
          : 0;
      const variances = slippedTasks.map((task) =>
        Math.max(0, differenceInDays(parseISO(task.end_date!), parseISO(task.baseline_end_date!)))
      );
      const critical = criticalPathBySection.get(section.target.listId);
      const criticalOverdue = flatTasks.some(
        (task) =>
          critical?.criticalTaskIds.has(task.id) &&
          Boolean(task.end_date) &&
          (task.end_date as string) < format(new Date(), 'yyyy-MM-dd') &&
          !isCompletedStatus(task.status, section.target.listSettings)
      );

      let health: ProjectHealthStatus = 'healthy';
      if (criticalOverdue || slippedTasks.length > 0) health = 'at_risk';
      else if (overdueTasks > 0 || (critical?.criticalTaskIds.size ?? 0) > 0) health = 'watch';

      return {
        listId: section.target.listId,
        listName: section.target.listName,
        health,
        totalTasks: flatTasks.length,
        completedTasks,
        overdueTasks,
        slippedTasks: slippedTasks.length,
        criticalTasks: critical?.criticalTaskIds.size ?? 0,
        finishDrivers: critical?.finishDriverTaskIds.size ?? 0,
        averageProgress,
        totalVarianceDays: variances.reduce((sum, value) => sum + value, 0),
        maxVarianceDays: variances.length > 0 ? Math.max(...variances) : 0,
      };
    });
  }, [criticalPathBySection, sections]);

  const slippedTasks = React.useMemo(
    () =>
      sections.flatMap((section) =>
        flattenTasks(section.tasks)
          .filter(
            (task) =>
              Boolean(task.end_date) &&
              Boolean(task.baseline_end_date) &&
              (task.end_date as string) > (task.baseline_end_date as string)
          )
          .map((task) => ({
            task,
            listName: section.target.listName,
            varianceDays: differenceInDays(parseISO(task.end_date!), parseISO(task.baseline_end_date!)),
          }))
      ),
    [sections]
  );

  const overallReportSummary = React.useMemo(() => {
    const totalTasks = reportSummaries.reduce((sum, item) => sum + item.totalTasks, 0);
    const completedTasks = reportSummaries.reduce((sum, item) => sum + item.completedTasks, 0);
    const overdueTasks = reportSummaries.reduce((sum, item) => sum + item.overdueTasks, 0);
    const slippedCount = reportSummaries.reduce((sum, item) => sum + item.slippedTasks, 0);
    const criticalTasks = reportSummaries.reduce((sum, item) => sum + item.criticalTasks, 0);
    const finishDrivers = reportSummaries.reduce((sum, item) => sum + item.finishDrivers, 0);
    const averageProgress =
      reportSummaries.length > 0
        ? Math.round(reportSummaries.reduce((sum, item) => sum + item.averageProgress, 0) / reportSummaries.length)
        : 0;

    return {
      totalTasks,
      completedTasks,
      overdueTasks,
      slippedCount,
      criticalTasks,
      finishDrivers,
      averageProgress,
    };
  }, [reportSummaries]);

  const getSvgCoordinates = React.useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current || !timelineScrollRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: clientX - rect.left + timelineScrollRef.current.scrollLeft,
      y: clientY - rect.top + timelineScrollRef.current.scrollTop,
    };
  }, []);

  const downloadBlob = React.useCallback((filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const handleExportSvg = React.useCallback(() => {
    if (!svgRef.current) return;
    const svgMarkup = serializeSvg(svgRef.current);
    downloadBlob(`mygantt-${format(new Date(), 'yyyyMMdd-HHmm')}.svg`, new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }));
  }, [downloadBlob]);

  const handleExportPng = React.useCallback(() => {
    if (!svgRef.current) return;
    const svgMarkup = serializeSvg(svgRef.current);
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = svgRef.current?.width.baseVal.value ?? totalWidth;
      canvas.height = svgRef.current?.height.baseVal.value ?? 1200;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(`mygantt-${format(new Date(), 'yyyyMMdd-HHmm')}.png`, blob);
        }
        URL.revokeObjectURL(url);
      });
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
  }, [downloadBlob, totalWidth]);

  const buildSlippedTaskReportRows = React.useCallback(
    () =>
      [...slippedTasks]
        .sort((left, right) => right.varianceDays - left.varianceDays)
        .map((item) => ({
          taskName: item.task.name,
          listName: item.listName,
          varianceDays: item.varianceDays,
          currentEndDate: item.task.end_date ?? '',
          baselineEndDate: item.task.baseline_end_date ?? '',
          status: item.task.status,
        })),
    [slippedTasks]
  );

  const handleExportStakeholderReport = React.useCallback(() => {
    const generatedAt = format(new Date(), 'PPP p');
    const summaryCards: Array<[string, string]> = [
      ['Total tasks', String(overallReportSummary.totalTasks)],
      ['Completed', String(overallReportSummary.completedTasks)],
      ['Average progress', `${overallReportSummary.averageProgress}%`],
      ['Critical tasks', String(overallReportSummary.criticalTasks)],
      ['Finish drivers', String(overallReportSummary.finishDrivers)],
      ['Slipped tasks', String(overallReportSummary.slippedCount)],
      ['Overdue tasks', String(overallReportSummary.overdueTasks)],
    ];
    const html = buildStakeholderReportHtml({
      generatedAt,
      summaryCards,
      reportSummaries,
      slippedTaskRows: buildSlippedTaskReportRows().slice(0, 20),
    });

    printReportHtml(html);
  }, [buildSlippedTaskReportRows, overallReportSummary, reportSummaries]);

  const handleExportStakeholderWorkbook = React.useCallback(() => {
    const generatedAt = format(new Date(), 'PPP p');
    const slippedTaskRows = buildSlippedTaskReportRows();
    const workbook = createWorkbookBlob([
      {
        name: 'Overview',
        rows: [
          ['MyProPlanner Stakeholder Report'],
          ['Generated on', generatedAt],
          [],
          ['Metric', 'Value'],
          ['Total tasks', overallReportSummary.totalTasks],
          ['Completed', overallReportSummary.completedTasks],
          ['Average progress', `${overallReportSummary.averageProgress}%`],
          ['Critical tasks', overallReportSummary.criticalTasks],
          ['Finish drivers', overallReportSummary.finishDrivers],
          ['Slipped tasks', overallReportSummary.slippedCount],
          ['Overdue tasks', overallReportSummary.overdueTasks],
        ],
      },
      {
        name: 'Project Health',
        rows: [
          [
            'Project',
            'Health',
            'Progress (%)',
            'Total Tasks',
            'Completed',
            'Critical',
            'Finish Drivers',
            'Slipped',
            'Overdue',
            'Total Variance (days)',
            'Max Variance (days)',
          ],
          ...reportSummaries.map((item) => [
            item.listName,
            getProjectHealthLabel(item.health),
            item.averageProgress,
            item.totalTasks,
            item.completedTasks,
            item.criticalTasks,
            item.finishDrivers,
            item.slippedTasks,
            item.overdueTasks,
            item.totalVarianceDays,
            item.maxVarianceDays,
          ]),
        ],
      },
      {
        name: 'Slipped Tasks',
        rows: [
          ['Task', 'Project', 'Variance (days)', 'Current End', 'Baseline End', 'Status'],
          ...(slippedTaskRows.length > 0
            ? slippedTaskRows.map((item) => [
                item.taskName,
                item.listName,
                item.varianceDays,
                item.currentEndDate,
                item.baselineEndDate,
                item.status,
              ])
            : [['No slipped tasks in the current selection.']]),
        ],
      },
    ]);

    downloadBlob(`myproplanner-stakeholder-report-${format(new Date(), 'yyyyMMdd-HHmm')}.xlsx`, workbook);
  }, [buildSlippedTaskReportRows, downloadBlob, overallReportSummary, reportSummaries]);

  const autoShiftDependentTasks = React.useCallback(
    async (taskId: string, nextStartDate: string, nextEndDate: string) => {
      const owningSection = sections.find((section) => flattenTasks(section.tasks).some((task) => task.id === taskId));
      if (!owningSection) return;

      const flatTasks = flattenTasks(owningSection.tasks);
      const schedule = new Map(
        flatTasks.map((task) => [
          task.id,
          {
            start_date: task.id === taskId ? nextStartDate : task.start_date,
            end_date: task.id === taskId ? nextEndDate : task.end_date,
          },
        ])
      );
      const updates = new Map<string, { start_date: string; end_date: string }>();
      const queue = [taskId];

      while (queue.length > 0) {
        const predecessorId = queue.shift()!;
        const predecessorSchedule = schedule.get(predecessorId);
        if (!predecessorSchedule?.start_date || !predecessorSchedule?.end_date) continue;

        const predecessorStart = parseISO(predecessorSchedule.start_date);
        const predecessorEnd = parseISO(predecessorSchedule.end_date);
        if (!isValid(predecessorStart) || !isValid(predecessorEnd)) continue;

        for (const dependency of owningSection.dependencies.filter((item) => item.predecessor_id === predecessorId)) {
          const successor = flatTasks.find((task) => task.id === dependency.successor_id);
          const successorSchedule = schedule.get(dependency.successor_id);
          if (!successor || !successorSchedule?.start_date || !successorSchedule?.end_date) continue;

          const successorStart = parseISO(successorSchedule.start_date);
          const successorEnd = parseISO(successorSchedule.end_date);
          if (!isValid(successorStart) || !isValid(successorEnd)) continue;

          let shiftDays = 0;
          if (successorStart < predecessorEnd) {
            shiftDays = differenceInDays(predecessorEnd, successorStart);
          }

          if (shiftDays <= 0) continue;

          const shiftedStart = addDays(successorStart, shiftDays);
          const shiftedEnd = addDays(successorEnd, shiftDays);
          const nextSchedule = {
            start_date: format(shiftedStart, 'yyyy-MM-dd'),
            end_date: format(shiftedEnd, 'yyyy-MM-dd'),
          };

          schedule.set(successor.id, nextSchedule);
          updates.set(successor.id, nextSchedule);
          queue.push(successor.id);
        }
      }

      if (updates.size === 0) return;
      if (!autoShiftDependencies) {
        const shouldShift = window.confirm(
          `Shift ${updates.size} dependent task${updates.size === 1 ? '' : 's'} to respect dependencies?`
        );
        if (!shouldShift) return;
      }

      const nextUpdates = Array.from(updates.entries()).map(([id, dates]) => ({ id, ...dates }));
      setSections((prev) =>
        prev.map((section) => {
          if (section.target.listId !== owningSection.target.listId) return section;
          return {
            ...section,
            tasks: nextUpdates.reduce(
              (tasks, update) => updateTaskInTree(tasks, update.id, update),
              section.tasks
            ),
          };
        })
      );

      try {
        await Promise.all(
          nextUpdates.map((update) =>
            updateTask(update.id, {
              start_date: update.start_date,
              end_date: update.end_date,
            })
          )
        );
      } catch (err) {
        console.error('Failed to auto-shift dependent tasks:', err);
        await loadTasks();
      }
    },
    [autoShiftDependencies, loadTasks, sections]
  );

  const handleSetBaseline = React.useCallback(async () => {
    if (!singleSelectedList) return;
    const targetSection = sections.find((section) => section.target.listId === singleSelectedList.listId);
    if (!targetSection) return;

    const shouldSet = window.confirm('Set the current project and task schedule as the baseline?');
    if (!shouldSet) return;

    const currentProjectRange = sectionTimelineMap.get(singleSelectedList.listId) ?? {
      start_date: targetSection.target.startDate ?? null,
      end_date: targetSection.target.endDate ?? null,
    };
    const taskUpdates = flattenTasks(targetSection.tasks).filter((task) => task.start_date || task.end_date);

    try {
      await Promise.all([
        updateList(singleSelectedList.listId, {
          baseline_start_date: currentProjectRange.start_date,
          baseline_end_date: currentProjectRange.end_date,
        }),
        ...taskUpdates.map((task) =>
          updateTask(task.id, {
            baseline_start_date: task.start_date,
            baseline_end_date: task.end_date,
          })
        ),
      ]);
      window.dispatchEvent(new Event('myproplanner:project-settings-updated'));
      await loadTasks();
    } catch (err) {
      console.error('Failed to set baseline:', err);
      await loadTasks();
    }
  }, [loadTasks, sectionTimelineMap, sections, singleSelectedList]);

  const handleDependencyRemove = React.useCallback(
    async (editor: DependencyEditorState) => {
      try {
        await removeDependency(editor.dependency.successor_id, editor.dependency.id);
        setSections((prev) =>
          prev.map((section) =>
            section.target.listId === editor.sectionId
              ? {
                  ...section,
                  dependencies: section.dependencies.filter((dependency) => dependency.id !== editor.dependency.id),
                }
              : section
          )
        );
        setDependencyEditor(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove dependency');
        await loadTasks();
      }
    },
    [loadTasks]
  );

  const handleBarMouseDown = (e: React.MouseEvent, task: Task, mode: 'move' | 'start' | 'end' = 'move') => {
    if (!task.start_date || !task.end_date) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging({
      taskId: task.id,
      startX: e.clientX,
      origStart: task.start_date,
      origEnd: task.end_date,
      mode,
    });
  };

  const startLabelResize = (startX: number, startWidth: number) => {
    const onMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - startX;
      setActiveSavedViewId('');
      setLabelWidth(Math.max(180, startWidth + delta));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const startPlannerResize = (startY: number, startHeight: number) => {
    const onMouseMove = (event: MouseEvent) => {
      const delta = event.clientY - startY;
      setPlannerPanelHeight(Math.max(MIN_PLANNER_PANEL_HEIGHT, Math.min(MAX_PLANNER_PANEL_HEIGHT, startHeight + delta)));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const syncVerticalScroll = React.useCallback((source: 'labels' | 'timeline') => {
    if (scrollSyncRef.current && scrollSyncRef.current !== source) return;

    const sourceNode = source === 'labels' ? labelScrollRef.current : timelineScrollRef.current;
    const targetNode = source === 'labels' ? timelineScrollRef.current : labelScrollRef.current;
    if (!sourceNode || !targetNode) return;

    scrollSyncRef.current = source;
    targetNode.scrollTop = sourceNode.scrollTop;

    requestAnimationFrame(() => {
      if (scrollSyncRef.current === source) {
        scrollSyncRef.current = null;
      }
    });
  }, []);

  const syncTimelineHeaderPosition = React.useCallback(() => {
    if (!timelineScrollRef.current || !timelineHeaderInnerRef.current) return;
    timelineHeaderInnerRef.current.style.transform = `translateX(-${timelineScrollRef.current.scrollLeft}px)`;
  }, []);

  const handleTimelinePanStart = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !timelineScrollRef.current) return;

    const target = event.target as HTMLElement | SVGElement;
    if (target.closest('.gantt-bar')) return;

    timelinePanRef.current = {
      startX: event.clientX,
      startLeft: timelineScrollRef.current.scrollLeft,
    };
    setIsTimelinePanning(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!timelineScrollRef.current || !timelinePanRef.current) return;
      const deltaX = moveEvent.clientX - timelinePanRef.current.startX;
      timelineScrollRef.current.scrollLeft = timelinePanRef.current.startLeft - deltaX;
    };

    const handleMouseUp = () => {
      timelinePanRef.current = null;
      setIsTimelinePanning(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  React.useEffect(() => {
    if (!dependencyEditor) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (dependencyEditorRef.current && !dependencyEditorRef.current.contains(event.target as Node)) {
        setDependencyEditor(null);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [dependencyEditor]);

  React.useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragging.startX;
      const daysDelta = Math.round(dx / dayWidth);
      if (daysDelta === 0) return;
      const nextDates = calculateDraggedDates(dragging, daysDelta);

      setSections((prev) =>
        prev.map((section) => ({
          ...section,
          tasks: updateTaskInTree(section.tasks, dragging.taskId, {
            start_date: nextDates.start_date,
            end_date: nextDates.end_date,
          }),
        }))
      );
    };

    const onMouseUp = async (e: MouseEvent) => {
      const dx = e.clientX - dragging.startX;
      const daysDelta = Math.round(dx / dayWidth);
      const nextDates = calculateDraggedDates(dragging, daysDelta);
      const didChange =
        nextDates.start_date !== dragging.origStart ||
        nextDates.end_date !== dragging.origEnd;

      if (didChange) {
        const nextStartDate = nextDates.start_date;
        const nextEndDate = nextDates.end_date;

        try {
          await updateTask(dragging.taskId, {
            start_date: nextStartDate,
            end_date: nextEndDate,
          });
          await autoShiftDependentTasks(dragging.taskId, nextStartDate, nextEndDate);
        } catch (err) {
          console.error('Failed to update task dates:', err);
          await loadTasks();
        }
      }

      setDragging(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [autoShiftDependentTasks, dayWidth, dragging, loadTasks]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task and all its subtasks?')) return;
    try {
      await deleteTask(id);
      await loadTasks();
      emitTasksMutated('gantt-view');
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

  const handleCreateTopLevel = async (listId: string) => {
    try {
      const defaultStatus =
        normalizeProjectSettings(selectedLists.find((item) => item.listId === listId)?.listSettings).statuses[0]?.value ||
        'NOT_STARTED';
      await createTask({
        list_id: listId,
        parent_id: null,
        name: 'New Task',
        status: defaultStatus,
      });
      await loadTasks();
      emitTasksMutated('gantt-view');
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const handleReminderSave = async (task: Task, details: { reminderAt: string | null; note: string | null }) => {
    await updateTask(task.id, {
      custom_fields: setTaskReminderDetails(task.custom_fields, details),
    });
    await loadTasks();
    emitTasksMutated('gantt-view');
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to rearrange tasks');
        await loadTasks();
      }
    },
    [loadTasks]
  );

  const handleMakeSubtaskOfAbove = React.useCallback(
    async (task: Task) => {
      const currentIndex = taskRows.findIndex((row) => row.task.id === task.id);
      if (currentIndex <= 0) {
        setError('There is no task above this one to nest under.');
        return;
      }

      const targetRow = [...taskRows.slice(0, currentIndex)].reverse().find((row) => row.section.target.listId === task.list_id);
      if (!targetRow) {
        setError('There is no task above this one in the current project.');
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
    },
    [persistTaskPositions, sections, taskRows]
  );

  const handleOutdentTask = React.useCallback(
    async (task: Task) => {
      const section = sections.find((item) => item.target.listId === task.list_id);
      if (!section) return;

      const sourceContext = findTaskContext(section.tasks, task.id);
      const parentTask = sourceContext?.parent;
      if (!sourceContext || !parentTask) {
        setError('This task is already at the top level.');
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

  const handleReorderTask = React.useCallback(
    async (draggedTaskId: string, targetTaskId: string) => {
      if (draggedTaskId === targetTaskId) return;

      const draggedRow = taskRows.find((row) => row.task.id === draggedTaskId);
      const targetRow = taskRows.find((row) => row.task.id === targetTaskId);
      if (!draggedRow || !targetRow) return;
      if (draggedRow.section.target.listId !== targetRow.section.target.listId) return;

      const section = sections.find((item) => item.target.listId === draggedRow.section.target.listId);
      if (!section) return;

      const draggedContext = findTaskContext(section.tasks, draggedTaskId);
      const targetContext = findTaskContext(section.tasks, targetTaskId);
      if (!draggedContext || !targetContext) return;

      const draggedParentId = draggedContext.parent?.id ?? null;
      const targetParentId = targetContext.parent?.id ?? null;
      if (draggedParentId !== targetParentId) {
        setError('Drag reordering currently works within the same task level. Use the right-click menu to change level first.');
        return;
      }

      const siblings = getSiblingTasks(section.tasks, draggedParentId).filter((item) => item.id !== draggedTaskId);
      const targetIndex = siblings.findIndex((item) => item.id === targetTaskId);
      if (targetIndex === -1) return;
      siblings.splice(targetIndex, 0, draggedContext.task);

      await persistTaskPositions(
        siblings.map((item, index) => ({
          id: item.id,
          data: { position: index },
        }))
      );
    },
    [persistTaskPositions, sections, taskRows]
  );

  const buildContextMenuActions = (task: Task) => {
    const hasReminder = Boolean(getTaskReminderAt(task));

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
        label: 'New Subtask',
        icon: <GitBranch size={13} />,
        onClick: () => setEditModal({ taskId: null, parentId: task.id, listId: task.list_id }),
      },
      {
        label: 'Level Up Under Task Above',
        icon: <GitBranch size={13} />,
        onClick: () => void handleMakeSubtaskOfAbove(task),
      },
      {
        label: 'Level Down To Parent Level',
        icon: <GripVertical size={13} />,
        onClick: () => void handleOutdentTask(task),
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

  const headerHeight = Math.max(64, headerPrimaryFontSize + 48);
  const svgHeight = headerHeight + rows.length * rowHeight + 20;

  const renderTimelineHeader = React.useCallback(
    () => (
        <svg width={totalWidth} height={headerHeight} style={{ display: 'block', userSelect: 'none' }}>
          <rect x={0} y={0} width={totalWidth} height={headerHeight} fill="#F8FAFC" />
          <line x1={0} y1={headerHeight} x2={totalWidth} y2={headerHeight} stroke="#E2E8F0" strokeWidth={1} />

        {(() => {
          const today = new Date();
          const todayX = differenceInDays(today, timelineStart) * dayWidth;
          if (todayX < 0 || todayX > totalWidth) return null;

          return (
            <g>
              <rect x={todayX} y={0} width={dayWidth} height={headerHeight} fill="#DBEAFE" opacity={0.42} />
              <line
                x1={todayX}
                y1={0}
                x2={todayX}
                y2={headerHeight}
                stroke="#EF4444"
                strokeWidth={2}
                strokeDasharray="4,3"
                opacity={0.75}
              />
            </g>
          );
        })()}

        {zoom !== 'months' &&
          (() => {
            const monthCols: { label: string; x: number; width: number }[] = [];
            let current = startOfMonth(timelineStart);
            while (current <= timelineEnd) {
              const monthEnd = endOfMonth(current);
              const xStart = Math.max(0, differenceInDays(current, timelineStart)) * dayWidth;
              const xEnd = Math.min(totalDays, differenceInDays(monthEnd, timelineStart) + 1) * dayWidth;
              if (xEnd > xStart) {
                monthCols.push({
                  label: format(current, 'MMMM yyyy'),
                  x: xStart,
                  width: xEnd - xStart,
                });
              }
              current = addMonths(current, 1);
            }

            return monthCols.map((col, index) => (
              <g key={`overlay-month-${index}`}>
                <line x1={col.x} y1={0} x2={col.x} y2={headerHeight} stroke="#E2E8F0" strokeWidth={1} />
                <text
                  x={col.x + col.width / 2}
                  y={14}
                  textAnchor="middle"
                  fontSize={headerPrimaryFontSize}
                  fill="#64748B"
                  fontWeight="600"
                >
                  {col.label}
                </text>
              </g>
            ));
          })()}

        {headerColumns.map((col, index) => (
          <g key={`overlay-header-${index}`}>
            {zoom === 'days' &&
              (() => {
                const headerDate = addDays(timelineStart, index);
                const isTodayHeader = format(headerDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                if (!isTodayHeader) return null;
                return (
                  <rect
                    x={col.x + 2}
                    y={20}
                    width={Math.max(0, col.width - 4)}
                    height={Math.max(34, headerSecondaryFontSize + 24)}
                    rx={8}
                    fill="#DBEAFE"
                    opacity={0.95}
                  />
                );
              })()}
            <line
              x1={col.x}
              y1={zoom !== 'months' ? headerHeight / 2 : 0}
              x2={col.x}
              y2={headerHeight}
              stroke="#E2E8F0"
              strokeWidth={1}
            />
            {zoom === 'days' && (
              <text
                x={col.x + col.width / 2}
                y={30}
                textAnchor="middle"
                fontSize={headerSecondaryFontSize}
                fill={format(addDays(timelineStart, index), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? '#1D4ED8' : '#94A3B8'}
                fontWeight={format(addDays(timelineStart, index), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? '700' : '500'}
              >
                {format(addDays(timelineStart, index), 'EEE')}
              </text>
            )}
            <text
              x={col.x + col.width / 2}
              y={zoom === 'days' ? 48 : zoom !== 'months' ? headerHeight - 8 : headerHeight / 2 + 5}
              textAnchor="middle"
              fontSize={zoom === 'days' ? headerSecondaryFontSize : headerPrimaryFontSize}
              fill={zoom === 'days' && format(addDays(timelineStart, index), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? '#1D4ED8' : '#64748B'}
              fontWeight={zoom === 'days' && format(addDays(timelineStart, index), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? '700' : '500'}
            >
              {col.label}
            </text>
          </g>
        ))}
        </svg>
    ),
    [dayWidth, headerColumns, headerHeight, headerPrimaryFontSize, headerSecondaryFontSize, timelineEnd, timelineStart, totalDays, totalWidth, zoom]
  );

  React.useEffect(() => {
    if (loading || rows.length === 0) return;
    const nextKey = `${selectedLists.map((item) => item.listId).sort().join('|')}:${zoom}:${zoomScale}:${timelineStart.toISOString()}:${timelineEnd.toISOString()}`;
    if (autoScrolledViewKeyRef.current === nextKey) return;
    autoScrolledViewKeyRef.current = nextKey;
    requestAnimationFrame(() => {
      scrollToToday();
    });
  }, [loading, rows.length, scrollToToday, selectedLists, timelineEnd, timelineStart, zoom, zoomScale]);

  React.useEffect(() => {
    if (loading || rows.length === 0 || !timelineScrollRef.current) return;
    const expectedTodayOffset = Math.max(0, differenceInDays(new Date(), timelineStart) * dayWidth - 220);
    if (expectedTodayOffset <= 0) return;

    requestAnimationFrame(() => {
      if (!timelineScrollRef.current) return;
      if (timelineScrollRef.current.scrollLeft <= 4) {
        scrollToToday();
      }
    });
  }, [dayWidth, loading, rows.length, scrollToToday, timelineStart]);

  React.useEffect(() => {
    syncTimelineHeaderPosition();
  }, [syncTimelineHeaderPosition, timelineStart, timelineEnd, totalWidth, zoom]);

  const activeSavedViewName = React.useMemo(
    () => activeProjectSettings.savedViews.find((view) => view.id === activeSavedViewId)?.name ?? '',
    [activeProjectSettings.savedViews, activeSavedViewId]
  );

  const ganttCustomizeOverview = (
    <>
      <section className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Timeline controls</p>
        <div className="rounded-[1.4rem] border border-slate-200 bg-white p-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => {
              setActiveSavedViewId('');
              setShowDependencies((current) => !current);
            }}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-900">Show dependencies</p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Draw dependency lines directly on the timeline.</p>
            </div>
            <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${showDependencies ? 'bg-blue-600' : 'bg-slate-200'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${showDependencies ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSavedViewId('');
              setAutoShiftDependencies((current) => !current);
            }}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-900">Auto-shift linked tasks</p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Move downstream tasks automatically when dependencies change.</p>
            </div>
            <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${autoShiftDependencies ? 'bg-blue-600' : 'bg-slate-200'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${autoShiftDependencies ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSavedViewId('');
              setCriticalOnly((current) => !current);
            }}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-900">Critical path only</p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Reduce noise and focus the timeline on critical work.</p>
            </div>
            <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${criticalOnly ? 'bg-blue-600' : 'bg-slate-200'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${criticalOnly ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
            </span>
          </button>
          <button
            type="button"
            onClick={onToggleDefaultTaskTreeExpanded}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-900">Tasks open by default</p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Start the planner with project task trees already expanded.</p>
            </div>
            <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${defaultTaskTreeExpanded ? 'bg-blue-600' : 'bg-slate-200'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${defaultTaskTreeExpanded ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
            </span>
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Display</p>
        <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="space-y-4">
            <label className="block">
              <div className="mb-2 flex items-center justify-between gap-3 text-[13px] font-medium text-slate-900">
                <span>Label column width</span>
                <span className="text-xs font-semibold text-slate-500">{labelWidth}px</span>
              </div>
              <input
                type="range"
                min={180}
                max={520}
                value={labelWidth}
                onChange={(event) => {
                  setActiveSavedViewId('');
                  setLabelWidth(Number(event.target.value));
                }}
                className="w-full accent-blue-600"
              />
            </label>
            <label className="block">
              <div className="mb-2 flex items-center justify-between gap-3 text-[13px] font-medium text-slate-900">
                <span>Text size</span>
                <span className="text-xs font-semibold text-slate-500">{ganttFontSize}px</span>
              </div>
              <input
                type="range"
                min={9}
                max={20}
                value={ganttFontSize}
                onChange={(event) => {
                  setActiveSavedViewId('');
                  setGanttFontSize(Number(event.target.value));
                }}
                className="w-full accent-blue-600"
              />
            </label>
            <label className="block">
              <div className="mb-2 flex items-center justify-between gap-3 text-[13px] font-medium text-slate-900">
                <span>Timeline density</span>
                <span className="text-xs font-semibold text-slate-500">{zoomScale}%</span>
              </div>
              <input
                type="range"
                min={40}
                max={300}
                value={zoomScale}
                onChange={(event) => {
                  setActiveSavedViewId('');
                  setZoomScale(Number(event.target.value));
                }}
                className="w-full accent-blue-600"
              />
            </label>
          </div>
        </div>
      </section>
    </>
  );

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading Gantt chart...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-3">
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => void loadTasks()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={plannerPanelRef}
        className="relative z-30 flex-shrink-0 overflow-visible"
        style={plannerPanelHeight ? { height: plannerPanelHeight } : undefined}
      >
        <PlannerToolbar
          selectedLists={selectedLists}
          resultSummary={
            visibleTaskCount === totalTaskCount
              ? `${totalTaskCount} scheduled tasks visible in the timeline${overallReportSummary.criticalTasks > 0 ? ` · ${overallReportSummary.criticalTasks} critical` : ''}${dependencyInsights.totalConflicts > 0 ? ` · ${dependencyInsights.totalConflicts} dependency conflict${dependencyInsights.totalConflicts === 1 ? '' : 's'}` : ''}`
              : `${visibleTaskCount} of ${totalTaskCount} tasks match the current filters${criticalOnly ? ' · critical only' : ''}${dependencyInsights.totalConflicts > 0 ? ` · ${dependencyInsights.totalConflicts} dependency conflict${dependencyInsights.totalConflicts === 1 ? '' : 's'}` : ''}`
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
          onToggleStatus={(status) => {
            setActiveSavedViewId('');
            setSelectedStatuses((prev) =>
              prev.includes(status) ? prev.filter((value) => value !== status) : [...prev, status]
            );
          }}
          onClearFilters={() => {
            setActiveSavedViewId('');
            setSearchQuery('');
            setSelectedStatuses([]);
            setHideCompleted(false);
            setFocusMode('all');
            setCriticalOnly(false);
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
          viewModeAccessory={
            <button
              type="button"
              onClick={() => scrollToToday()}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <CalendarDays size={14} />
              Today
            </button>
          }
          agendaOpen={agendaOpen}
          agendaNotificationCount={agendaNotificationCount}
          onToggleAgenda={onToggleAgenda}
          mailNotificationCount={mailNotificationCount}
          uiScale={uiScale}
          onUiScaleChange={onUiScaleChange}
          fillHeight={Boolean(plannerPanelHeight)}
          extraActions={
            <>
              <div
                className="relative"
                onMouseEnter={() => openHoverToolbarMenu('display')}
                onMouseLeave={() => scheduleHoverToolbarMenuClose('display')}
              >
                <button
                  type="button"
                  onClick={() => openHoverToolbarMenu('display')}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors ${
                    hoverToolbarMenu === 'display'
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Type size={14} />
                  Display
                </button>
                {hoverToolbarMenu === 'display' && (
                  <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-[1rem] border border-slate-200 bg-white p-3 shadow-2xl">
                    <div className="space-y-3">
                      <div className="rounded-[1rem] border border-slate-200 bg-slate-50/70 p-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSavedViewId('');
                            setShowDependencies((current) => !current);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${showDependencies ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                          <span>Show dependencies</span>
                          <span>{showDependencies ? 'On' : 'Off'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSavedViewId('');
                            setAutoShiftDependencies((current) => !current);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${autoShiftDependencies ? 'bg-violet-50 text-violet-700' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                          <span>Auto-shift linked tasks</span>
                          <span>{autoShiftDependencies ? 'On' : 'Off'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSavedViewId('');
                            setCriticalOnly((current) => !current);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${criticalOnly ? 'bg-rose-50 text-rose-700' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                          <span>Critical only</span>
                          <span>{criticalOnly ? 'On' : 'Off'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={onToggleDefaultTaskTreeExpanded}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${defaultTaskTreeExpanded ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                          <span>Tasks open by default</span>
                          <span>{defaultTaskTreeExpanded ? 'On' : 'Off'}</span>
                        </button>
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                          <span>Font size</span>
                          <span>{ganttFontSize}px</span>
                        </div>
                        <input
                          type="range"
                          min={9}
                          max={20}
                          step={1}
                          value={ganttFontSize}
                          onChange={(event) => {
                            setActiveSavedViewId('');
                            setGanttFontSize(Number(event.target.value));
                          }}
                          className="w-full accent-blue-600"
                        />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                          <span>Zoom scale</span>
                          <span>{zoomScale}%</span>
                        </div>
                        <input
                          type="range"
                          min={40}
                          max={300}
                          step={10}
                          value={zoomScale}
                          onChange={(event) => {
                            setActiveSavedViewId('');
                            setZoomScale(Number(event.target.value));
                          }}
                          className="w-full accent-blue-600"
                        />
                      </div>

                      {singleSelectedList && (
                        <button
                          type="button"
                          onClick={() => scrollToProjectStart()}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          Jump to project start
                        </button>
                      )}
                      {singleSelectedList && (
                        <button
                          type="button"
                          onClick={() => void handleSetBaseline()}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          Set baseline from current plan
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSavedViewId('');
                          setGanttFontSize(DEFAULT_GANTT_FONT_SIZE);
                          setZoomScale(DEFAULT_GANTT_ZOOM_SCALE);
                          setPlannerPanelHeight(null);
                        }}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        Reset display
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {dependencyInsights.totalConflicts > 0 && (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  {dependencyInsights.totalConflicts} conflict{dependencyInsights.totalConflicts === 1 ? '' : 's'}
                </span>
              )}
              <button
                type="button"
                onClick={() => setReportsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
              >
                <FileText size={14} />
                Reports
              </button>
              <div className="flex items-center whitespace-nowrap">
                <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
                  {(['days', 'weeks', 'months'] as ZoomLevel[]).map((level) => (
                    <button
                      key={level}
                      onClick={() => {
                        setActiveSavedViewId('');
                        setZoom(level);
                      }}
                      className={`rounded-full px-3 py-1 text-xs capitalize transition-colors ${
                        zoom === level ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </>
          }
        />
      </div>

      <div className="group relative -mt-px h-0 flex-shrink-0">
        <button
          type="button"
          className="absolute inset-x-0 -top-1 h-2 cursor-row-resize bg-transparent"
          onMouseDown={(event) => {
            event.preventDefault();
            startPlannerResize(
              event.clientY,
              plannerPanelRef.current?.getBoundingClientRect().height ?? plannerPanelHeight ?? MIN_PLANNER_PANEL_HEIGHT
            );
          }}
          title="Resize planner area"
          aria-label="Resize planner area"
        />
        <div className="pointer-events-none absolute left-4 right-4 top-0 h-px bg-slate-200 transition-colors group-hover:bg-blue-400" />
      </div>

      {filteredSections.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
          {sections.length === 0 ? 'No selected projects found.' : 'No tasks match the current filters.'}
        </div>
      ) : (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-shrink-0 flex-col border-r border-gray-200" style={{ width: labelWidth }}>
          <div className="flex flex-shrink-0 items-end border-b border-gray-200 bg-gray-50" style={{ height: headerHeight }}>
            <span className="px-3 pb-2 font-semibold uppercase tracking-wide text-gray-500" style={{ fontSize: `${secondaryFontSize}px` }}>
              {activeColumnLabels.gantt_task || DEFAULT_COLUMN_LABELS.gantt_task}
            </span>
          </div>
          <div
            ref={labelScrollRef}
            className="min-h-0 flex-1 overflow-y-auto"
            onScroll={() => syncVerticalScroll('labels')}
          >

          {rows.map((row, index) => {
            if (row.kind === 'section') {
              const accentColor = getAppearanceColor(row.section.target.listColor, '#2563EB');
              return (
                <div
                  key={`section-${row.section.target.listId}`}
                  className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3"
                  style={{ height: rowHeight }}
                  onMouseEnter={() => setHoveredProjectId(row.section.target.listId)}
                  onMouseLeave={() => setHoveredProjectId((current) => (current === row.section.target.listId ? null : current))}
                  onDoubleClick={() => setEditingProjectTarget(row.section.target)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setEditingProjectTarget(row.section.target);
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setCollapsedSectionIds((current) => {
                            const next = new Set(current);
                            if (next.has(row.section.target.listId)) next.delete(row.section.target.listId);
                            else next.add(row.section.target.listId);
                            return next;
                          });
                        }}
                        className="rounded p-0.5 text-gray-400 transition-colors hover:bg-slate-200 hover:text-gray-700"
                        title={collapsedSectionIds.has(row.section.target.listId) ? 'Expand project tasks' : 'Collapse project tasks'}
                      >
                        {collapsedSectionIds.has(row.section.target.listId) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      </button>
                      <EntityIcon
                        icon={row.section.target.listIcon}
                        fallbackIcon="folder-kanban"
                        color={accentColor}
                        size={14}
                      />
                      <span className="truncate font-semibold text-gray-800" style={{ fontSize: `${ganttFontSize}px` }}>
                        {row.section.target.listName}
                      </span>
                    </div>
                    <p className="truncate text-gray-500" style={{ fontSize: `${secondaryFontSize}px` }}>
                      {row.section.target.workspaceName} / {row.section.target.spaceName}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {hoveredProjectId === row.section.target.listId && (
                      <>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditingProjectTarget(row.section.target);
                          }}
                          className="rounded p-1 text-gray-400 transition-colors hover:bg-slate-200 hover:text-gray-700"
                          title="Edit project"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleCreateTopLevel(row.section.target.listId);
                          }}
                          className="rounded p-1 text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700"
                          title="Add task"
                        >
                          <Plus size={12} />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleProjectDelete(row.section.target);
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
              );
            }

            const accentColor = getAppearanceColor(
              row.section.target.listColor,
              getAppearanceColor(row.task.color, getStatusOption(row.task.status, row.section.target.listSettings).color)
            );

            return (
              <div
                key={row.task.id}
                className={`group/label flex cursor-context-menu items-center border-b border-gray-100 hover:bg-gray-50 ${
                  taskReorderTargetId === row.task.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''
                }`}
                style={{ height: rowHeight, paddingLeft: 12 + row.depth * 16 }}
                draggable
                onDragStart={(event) => {
                  setTaskReorderDrag({
                    taskId: row.task.id,
                    parentId: row.task.parent_id,
                    sectionId: row.section.target.listId,
                  });
                  setTaskReorderTargetId(row.task.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', row.task.id);
                }}
                onDragOver={(event) => {
                  if (!taskReorderDrag) return;
                  if (taskReorderDrag.sectionId !== row.section.target.listId) return;
                  if (taskReorderDrag.parentId !== row.task.parent_id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setTaskReorderTargetId(row.task.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!taskReorderDrag) return;
                  void handleReorderTask(taskReorderDrag.taskId, row.task.id);
                  setTaskReorderDrag(null);
                  setTaskReorderTargetId(null);
                }}
                onDragEnd={() => {
                  setTaskReorderDrag(null);
                  setTaskReorderTargetId(null);
                }}
                onMouseEnter={() => setHoveredRowId(row.task.id)}
                onMouseLeave={() => setHoveredRowId(null)}
                onDoubleClick={() => setEditModal({ taskId: row.task.id, parentId: null, listId: row.task.list_id })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ task: row.task, x: e.clientX, y: e.clientY });
                }}
              >
                {row.task.children.length > 0 ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setCollapsedTaskIds((current) => {
                        const next = new Set(current);
                        if (next.has(row.task.id)) next.delete(row.task.id);
                        else next.add(row.task.id);
                        return next;
                      });
                    }}
                    className="mr-1 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    title={collapsedTaskIds.has(row.task.id) ? 'Expand subtasks' : 'Collapse subtasks'}
                  >
                    {collapsedTaskIds.has(row.task.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </button>
                ) : (
                  <span className="mr-1 w-[17px] flex-shrink-0" />
                )}
                <GripVertical size={12} className="mr-1 flex-shrink-0 text-gray-300 transition-colors group-hover/label:text-gray-400" />
                <EntityIcon
                  icon={row.task.icon}
                  fallbackIcon={row.task.task_type === 'project' ? row.section.target.listIcon || 'briefcase' : 'circle-dot'}
                  color={accentColor}
                  size={13}
                  className="mr-2 flex-shrink-0"
                />
                <span className="flex-1 truncate pr-1 text-gray-700" style={{ fontSize: `${ganttFontSize}px` }} title={row.task.name}>
                  {row.task.name}
                </span>
                {criticalPathBySection.get(row.section.target.listId)?.criticalTaskIds.has(row.task.id) && (
                  <span
                    className="mr-1 rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700"
                    style={{ fontSize: `${tinyFontSize}px` }}
                    title="Critical path: if this task slips, the project finish date slips too."
                  >
                    Critical path
                  </span>
                )}
                {hoveredRowId === row.task.id && (
                  <button
                    onClick={() =>
                      setEditModal({ taskId: null, parentId: row.task.id, listId: row.task.list_id })
                    }
                    className="mr-1 rounded p-0.5 text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-600"
                    title="Add subtask"
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
            );
          })}
          </div>
        </div>

        <div
          className="group relative w-2 cursor-col-resize bg-transparent"
          onMouseDown={(event) => {
            event.preventDefault();
            startLabelResize(event.clientX, labelWidth);
          }}
          title="Resize task column"
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 transition-colors group-hover:bg-blue-400" />
        </div>

        <div className="min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden">
          <div className="flex-shrink-0 overflow-hidden border-b border-gray-200 bg-slate-50" style={{ height: headerHeight }}>
            <div ref={timelineHeaderInnerRef} className="will-change-transform" style={{ width: totalWidth }}>
              {renderTimelineHeader()}
            </div>
          </div>
          <div
            ref={timelineScrollRef}
            className={`min-h-0 min-w-0 flex-1 overflow-auto ${isTimelinePanning ? 'cursor-grabbing' : 'cursor-grab'}`}
            onScroll={() => {
              syncVerticalScroll('timeline');
              syncTimelineHeaderPosition();
            }}
            onMouseDown={handleTimelinePanStart}
          >
            <svg
              ref={svgRef}
              width={totalWidth}
              height={svgHeight}
              style={{ display: 'block', userSelect: 'none', marginTop: -headerHeight }}
            >
            {rows.map((row, index) => {
              const y = headerHeight + index * rowHeight;
              if (row.kind === 'section') {
                return (
                  <rect
                    key={`section-bg-${row.section.target.listId}`}
                    x={0}
                    y={y}
                    width={totalWidth}
                    height={rowHeight}
                    fill="#F8FAFC"
                    style={{ cursor: 'pointer' }}
                    onDoubleClick={() => setEditingProjectTarget(row.section.target)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setEditingProjectTarget(row.section.target);
                    }}
                  />
                );
              }
              return (
                <rect
                  key={`row-bg-${row.task.id}`}
                  x={0}
                  y={y}
                  width={totalWidth}
                  height={rowHeight}
                  fill={index % 2 === 0 ? '#FFFFFF' : '#F8FAFC'}
                />
              );
            })}

            {Array.from({ length: totalDays }, (_, index) => {
              const date = addDays(timelineStart, index);
              const day = date.getDay();
              const isWeekend = day === 5 || day === 6;
              if (!isWeekend) return null;

              return (
                <rect
                  key={`weekend-${index}`}
                  x={index * dayWidth}
                  y={headerHeight}
                  width={dayWidth}
                  height={svgHeight - headerHeight}
                  fill="#F8FAFC"
                  opacity={0.95}
                />
              );
            })}

            {(() => {
              const today = new Date();
              const todayX = differenceInDays(today, timelineStart) * dayWidth;
              if (todayX >= 0 && todayX <= totalWidth) {
                return (
                  <g>
                    <rect
                      x={todayX}
                      y={headerHeight}
                      width={dayWidth}
                      height={svgHeight - headerHeight}
                      fill="#FEE2E2"
                      opacity={0.38}
                    />
                    <line
                      x1={todayX}
                      y1={0}
                      x2={todayX}
                      y2={svgHeight}
                      stroke="#EF4444"
                      strokeWidth={2}
                      strokeDasharray="4,3"
                      opacity={0.75}
                    />
                  </g>
                );
              }
              return null;
            })()}

            <rect x={0} y={0} width={totalWidth} height={headerHeight} fill="#F8FAFC" />
            <line x1={0} y1={headerHeight} x2={totalWidth} y2={headerHeight} stroke="#E2E8F0" strokeWidth={1} />

            {zoom !== 'months' &&
              (() => {
                const monthCols: { label: string; x: number; width: number }[] = [];
                let current = startOfMonth(timelineStart);
                while (current <= timelineEnd) {
                  const monthEnd = endOfMonth(current);
                  const xStart = Math.max(0, differenceInDays(current, timelineStart)) * dayWidth;
                  const xEnd = Math.min(totalDays, differenceInDays(monthEnd, timelineStart) + 1) * dayWidth;
                  if (xEnd > xStart) {
                    monthCols.push({
                      label: format(current, 'MMMM yyyy'),
                      x: xStart,
                      width: xEnd - xStart,
                    });
                  }
                  current = addMonths(current, 1);
                }

                return monthCols.map((col, index) => (
                  <g key={`month-${index}`}>
                    <line x1={col.x} y1={0} x2={col.x} y2={headerHeight} stroke="#E2E8F0" strokeWidth={1} />
                    <text
                      x={col.x + col.width / 2}
                      y={14}
                      textAnchor="middle"
                  fontSize={headerPrimaryFontSize}
                      fill="#64748B"
                      fontWeight="600"
                    >
                      {col.label}
                    </text>
                  </g>
                ));
              })()}

            {headerColumns.map((col, index) => (
              <g key={`header-${index}`}>
                {zoom === 'days' &&
                  (() => {
                    const headerDate = addDays(timelineStart, index);
                    const isTodayHeader = format(headerDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                    if (!isTodayHeader) return null;
                    return (
                      <rect
                        x={col.x + 2}
                        y={20}
                        width={Math.max(0, col.width - 4)}
                    height={Math.max(34, headerSecondaryFontSize + 24)}
                        rx={8}
                        fill="#DBEAFE"
                        opacity={0.95}
                      />
                    );
                  })()}
                <line
                  x1={col.x}
                  y1={zoom !== 'months' ? headerHeight / 2 : 0}
                  x2={col.x}
                  y2={headerHeight}
                  stroke="#E2E8F0"
                  strokeWidth={1}
                />
                {zoom === 'days' && (
                  <text
                    x={col.x + col.width / 2}
                    y={30}
                    textAnchor="middle"
                    fontSize={headerSecondaryFontSize}
                    fill={format(addDays(timelineStart, index), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? '#1D4ED8' : '#94A3B8'}
                    fontWeight={format(addDays(timelineStart, index), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? '700' : '500'}
                  >
                    {format(addDays(timelineStart, index), 'EEE')}
                  </text>
                )}
                <text
                  x={col.x + col.width / 2}
                  y={zoom === 'days' ? 48 : zoom !== 'months' ? headerHeight - 8 : headerHeight / 2 + 5}
                  textAnchor="middle"
                  fontSize={zoom === 'days' ? headerSecondaryFontSize : headerPrimaryFontSize}
                  fill={zoom === 'days' && format(addDays(timelineStart, index), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? '#1D4ED8' : '#64748B'}
                  fontWeight={zoom === 'days' && format(addDays(timelineStart, index), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? '700' : '500'}
                >
                  {col.label}
                </text>
              </g>
            ))}

            {headerColumns.map((col, index) => (
              <line
                key={`grid-${index}`}
                x1={col.x}
                y1={headerHeight}
                x2={col.x}
                y2={svgHeight}
                stroke="#E2E8F0"
                strokeWidth={0.5}
              />
            ))}

            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#94A3B8" />
              </marker>
            </defs>

            {showDependencies &&
              filteredSections.flatMap((section) =>
                section.dependencies.map((dependency) => {
                  const predecessorIndex = taskRowIndexMap.get(dependency.predecessor_id);
                  const successorIndex = taskRowIndexMap.get(dependency.successor_id);
                  if (predecessorIndex === undefined || successorIndex === undefined) return null;

                  const predecessorTask = taskRows.find((row) => row.task.id === dependency.predecessor_id)?.task;
                  const successorTask = taskRows.find((row) => row.task.id === dependency.successor_id)?.task;
                  if (!predecessorTask || !successorTask) return null;

                  const predecessorMetrics = getBarMetrics(predecessorTask);
                  const successorMetrics = getBarMetrics(successorTask);
                  if (!predecessorMetrics || !successorMetrics) return null;

                  const x1 = predecessorMetrics.x + predecessorMetrics.width;
                  const y1 = headerHeight + predecessorIndex * rowHeight + rowHeight / 2;
                  const x2 = successorMetrics.x;
                  const y2 = headerHeight + successorIndex * rowHeight + rowHeight / 2;
                  const midX = (x1 + x2) / 2;
                  const midY = (y1 + y2) / 2;
                  const isConflicted = dependencyInsights.conflictedDependencyIds.has(dependency.id);
                  const isCritical = criticalPathBySection.get(section.target.listId)?.criticalDependencyIds.has(dependency.id);
                  const dependencyTypeLabel = DEPENDENCY_TYPE_LABELS.FS;
                  const dependencyState = {
                    dependency,
                    sectionId: section.target.listId,
                    x: 0,
                    y: 0,
                    predecessorName: predecessorTask.name,
                    successorName: successorTask.name,
                    conflictMessages: dependencyInsights.dependencyMessages.get(dependency.id) ?? [],
                  };
                  const openDependencyEditor = (event: React.MouseEvent<SVGElement>) => {
                    event.stopPropagation();
                    setContextMenu(null);
                    setDependencyContextMenu(null);
                    setDependencyEditor({
                      ...dependencyState,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  };
                  const openDependencyContextMenu = (event: React.MouseEvent<SVGElement>) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setContextMenu(null);
                    setDependencyEditor(null);
                    setDependencyContextMenu({
                      ...dependencyState,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  };
                  const dependencyTooltip = [
                    `${predecessorTask.name} -> ${successorTask.name}`,
                    `Rule: ${dependencyTypeLabel}`,
                    DEPENDENCY_TYPE_HINTS[dependency.dependency_type] ?? '',
                    ...(dependencyInsights.dependencyMessages.get(dependency.id) ?? []),
                    ...(isCritical ? ['Critical path link'] : []),
                    'Click to edit',
                    'Right-click to remove',
                  ].filter(Boolean).join('\n');
                  const pathD = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

                  return (
                    <g key={dependency.id}>
                      <path
                        d={pathD}
                        stroke="transparent"
                        strokeWidth={14}
                        fill="none"
                        className="cursor-pointer"
                        onClick={openDependencyEditor}
                        onContextMenu={openDependencyContextMenu}
                      />
                      <path
                        d={pathD}
                        stroke={isConflicted ? '#F59E0B' : isCritical ? '#E11D48' : '#94A3B8'}
                        strokeWidth={isConflicted ? 2.5 : isCritical ? 2.25 : 1.5}
                        fill="none"
                        markerEnd="url(#arrowhead)"
                        className="cursor-pointer"
                        onClick={openDependencyEditor}
                        onContextMenu={openDependencyContextMenu}
                      >
                        <title>{dependencyTooltip}</title>
                      </path>
                      <rect
                        x={midX - 18}
                        y={midY - 16}
                        width={36}
                        height={16}
                        rx={8}
                        fill={isConflicted ? '#FEF3C7' : isCritical ? '#FFE4E6' : '#FFFFFF'}
                        stroke={isConflicted ? '#F59E0B' : isCritical ? '#E11D48' : '#CBD5E1'}
                        className="cursor-pointer"
                        onClick={openDependencyEditor}
                        onContextMenu={openDependencyContextMenu}
                      />
                      <text
                        x={midX}
                        y={midY - 5}
                        textAnchor="middle"
                        fontSize={tinyFontSize}
                        fill={isConflicted ? '#B45309' : isCritical ? '#BE123C' : '#475569'}
                        className="cursor-pointer select-none"
                        onClick={openDependencyEditor}
                        onContextMenu={openDependencyContextMenu}
                      >
                        FS
                      </text>
                    </g>
                  );
                })
              )}

            {rows.map((row, index) => {
              if (row.kind === 'section') {
                const accentColor = getAppearanceColor(row.section.target.listColor, '#2563EB');
                const y = headerHeight + index * rowHeight;
                const sectionTimeline = sectionTimelineMap.get(row.section.target.listId);
                const sectionMetrics = sectionTimeline
                  ? getDateRangeMetrics(sectionTimeline.start_date, sectionTimeline.end_date)
                  : null;
                return (
                  <g key={`section-label-${row.section.target.listId}`}>
                    {sectionMetrics && (
                      <>
                        <rect
                          x={sectionMetrics.x}
                          y={y + 8}
                          width={sectionMetrics.width}
                          height={rowHeight - 16}
                          rx={8}
                          fill={accentColor}
                          opacity={0.18}
                        />
                        <rect
                          x={sectionMetrics.x}
                          y={y + rowHeight - 12}
                          width={sectionMetrics.width}
                          height={4}
                          rx={3}
                          fill={accentColor}
                          opacity={0.65}
                        />
                      </>
                    )}
                    <text x={8} y={y + Math.min(rowHeight - 12, ganttFontSize + 11)} fontSize={ganttFontSize} fill={accentColor} fontWeight="600">
                      {row.section.target.listName}
                    </text>
                  </g>
                );
              }

              const metrics = getBarMetrics(row.task);
              if (!metrics) return null;

              const { x, width } = metrics;
              const y = headerHeight + index * rowHeight;
              const barY = y + rowHeight / 2 - barHeight / 2;
              const isMilestone = row.task.task_type === 'milestone';
              const progress = getTaskProgress(row.task);
              const normalizedSettings = normalizeProjectSettings(row.section.target.listSettings);
              const statusOption = getStatusOption(row.task.status, normalizedSettings);
              const baseColor = getAppearanceColor(
                row.section.target.listColor,
                getAppearanceColor(row.task.color, statusOption.color)
              );
              const barVisual = getTaskBarVisualStyle(row.task, normalizedSettings, baseColor);
              const color = barVisual.fillColor;
              const isDraggingThis = dragging?.taskId === row.task.id;
              const taskEndDate = row.task.end_date;
              const isOverdue =
                taskEndDate !== null &&
                taskEndDate < format(new Date(), 'yyyy-MM-dd') &&
                !isCompletedStatus(row.task.status, normalizedSettings);
              const criticalPath = criticalPathBySection.get(row.section.target.listId);
              const isCritical = criticalPath?.criticalTaskIds.has(row.task.id) ?? false;
              const isFinishDriver = criticalPath?.finishDriverTaskIds.has(row.task.id) ?? false;
              const slackDays = criticalPath?.slackByTaskId.get(row.task.id);
              const hasDependencyConflict = dependencyInsights.conflictedTaskIds.has(row.task.id);
              const strokeColor = hasDependencyConflict ? '#F59E0B' : isOverdue ? '#DC2626' : isCritical ? '#E11D48' : 'none';
              const strokeWidth = hasDependencyConflict || isOverdue || isCritical ? 2.2 : 0;
              const barTitle = [
                row.task.name,
                `Status: ${statusOption.label}`,
                row.task.start_date && row.task.end_date ? `${row.task.start_date} -> ${row.task.end_date}` : 'No schedule',
                `Completion shading: ${Math.round(barVisual.completionRatio * 100)}%`,
                ...(typeof slackDays === 'number' ? [`Slack: ${slackDays} day${Math.abs(slackDays) === 1 ? '' : 's'}`] : []),
                ...(isCritical ? ['Critical path task'] : []),
                ...(isFinishDriver ? ['Directly affects finish date'] : []),
                ...(dependencyInsights.conflictMessages.get(row.task.id) ?? []),
              ].join('\n');

              return (
                <g
                  key={row.task.id}
                  className="gantt-bar"
                  onMouseEnter={() => setHoveredRowId(row.task.id)}
                  onMouseLeave={() => {
                    setHoveredRowId((current) => (current === row.task.id ? null : current));
                  }}
                >
                  {isMilestone ? (
                    <>
                      <polygon
                        points={`${x + width / 2},${barY} ${x + width},${barY + barHeight / 2} ${x + width / 2},${barY + barHeight} ${x},${barY + barHeight / 2}`}
                        fill={color}
                        opacity={isDraggingThis ? 0.75 : 0.92}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        style={{ cursor: 'grab' }}
                        onMouseDown={(e) => handleBarMouseDown(e, row.task, 'move')}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ task: row.task, x: e.clientX, y: e.clientY });
                        }}
                      >
                        <title>{barTitle}</title>
                      </polygon>
                    </>
                  ) : (
                    <>
                      <rect
                        x={x}
                        y={barY}
                        width={width}
                        height={barHeight}
                        rx={row.task.task_type === 'project' ? 7 : 4}
                        fill={color}
                        opacity={isDraggingThis ? 0.7 : 0.85}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        style={{ cursor: 'grab' }}
                        onMouseDown={(e) => handleBarMouseDown(e, row.task, 'move')}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ task: row.task, x: e.clientX, y: e.clientY });
                        }}
                      >
                        <title>{barTitle}</title>
                      </rect>
                      <rect
                        x={x + 1}
                        y={barY + 1}
                        width={Math.max(0, width - 2)}
                        height={Math.max(3, Math.floor(barHeight * 0.34))}
                        rx={row.task.task_type === 'project' ? 6 : 3}
                        fill={barVisual.topHighlightColor}
                        opacity={isDraggingThis ? 0.14 : 0.28}
                        style={{ pointerEvents: 'none' }}
                      />
                      <rect
                        x={x + 1}
                        y={barY + Math.max(4, Math.floor(barHeight * 0.58))}
                        width={Math.max(0, width - 2)}
                        height={Math.max(3, Math.ceil(barHeight * 0.28))}
                        rx={row.task.task_type === 'project' ? 6 : 3}
                        fill={barVisual.bottomShadeColor}
                        opacity={isDraggingThis ? 0.08 : 0.2}
                        style={{ pointerEvents: 'none' }}
                      />
                      {progress !== null && (
                        <rect
                          x={x}
                          y={barY + barHeight - 5}
                          width={(width * progress) / 100}
                          height={5}
                          rx={3}
                          fill={barVisual.progressAccent}
                          style={{ pointerEvents: 'none' }}
                        />
                      )}
                      {!isDraggingThis && hoveredRowId === row.task.id && (
                        <>
                          <rect
                            x={x - 4}
                            y={barY - 2}
                            width={8}
                            height={barHeight + 4}
                            rx={4}
                            fill="#ffffff"
                            stroke="#2563EB"
                            strokeWidth={1.5}
                            style={{ cursor: 'ew-resize' }}
                            onMouseDown={(e) => handleBarMouseDown(e, row.task, 'start')}
                          />
                          <rect
                            x={x + width - 4}
                            y={barY - 2}
                            width={8}
                            height={barHeight + 4}
                            rx={4}
                            fill="#ffffff"
                            stroke="#2563EB"
                            strokeWidth={1.5}
                            style={{ cursor: 'ew-resize' }}
                            onMouseDown={(e) => handleBarMouseDown(e, row.task, 'end')}
                          />
                        </>
                      )}
                    </>
                  )}
                  {(hasDependencyConflict || isOverdue) && (
                    <text
                      x={x + width + 6}
                      y={barY + barHeight / 2}
                      fontSize={tinyFontSize}
                      fill={hasDependencyConflict ? '#B45309' : '#DC2626'}
                      style={{ pointerEvents: 'none' }}
                    >
                      {hasDependencyConflict ? 'Conflict' : 'Overdue'}
                    </text>
                  )}
                  {isCritical && (
                    <text
                      x={x + width + 6}
                      y={barY + barHeight + Math.max(12, tinyFontSize + 2)}
                      fontSize={tinyFontSize}
                      fill="#BE123C"
                      fontWeight="600"
                      style={{ pointerEvents: 'none' }}
                    >
                      <title>Critical path: if this task slips, the project finish date slips too.</title>
                      Critical path
                    </text>
                  )}
                  {(width > 40 || isMilestone) && (
                    <text
                      x={isMilestone ? x + width + 6 : x + 6}
                      y={barY + barHeight / 2 + 4}
                      fontSize={Math.max(9, Math.min(ganttFontSize, 16))}
                      fill={isMilestone ? '#475569' : barVisual.labelColor}
                      style={{ pointerEvents: 'none' }}
                    >
                      {row.task.name.length > Math.floor(Math.max(width, 42) / Math.max(6, ganttFontSize * 0.62))
                        ? `${row.task.name.slice(0, Math.floor(Math.max(width, 42) / Math.max(6, ganttFontSize * 0.62)))}...`
                        : row.task.name}
                    </text>
                  )}
                </g>
              );
            })}
            </svg>
          </div>
        </div>
      </div>
      )}

      {dependencyEditor && (
        <div
          ref={dependencyEditorRef}
          className="fixed z-[140] w-80 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-2xl"
          style={{
            left: Math.min(dependencyEditor.x, window.innerWidth - 320),
            top: Math.min(dependencyEditor.y, window.innerHeight - 300),
          }}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Edit dependency</p>
              <p className="text-xs text-gray-500">
                {dependencyEditor.predecessorName} {'->'} {dependencyEditor.successorName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDependencyEditor(null)}
              className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          </div>
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {DEPENDENCY_TYPE_HINTS.FS}
          </div>
          {dependencyEditor.conflictMessages.length > 0 && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="mb-1 font-semibold">Conflict details</p>
              {dependencyEditor.conflictMessages.map((message, index) => (
                <p key={`${dependencyEditor.dependency.id}-${index}`}>{message}</p>
              ))}
            </div>
          )}
          <p className="mb-3 text-xs text-gray-500">Dependencies now use one simple rule: the next task starts only after the previous task is done.</p>
          <button
            type="button"
            onClick={() => void handleDependencyRemove(dependencyEditor)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-100"
          >
            <Trash2 size={14} />
            Remove dependency
          </button>
        </div>
      )}

      {reportsOpen && (
        <div className="fixed inset-0 z-[135] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[1px]" onClick={() => setReportsOpen(false)} />
          <div className="relative flex h-full w-full max-w-[28rem] flex-col border-l border-gray-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-5 py-5">
              <div>
                <h3 className="text-[1.5rem] font-semibold tracking-tight text-gray-900">Reports & Export</h3>
                <p className="mt-1 text-sm text-gray-500">Health, variance, slipped work, and stakeholder exports.</p>
              </div>
              <button
                type="button"
                onClick={() => setReportsOpen(false)}
                className="rounded-full bg-gray-100 p-2 text-gray-500 transition-colors hover:bg-gray-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportStakeholderReport}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <FileText size={14} />
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={handleExportStakeholderWorkbook}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Download size={14} />
                  Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={handleExportSvg}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Download size={14} />
                  Gantt SVG
                </button>
                <button
                  type="button"
                  onClick={handleExportPng}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Download size={14} />
                  Gantt PNG
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <section className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Average progress</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{overallReportSummary.averageProgress}%</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Critical tasks</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{overallReportSummary.criticalTasks}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Finish drivers</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{overallReportSummary.finishDrivers}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Slipped tasks</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{overallReportSummary.slippedCount}</p>
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-500" />
                  <h4 className="text-sm font-semibold text-gray-900">Project health</h4>
                </div>
                <div className="space-y-3">
                  {reportSummaries.map((item) => (
                    <div key={item.listId} className="rounded-2xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{item.listName}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {item.completedTasks} of {item.totalTasks} tasks completed
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            item.health === 'healthy'
                              ? 'bg-emerald-50 text-emerald-700'
                              : item.health === 'watch'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {item.health === 'healthy' ? 'Healthy' : item.health === 'watch' ? 'Watch' : 'At risk'}
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${item.averageProgress}%` }}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <span>Critical: {item.criticalTasks}</span>
                        <span>Finish drivers: {item.finishDrivers}</span>
                        <span>Overdue: {item.overdueTasks}</span>
                        <span>Slipped: {item.slippedTasks}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-sm font-semibold text-gray-900">Slipped tasks</h4>
                <div className="space-y-2">
                  {slippedTasks.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-400">
                      No slipped tasks in the current selection.
                    </div>
                  ) : (
                    slippedTasks
                      .sort((left, right) => right.varianceDays - left.varianceDays)
                      .slice(0, 12)
                      .map((item) => (
                        <div key={item.task.id} className="rounded-2xl border border-gray-200 px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{item.task.name}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {item.listName} · slipped {item.varianceDays} day{item.varianceDays === 1 ? '' : 's'}
                          </p>
                        </div>
                      ))
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={buildContextMenuActions(contextMenu.task)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {dependencyContextMenu && (
        <ContextMenu
          x={dependencyContextMenu.x}
          y={dependencyContextMenu.y}
          actions={[
            {
              label: 'Edit dependency',
              icon: <Edit2 size={13} />,
              onClick: () => setDependencyEditor(dependencyContextMenu),
            },
            {
              label: 'Remove dependency',
              icon: <Trash2 size={13} />,
              onClick: () => void handleDependencyRemove(dependencyContextMenu),
              danger: true,
              divider: true,
            },
          ]}
          onClose={() => setDependencyContextMenu(null)}
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
          onDependencyAdded={async (data) => {
            syncSectionDependencyState(data);
            setActiveSavedViewId('');
            setShowDependencies(true);
          }}
          onDependencyRemoved={async (data) => {
            syncSectionDependencyState(data);
          }}
          onClose={() => setEditModal(null)}
          onSaved={async () => {
            await loadTasks();
            emitTasksMutated('gantt-view');
          }}
          onMoved={async () => {
            await loadTasks();
            emitTasksMutated('gantt-view');
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
          viewType="gantt"
          currentViewName={activeSavedViewName || 'Working view'}
          overviewContent={ganttCustomizeOverview}
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

export default GanttView;
