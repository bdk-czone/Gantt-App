import type { BuiltInColumnEditorType, CustomFieldType } from '../types';

export const COLUMN_TYPE_LABELS: Record<string, string> = {
  text: 'Free text',
  date: 'Date (calendar)',
  status_bar: 'Status bar',
  progress: 'Progress bar',
  start_date: 'Start date',
  end_date: 'End date',
  status: 'Status',
  number: 'Number',
  select: 'Dropdown',
  checkbox: 'Checkbox',
  url: 'Link',
};

export const CUSTOM_FIELD_TYPE_OPTIONS: Array<{ value: CustomFieldType; label: string }> = [
  { value: 'text', label: COLUMN_TYPE_LABELS.text },
  { value: 'date', label: COLUMN_TYPE_LABELS.date },
  { value: 'status_bar', label: COLUMN_TYPE_LABELS.status_bar },
  { value: 'progress', label: COLUMN_TYPE_LABELS.progress },
  { value: 'start_date', label: COLUMN_TYPE_LABELS.start_date },
  { value: 'end_date', label: COLUMN_TYPE_LABELS.end_date },
  { value: 'status', label: COLUMN_TYPE_LABELS.status },
  { value: 'number', label: COLUMN_TYPE_LABELS.number },
  { value: 'select', label: COLUMN_TYPE_LABELS.select },
  { value: 'checkbox', label: COLUMN_TYPE_LABELS.checkbox },
  { value: 'url', label: COLUMN_TYPE_LABELS.url },
];

export const BUILT_IN_COLUMN_TYPE_OPTIONS_BY_KEY: Record<string, Array<{ value: BuiltInColumnEditorType; label: string }>> = {
  name: [{ value: 'text', label: COLUMN_TYPE_LABELS.text }],
  status: [
    { value: 'status_bar', label: COLUMN_TYPE_LABELS.status_bar },
    { value: 'status', label: COLUMN_TYPE_LABELS.status },
  ],
  start_date: [
    { value: 'start_date', label: COLUMN_TYPE_LABELS.start_date },
    { value: 'date', label: COLUMN_TYPE_LABELS.date },
  ],
  end_date: [
    { value: 'end_date', label: COLUMN_TYPE_LABELS.end_date },
    { value: 'date', label: COLUMN_TYPE_LABELS.date },
  ],
  onboarding_completion: [
    { value: 'text', label: COLUMN_TYPE_LABELS.text },
    { value: 'date', label: COLUMN_TYPE_LABELS.date },
    { value: 'status_bar', label: COLUMN_TYPE_LABELS.status_bar },
    { value: 'progress', label: COLUMN_TYPE_LABELS.progress },
    { value: 'start_date', label: COLUMN_TYPE_LABELS.start_date },
    { value: 'end_date', label: COLUMN_TYPE_LABELS.end_date },
    { value: 'status', label: COLUMN_TYPE_LABELS.status },
  ],
  task_type: [{ value: 'text', label: COLUMN_TYPE_LABELS.text }],
  gantt_task: [{ value: 'text', label: COLUMN_TYPE_LABELS.text }],
};

export function getColumnTypeLabel(value: string | null | undefined) {
  if (!value) return 'Free text';
  return COLUMN_TYPE_LABELS[value] ?? value;
}
