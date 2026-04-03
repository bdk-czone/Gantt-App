import {
  DEFAULT_BUILT_IN_COLUMN_TYPES,
  DEFAULT_COLUMN_LABELS,
  DEFAULT_COLUMN_ORDER,
  DEFAULT_STATUSES,
  DEFAULT_VIEW_PERSISTENCE,
  normalizeProjectSettings,
} from './projectSettings';
import type { ProjectSettings, ProjectTemplate, ProjectTemplateTask, Task, TaskDependency } from '../types';

const PROJECT_TEMPLATES_STORAGE_KEY = 'myproplanner:project-templates:v1';

function cloneSettings(settings: ProjectSettings | null | undefined): ProjectSettings {
  return JSON.parse(JSON.stringify(normalizeProjectSettings(settings)));
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function differenceInCalendarDays(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1000));
}

function addCalendarDays(start: Date, amount: number) {
  const next = new Date(start);
  next.setDate(next.getDate() + amount);
  return next;
}

function findEarliestTaskDate(tasks: Task[]): Date | null {
  let earliest: Date | null = null;
  const visit = (items: Task[]) => {
    for (const task of items) {
      const start = parseDateOnly(task.start_date);
      if (start && (!earliest || start.getTime() < earliest.getTime())) {
        earliest = start;
      }
      visit(task.children);
    }
  };
  visit(tasks);
  return earliest;
}

function mapTaskToTemplate(task: Task, anchorDate: Date | null): ProjectTemplateTask {
  const startDate = parseDateOnly(task.start_date);
  const endDate = parseDateOnly(task.end_date);

  return {
    id: task.id,
    name: task.name,
    status: task.status,
    task_type: task.task_type,
    color: task.color,
    icon: task.icon,
    custom_fields: task.custom_fields ?? {},
    startOffsetDays: anchorDate && startDate ? differenceInCalendarDays(anchorDate, startDate) : null,
    durationDays: startDate && endDate ? Math.max(differenceInCalendarDays(startDate, endDate), 0) : null,
    children: task.children.map((child) => mapTaskToTemplate(child, anchorDate)),
  };
}

export function getAllProjectTemplates(): ProjectTemplate[] {
  const builtIns = BUILT_IN_PROJECT_TEMPLATES.map((template) => ({
    ...template,
    settings: cloneSettings(template.settings),
  }));

  try {
    const raw = localStorage.getItem(PROJECT_TEMPLATES_STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as ProjectTemplate[]) : [];
    return [...builtIns, ...stored.map((template) => ({ ...template, settings: cloneSettings(template.settings) }))];
  } catch {
    return builtIns;
  }
}

export function saveProjectTemplate(template: ProjectTemplate) {
  const nextTemplate = {
    ...template,
    isBuiltIn: false,
    updatedAt: new Date().toISOString(),
    settings: cloneSettings(template.settings),
  };

  const templates = getAllProjectTemplates().filter((item) => !item.isBuiltIn && item.id !== nextTemplate.id);
  localStorage.setItem(PROJECT_TEMPLATES_STORAGE_KEY, JSON.stringify([...templates, nextTemplate]));
  return nextTemplate;
}

export function buildProjectTemplateFromProject(params: {
  projectName: string;
  color: string | null;
  icon: string | null;
  projectStartDate?: string | null;
  settings: ProjectSettings | null | undefined;
  tasks: Task[];
  dependencies: TaskDependency[];
  description?: string;
}): ProjectTemplate {
  const anchorDate = parseDateOnly(params.projectStartDate) ?? findEarliestTaskDate(params.tasks);

  return {
    id: crypto.randomUUID(),
    name: params.projectName,
    description: params.description?.trim() || `Reusable template based on ${params.projectName}.`,
    color: params.color,
    icon: params.icon,
    settings: cloneSettings(params.settings),
    starterTasks: params.tasks.map((task) => mapTaskToTemplate(task, anchorDate)),
    dependencies: params.dependencies.map((dependency) => ({
      predecessorTemplateTaskId: dependency.predecessor_id,
      successorTemplateTaskId: dependency.successor_id,
      dependency_type: dependency.dependency_type,
    })),
    sourceProjectName: params.projectName,
    updatedAt: new Date().toISOString(),
  };
}

export function resolveTemplateTaskDates(task: ProjectTemplateTask, projectStartDate: string | null | undefined) {
  const anchorDate = parseDateOnly(projectStartDate);
  if (!anchorDate || task.startOffsetDays === null) {
    return {
      start_date: null,
      end_date: null,
    };
  }

  const start = addCalendarDays(anchorDate, task.startOffsetDays);
  const end =
    task.durationDays === null
      ? start
      : addCalendarDays(start, Math.max(task.durationDays, 0));

  return {
    start_date: formatDateOnly(start),
    end_date: formatDateOnly(end),
  };
}

