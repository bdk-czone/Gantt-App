import type { CustomFieldDefinition, PlannerColumnType } from '../types';

export type BuiltInColumnKey =
  | 'name'
  | 'status'
  | 'start_date'
  | 'end_date'
  | 'onboarding_completion'
  | 'task_type';

export interface ListColumnConfig {
  id: string;
  label: string;
  width: number;
  visible: boolean;
  kind: 'builtin' | 'custom';
  key?: BuiltInColumnKey;
  field?: CustomFieldDefinition;
  type?: PlannerColumnType;
}
