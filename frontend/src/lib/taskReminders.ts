import type { CustomFieldDefinition, CustomFieldValue, ProjectSettings, Task } from '../types';
import { normalizeProjectSettings } from './projectSettings';

const REMINDER_FIELD_KEY = '__agenda_reminder_at';
const REMINDER_NOTE_FIELD_KEY = '__agenda_reminder_note';

const PRIORITY_RANKS: Array<{ token: string; rank: number }> = [
  { token: 'critical', rank: 0 },
  { token: 'urgent', rank: 1 },
  { token: 'highest', rank: 2 },
  { token: 'high', rank: 3 },
  { token: 'medium', rank: 10 },
  { token: 'normal', rank: 10 },
  { token: 'low', rank: 20 },
  { token: 'lowest', rank: 30 },
];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function normalizeTextValue(value: CustomFieldValue) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function findPriorityField(settings: ProjectSettings | null | undefined): CustomFieldDefinition | null {
  const fields = normalizeProjectSettings(settings).customFields;
  return (
    fields.find((field) => field.id.trim().toLowerCase() === 'priority') ??
    fields.find((field) => field.name.trim().toLowerCase() === 'priority') ??
    null
  );
}

export function getTaskReminderAt(task: Pick<Task, 'custom_fields'>): string | null {
  const value = task.custom_fields?.[REMINDER_FIELD_KEY];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getTaskReminderNote(task: Pick<Task, 'custom_fields'>): string | null {
  const value = task.custom_fields?.[REMINDER_NOTE_FIELD_KEY];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function setTaskReminderDetails(
  customFields: Record<string, CustomFieldValue> | null | undefined,
  details: { reminderAt: string | null; note: string | null }
) {
  const nextFields = { ...(customFields ?? {}) };
  if (details.reminderAt) {
    nextFields[REMINDER_FIELD_KEY] = details.reminderAt;
  } else {
    delete nextFields[REMINDER_FIELD_KEY];
  }
  if (details.reminderAt && details.note) {
    nextFields[REMINDER_NOTE_FIELD_KEY] = details.note;
  } else {
    delete nextFields[REMINDER_NOTE_FIELD_KEY];
  }
  return nextFields;
}

export function toReminderDateInputValue(reminderAt: string | null | undefined) {
  if (!reminderAt) return '';

  const parsed = new Date(reminderAt);
  if (Number.isNaN(parsed.getTime())) {
    return reminderAt.slice(0, 10);
  }

  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

export function toReminderTimeInputValue(reminderAt: string | null | undefined) {
  if (!reminderAt) return '';

  const parsed = new Date(reminderAt);
  if (Number.isNaN(parsed.getTime())) {
    return reminderAt.slice(11, 16);
  }

  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export function fromReminderInputValues(dateValue: string, timeValue: string) {
  const trimmedDate = dateValue.trim();
  const trimmedTime = timeValue.trim();
  if (!trimmedDate) return null;
  if (!trimmedTime) return null;

  const composite = `${trimmedDate}T${trimmedTime}`;
  const parsed = new Date(composite);
  if (Number.isNaN(parsed.getTime())) {
    return composite;
  }

  return parsed.toISOString();
}

export function getTaskPriorityLabel(task: Pick<Task, 'custom_fields'>, settings: ProjectSettings | null | undefined) {
  const priorityField = findPriorityField(settings);

  if (priorityField) {
    const configuredValue = normalizeTextValue(task.custom_fields?.[priorityField.id]);
    if (configuredValue) return configuredValue;
  }

  const directPriority = normalizeTextValue(task.custom_fields?.priority);
  if (directPriority) return directPriority;

  const fuzzyPriorityEntry = Object.entries(task.custom_fields ?? {}).find(([key, value]) => {
    if (!key.toLowerCase().includes('priority')) return false;
    return normalizeTextValue(value) !== null;
  });

  return fuzzyPriorityEntry ? normalizeTextValue(fuzzyPriorityEntry[1]) : null;
}

export function getPriorityRank(priorityLabel: string | null | undefined) {
  if (!priorityLabel) return 100;

  const normalized = priorityLabel.trim().toLowerCase();
  const matchedRank = PRIORITY_RANKS.find((entry) => normalized.includes(entry.token))?.rank;
  return matchedRank ?? 50;
}
