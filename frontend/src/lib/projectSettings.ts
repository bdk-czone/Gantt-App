import type {
  CustomFieldDefinition,
  ProjectCommunicationDirection,
  ProjectMailSettings,
  ProjectSettings,
  StatusOption,
  ViewPersistenceSettings,
} from '../types';

type StatusContext = ProjectSettings | StatusOption[] | null | undefined;

export const DEFAULT_STATUSES: StatusOption[] = [
  { value: 'NOT_STARTED', label: 'Not Started', color: '#E11D48' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: '#2563EB' },
  { value: 'INITIAL_CONTACT', label: 'Initial Contact', color: '#EC4899' },
  { value: 'COMPLETED', label: 'Completed', color: '#059669' },
];

export const DEFAULT_COLUMN_LABELS: Record<string, string> = {
  name: 'Name',
  status: 'Status',
  start_date: 'Start Date',
  end_date: 'End Date',
  onboarding_completion: 'Onboarding',
  task_type: 'Type',
  gantt_task: 'Task',
};

export const DEFAULT_COLUMN_ORDER = ['name', 'status', 'start_date', 'end_date', 'onboarding_completion', 'task_type'];
export const DEFAULT_BUILT_IN_COLUMN_TYPES = {
  name: 'text',
  status: 'status_bar',
  start_date: 'start_date',
  end_date: 'end_date',
  onboarding_completion: 'date',
  task_type: 'text',
  gantt_task: 'text',
} as const;

export const DEFAULT_VIEW_PERSISTENCE: ViewPersistenceSettings = {
  autosave: true,
  pinned: false,
  private: true,
};

export const DEFAULT_PROJECT_MAIL_SETTINGS: ProjectMailSettings = {
  customerName: '',
  customerEmails: [],
  customerKeywords: [],
  linkedTaskThreads: [],
  communicationLogEntries: [],
};

function resolveStatusOptions(settings: StatusContext): StatusOption[] {
  if (Array.isArray(settings)) {
    return settings.length > 0 ? settings : DEFAULT_STATUSES;
  }
  return normalizeProjectSettings(settings).statuses;
}