const BUILT_IN_PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'builtin-gcp-saas',
    name: 'GCP SaaS Marketplace Listing',
    description: 'End-to-end GCP Marketplace listing process: Partner Advantage registration, project access, Solution Validation, Terraform, Technical Integration, Producer Portal, and the full listing flow.',
    color: '#0891B2',
    icon: 'cloud',
    settings: {
      statuses: [
        { value: 'NOT_STARTED', label: 'Not Started', color: '#64748B' },
        { value: 'IN_PROGRESS', label: 'In Progress', color: '#2563EB' },
        { value: 'WAITING_ON_GOOGLE', label: 'Waiting on Google', color: '#F59E0B' },
        { value: 'SUBMITTED', label: 'Submitted', color: '#7C3AED' },
        { value: 'COMPLETED', label: 'Completed', color: '#059669' },
      ],
      customFields: [
        { id: 'owner', name: 'Owner', type: 'text' },
      ],
      columnLabels: DEFAULT_COLUMN_LABELS,
      columnOrder: [...DEFAULT_COLUMN_ORDER, 'custom:owner'],
      savedViews: [
        {
          id: 'template-gcp-saas-board',
          name: 'Active tasks',
          searchQuery: '',
          statusFilters: ['NOT_STARTED', 'IN_PROGRESS', 'WAITING_ON_GOOGLE', 'SUBMITTED'],
          autosave: true,
          pinned: true,
          private: false,
          hideCompleted: true,
          focusMode: 'all',
        },
      ],
      hiddenBuiltInColumns: [],
      builtInColumnTypes: DEFAULT_BUILT_IN_COLUMN_TYPES,
      viewPersistence: DEFAULT_VIEW_PERSISTENCE,
    },
    starterTasks: [
      {
        id: 'gcp-partner-advantage-mva',
        name: 'Partner Advantage & MVA registration',
        status: 'NOT_STARTED',
        task_type: 'milestone',
        color: null,
        icon: 'shield-check',
        custom_fields: {},
        startOffsetDays: 0,
        durationDays: 0,
        children: [],
      },
      {
        id: 'gcp-project-access',
        name: 'Get access to customer GCP project',
        status: 'NOT_STARTED',
        task_type: 'task',
        color: null,
        icon: 'key',
        custom_fields: {},
        startOffsetDays: 1,
        durationDays: 2,
        children: [],
      },
      {
        id: 'gcp-solution-validation-form',
        name: 'Submit Solution Validation form',
        status: 'NOT_STARTED',
        task_type: 'task',
        color: null,
        icon: 'clipboard-list',
        custom_fields: {},
        startOffsetDays: 3,
        durationDays: 0,
        children: [],
      },
      {
        id: 'gcp-terraform-deployment',
        name: 'Deploy Terraform',
        status: 'NOT_STARTED',
        task_type: 'task',
        color: null,
        icon: 'code-2',
        custom_fields: {},
        startOffsetDays: 3,
        durationDays: 3,
        children: [],
      },
      {
        id: 'gcp-technical-integration-form',
        name: 'Submit Technical Integration form',
        status: 'NOT_STARTED',
        task_type: 'task',
        color: null,
        icon: 'plug-zap',
        custom_fields: {},
        startOffsetDays: 7,
        durationDays: 0,
        children: [],
      },
      {
        id: 'gcp-support-case-producer-portal',
        name: 'Open Google support case – Producer Portal approval',
        status: 'NOT_STARTED',
        task_type: 'task',
        color: null,
        icon: 'headphones',
        custom_fields: {},
        startOffsetDays: 8,
        durationDays: 0,
        children: [],
      },
      {
        id: 'gcp-producer-portal-wait',
        name: 'Wait for Producer Portal to open',
        status: 'NOT_STARTED',
        task_type: 'task',
        color: null,
        icon: 'clock',
        custom_fields: {},
        startOffsetDays: 9,
        durationDays: 7,
        children: [],
      },
      {
        id: 'gcp-listing-process',
        name: 'Listing process',
        status: 'NOT_STARTED',
        task_type: 'task',
        color: null,
        icon: 'store',
        custom_fields: {},
        startOffsetDays: 16,
        durationDays: 8,
        children: [
          {
            id: 'gcp-listing-product-details',
            name: 'Complete Product Details',
            status: 'NOT_STARTED',
            task_type: 'task',
            color: null,
            icon: 'file-text',
            custom_fields: {},
            startOffsetDays: 16,
            durationDays: 3,
            children: [],
          },
          {
            id: 'gcp-listing-pricing',
            name: 'Complete Pricing',
            status: 'NOT_STARTED',
            task_type: 'task',
            color: null,
            icon: 'tag',
            custom_fields: {},
            startOffsetDays: 19,
            durationDays: 2,
            children: [],
          },
          {
            id: 'gcp-listing-tech-integration',
            name: 'Complete Technical Integration in Producer Portal',
            status: 'NOT_STARTED',
            task_type: 'task',
            color: null,
            icon: 'settings-2',
            custom_fields: {},
            startOffsetDays: 21,
            durationDays: 3,
            children: [],
          },
        ],
      },
    ],
    dependencies: [
      { predecessorTemplateTaskId: 'gcp-partner-advantage-mva', successorTemplateTaskId: 'gcp-project-access', dependency_type: 'FS' },
      { predecessorTemplateTaskId: 'gcp-project-access', successorTemplateTaskId: 'gcp-solution-validation-form', dependency_type: 'FS' },
      { predecessorTemplateTaskId: 'gcp-project-access', successorTemplateTaskId: 'gcp-terraform-deployment', dependency_type: 'FS' },
      { predecessorTemplateTaskId: 'gcp-solution-validation-form', successorTemplateTaskId: 'gcp-technical-integration-form', dependency_type: 'FS' },
      { predecessorTemplateTaskId: 'gcp-terraform-deployment', successorTemplateTaskId: 'gcp-technical-integration-form', dependency_type: 'FS' },
      { predecessorTemplateTaskId: 'gcp-technical-integration-form', successorTemplateTaskId: 'gcp-support-case-producer-portal', dependency_type: 'FS' },
      { predecessorTemplateTaskId: 'gcp-support-case-producer-portal', successorTemplateTaskId: 'gcp-producer-portal-wait', dependency_type: 'FS' },
      { predecessorTemplateTaskId: 'gcp-producer-portal-wait', successorTemplateTaskId: 'gcp-listing-process', dependency_type: 'FS' },
      { predecessorTemplateTaskId: 'gcp-listing-product-details', successorTemplateTaskId: 'gcp-listing-pricing', dependency_type: 'FS' },
      { predecessorTemplateTaskId: 'gcp-listing-pricing', successorTemplateTaskId: 'gcp-listing-tech-integration', dependency_type: 'FS' },
    ],
    isBuiltIn: true,
    updatedAt: '2026-04-03T00:00:00.000Z',
  },
  {
    id: 'builtin-client-onboarding',
    name: 'Client onboarding',
    description: 'A repeatable kickoff-to-go-live setup with statuses, fields, saved views, and starter task links.',
    color: '#0F766E',
    icon: 'rocket',
    settings: {
      statuses: [
        { value: 'PLANNED', label: 'Planned', color: '#475569' },
        { value: 'READY', label: 'Ready', color: '#2563EB' },
        { value: 'WAITING_ON_CLIENT', label: 'Waiting on Client', color: '#F59E0B' },
        { value: 'IN_PROGRESS', label: 'In Progress', color: '#0F766E' },
        { value: 'DONE', label: 'Done', color: '#059669' },
      ],
      customFields: [
        { id: 'owner', name: 'Owner', type: 'text' },
        { id: 'priority', name: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'] },
        { id: 'customer_health', name: 'Customer health', type: 'select', options: ['Green', 'Amber', 'Red'] },
      ],
      columnLabels: {
        ...DEFAULT_COLUMN_LABELS,
        onboarding_completion: 'Checkpoint',
      },
      columnOrder: [...DEFAULT_COLUMN_ORDER, 'custom:owner', 'custom:priority', 'custom:customer_health'],
      savedViews: [
        {
          id: 'template-onboarding-list',
          name: 'Delivery board',
          searchQuery: '',
          statusFilters: ['READY', 'IN_PROGRESS', 'WAITING_ON_CLIENT'],
          autosave: true,
          pinned: true,
          private: false,
          hideCompleted: true,
          focusMode: 'all',
        },
      ],
      hiddenBuiltInColumns: [],
      builtInColumnTypes: DEFAULT_BUILT_IN_COLUMN_TYPES,
      viewPersistence: DEFAULT_VIEW_PERSISTENCE,
    },
    starterTasks: [
      {
        id: 'kickoff',
        name: 'Kickoff',
        status: 'PLANNED',
        task_type: 'milestone',
        color: null,
        icon: 'flag',
        custom_fields: {},
        startOffsetDays: 0,
        durationDays: 0,
        children: [],
      },
      {
        id: 'discovery',
        name: 'Discovery & requirements',
        status: 'READY',
        task_type: 'task',
        color: null,
        icon: 'target',
        custom_fields: {},
        startOffsetDays: 1,
        durationDays: 4,
        children: [],
      },
      {
        id: 'configure',
        name: 'Configure workspace',
        status: 'READY',
        task_type: 'task',
        color: null,
        icon: 'workflow',
        custom_fields: {},
        startOffsetDays: 5,
        durationDays: 3,
        children: [],
      },
      {
        id: 'launch',
        name: 'Go live',
        status: 'PLANNED',
        task_type: 'milestone',
        color: null,
        icon: 'rocket',
        custom_fields: {},
        startOffsetDays: 9,
        durationDays: 0,
        children: [],
      },
    ],
    dependencies: [
      { predecessorTemplateTaskId: 'kickoff', successorTemplateTaskId: 'discovery', dependency_type: 'FS' },
      { predecessorTemplateTaskId: 'discovery', successorTemplateTaskId: 'configure', dependency_type: 'FS' },
      { predecessorTemplateTaskId: 'configure', successorTemplateTaskId: 'launch', dependency_type: 'FS' },
    ],
    isBuiltIn: true,
    updatedAt: '2026-04-02T00:00:00.000Z',
  },
  {
    id: 'builtin-delivery-rollout',
    name: 'Delivery rollout',
    description: 'A compact implementation template with defaults for execution, baselines, and dependency-driven scheduling.',
    color: '#2563EB',
    icon: 'folder-kanban',
    settings: {
      statuses: [
        { value: 'NOT_STARTED', label: 'Not Started', color: '#64748B' },
        { value: 'IN_PROGRESS', label: 'In Progress', color: '#2563EB' },
        { value: 'BLOCKED', label: 'Blocked', color: '#DC2626' },
        { value: 'REVIEW', label: 'Review', color: '#F59E0B' },
        { value: 'COMPLETED', label: 'Completed', color: '#059669' },
      ],
      customFields: [
        { id: 'stream', name: 'Workstream', type: 'select', options: ['Planning', 'Build', 'QA', 'Launch'] },
        { id: 'effort', name: 'Effort', type: 'number' },
      ],
      columnLabels: DEFAULT_COLUMN_LABELS,
      columnOrder: [...DEFAULT_COLUMN_ORDER, 'custom:stream', 'custom:effort'],
      savedViews: [
        {
          id: 'template-rollout-gantt',
          name: 'Critical path',
          searchQuery: '',
          statusFilters: [],
          autosave: true,
          pinned: true,
          private: false,
          ganttShowDependencies: true,
          ganttShowBaselines: true,
          ganttAutoShiftDependencies: true,
          ganttCriticalOnly: true,
          ganttZoom: 'weeks',
        },
      ],
      hiddenBuiltInColumns: [],
      builtInColumnTypes: DEFAULT_BUILT_IN_COLUMN_TYPES,
      viewPersistence: {
        autosave: true,
        pinned: true,
        private: false,
      },
    },
    starterTasks: [
      {
        id: 'plan',
        name: 'Plan scope',
        status: 'NOT_STARTED',
        task_type: 'task',
        color: null,
        icon: 'briefcase',
        custom_fields: { stream: 'Planning' },
        startOffsetDays: 0,
        durationDays: 3,
        children: [],
      },
      {
        id: 'build',
        name: 'Build workstream',
        status: 'NOT_STARTED',
        task_type: 'task',
        color: null,
        icon: 'workflow',
        custom_fields: { stream: 'Build' },
        startOffsetDays: 3,
        durationDays: 8,
        children: [],
      },
      {
        id: 'qa',
        name: 'QA & validation',
        status: 'NOT_STARTED',
        task_type: 'task',
        color: null,
        icon: 'flask-conical',
        custom_fields: { stream: 'QA' },
        startOffsetDays: 11,
        durationDays: 3,
        children: [],
      },
      {
        id: 'release',
        name: 'Release',
        status: 'NOT_STARTED',
        task_type: 'milestone',
        color: null,
        icon: 'flag',
        custom_fields: { stream: 'Launch' },
        startOffsetDays: 14,
        durationDays: 0,
        children: [],
      },
    ],
    dependencies: [
      { predecessorTemplateTaskId: 'plan', successorTemplateTaskId: 'build', dependency_type: 'FS' },
      { predecessorTemplateTaskId: 'build', successorTemplateTaskId: 'qa', dependency_type: 'FS' },
      { predecessorTemplateTaskId: 'qa', successorTemplateTaskId: 'release', dependency_type: 'FS' },
    ],
    isBuiltIn: true,
    updatedAt: '2026-04-02T00:00:00.000Z',
  },
];