function buildStatusSignature(status: string, settings: StatusContext) {
  const option =
    resolveStatusOptions(settings).find((item) => item.value === status) || {
      value: status,
      label: status.replace(/_/g, ' '),
      color: '#64748B',
    };

  return `${option.value} ${option.label}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function resolveColumnOrder(
  columnOrder: string[] | null | undefined,
  customFields: CustomFieldDefinition[] = []
): string[] {
  const availableIds = [...DEFAULT_COLUMN_ORDER, ...customFields.map((field) => `custom:${field.id}`)];
  const requestedOrder = Array.isArray(columnOrder) ? columnOrder : [];
  const filtered = requestedOrder.filter((id, index) => availableIds.includes(id) && requestedOrder.indexOf(id) === index);
  return [...filtered, ...availableIds.filter((id) => !filtered.includes(id))];
}

export function orderByConfiguredIds<T extends { id: string }>(items: T[], order: string[]): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((left, right) => {
    const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return 0;
  });
}

export function normalizeProjectSettings(settings: ProjectSettings | null | undefined): ProjectSettings {
  const customFields = settings?.customFields ?? [];
  const legacyBuiltInColumnTypes = settings?.builtInColumnTypes ?? {};
  const rawMailTracking = settings?.mailTracking;
  const normalizedMailTracking = {
    customerName: typeof rawMailTracking?.customerName === 'string' ? rawMailTracking.customerName : '',
    customerEmails:
      Array.isArray(rawMailTracking?.customerEmails)
        ? rawMailTracking.customerEmails.map((value) => String(value).trim()).filter(Boolean)
        : [],
    customerKeywords:
      Array.isArray(rawMailTracking?.customerKeywords)
        ? rawMailTracking.customerKeywords.map((value) => String(value).trim()).filter(Boolean)
        : [],
    linkedTaskThreads: Array.isArray(rawMailTracking?.linkedTaskThreads)
      ? rawMailTracking.linkedTaskThreads
          .map((link) => ({
            id: String(link.id ?? ''),
            taskId: String(link.taskId ?? ''),
            taskName: String(link.taskName ?? ''),
            threadId: String(link.threadId ?? ''),
            subject: String(link.subject ?? ''),
            snippet: String(link.snippet ?? ''),
            fromName: link.fromName ? String(link.fromName) : null,
            fromEmail: link.fromEmail ? String(link.fromEmail) : null,
            latestMessageAt: String(link.latestMessageAt ?? ''),
            gmailUrl: String(link.gmailUrl ?? ''),
            linkedAt: String(link.linkedAt ?? ''),
          }))
          .filter((link) => link.id && link.taskId && link.threadId)
      : [],
    communicationLogEntries: Array.isArray(rawMailTracking?.communicationLogEntries)
      ? rawMailTracking.communicationLogEntries
          .map((entry) => ({
            id: String(entry.id ?? ''),
            occurredAt: String(entry.occurredAt ?? ''),
            subject: String(entry.subject ?? ''),
            summary: String(entry.summary ?? ''),
            fromName: entry.fromName ? String(entry.fromName) : null,
            fromEmail: entry.fromEmail ? String(entry.fromEmail) : null,
            direction:
              entry.direction === 'outgoing' || entry.direction === 'note' ? entry.direction : 'incoming',
            createdAt: String(entry.createdAt ?? ''),
          }))
          .map((entry) => ({
            ...entry,
            direction: entry.direction as ProjectCommunicationDirection,
          }))
          .filter((entry) => entry.id && entry.occurredAt && entry.subject && entry.summary)
      : [],
  };
  return {
    statuses:
      settings?.statuses && settings.statuses.length > 0
        ? settings.statuses
        : DEFAULT_STATUSES,
    customFields,
    columnLabels: {
      ...DEFAULT_COLUMN_LABELS,
      ...(settings?.columnLabels ?? {}),
    },
    columnOrder: resolveColumnOrder(settings?.columnOrder, customFields),
    savedViews: settings?.savedViews ?? [],
    hiddenBuiltInColumns: settings?.hiddenBuiltInColumns ?? [],
    builtInColumnTypes: {
      ...DEFAULT_BUILT_IN_COLUMN_TYPES,
      ...(legacyBuiltInColumnTypes.onboarding_completion === 'text'
        ? { onboarding_completion: 'text' as const }
        : legacyBuiltInColumnTypes.onboarding_completion === 'date'
          ? { onboarding_completion: 'date' as const }
          : {}),
      ...legacyBuiltInColumnTypes,
    },
    viewPersistence: {
      ...DEFAULT_VIEW_PERSISTENCE,
      ...(settings?.viewPersistence ?? {}),
    },
    notes: settings?.notes ?? '',
    mailTracking: {
      ...DEFAULT_PROJECT_MAIL_SETTINGS,
      ...normalizedMailTracking,
    },
  };
}

export function getStatusOption(status: string, settings: StatusContext): StatusOption {
  const statuses = resolveStatusOptions(settings);
  return (
    statuses.find((option) => option.value === status) || {
      value: status,
      label: status.replace(/_/g, ' '),
      color: '#64748B',
    }
  );
}

export function isCompletedStatus(status: string, settings: StatusContext): boolean {
  const signature = buildStatusSignature(status, settings);
  return ['complete', 'completed', 'done', 'closed', 'finished'].some((token) => signature.includes(token));
}

export function isNotStartedStatus(status: string, settings: StatusContext): boolean {
  if (isCompletedStatus(status, settings)) return false;
  const signature = buildStatusSignature(status, settings);
  return ['not started', 'todo', 'to do', 'backlog', 'queued', 'planned', 'pending', 'ready'].some((token) =>
    signature.includes(token)
  );
}

export function isInProgressStatus(status: string, settings: StatusContext): boolean {
  if (isCompletedStatus(status, settings)) return false;
  const signature = buildStatusSignature(status, settings);
  return ['in progress', 'progress', 'active', 'ongoing', 'working', 'doing', 'underway'].some((token) =>
    signature.includes(token)
  );
}

export function getCompletedStatusValue(settings: ProjectSettings | null | undefined) {
  const normalized = normalizeProjectSettings(settings);
  return normalized.statuses.find((option) => isCompletedStatus(option.value, normalized))?.value ?? 'COMPLETED';
}

export function getOpenStatusValue(settings: ProjectSettings | null | undefined, fallbackStatus = 'NOT_STARTED') {
  const normalized = normalizeProjectSettings(settings);
  return normalized.statuses.find((option) => !isCompletedStatus(option.value, normalized))?.value ?? fallbackStatus;
}

export function getCustomFieldDefinition(
  fieldId: string,
  settings: ProjectSettings | null | undefined
): CustomFieldDefinition | undefined {
  return normalizeProjectSettings(settings).customFields.find((field) => field.id === fieldId);
}

function normalizeLegacyDateParts(day: string, month: string, year: string) {
  const normalizedDay = day.padStart(2, '0');
  const normalizedMonth = month.padStart(2, '0');
  const normalizedYear = year.length === 2 ? `20${year}` : year;
  return `${normalizedYear}-${normalizedMonth}-${normalizedDay}`;
}

export function parseProjectDateValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    return normalizeLegacyDateParts(slashMatch[1], slashMatch[2], slashMatch[3]);
  }

  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dashMatch) {
    return normalizeLegacyDateParts(dashMatch[1], dashMatch[2], dashMatch[3]);
  }

  return null;
}

export function resolveProjectSchedule(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  settings: ProjectSettings | null | undefined
) {
  const normalized = normalizeProjectSettings(settings);
  return {
    startDate: startDate || parseProjectDateValue(normalized.columnLabels.start_date),
    endDate: endDate || parseProjectDateValue(normalized.columnLabels.end_date),
  };
}
