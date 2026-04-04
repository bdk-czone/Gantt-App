export type TaskStatus = string;
export type GanttZoomLevel = 'days' | 'weeks' | 'months';
export type TaskFocusMode = 'all' | 'tasks' | 'milestones' | 'projects';
export type PlannerColumnType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'url'
  | 'progress'
  | 'status'
  | 'status_bar'
  | 'start_date'
  | 'end_date';
export type BuiltInColumnEditorType = PlannerColumnType;

export type CustomFieldType = PlannerColumnType;
export type CustomFieldValue = string | number | boolean | null;

export interface StatusOption {
  value: string;
  label: string;
  color: string;
}

export interface CustomFieldDefinition {
  id: string;
  name: string;
  type: CustomFieldType;
  options?: string[];
}

export interface SavedView {
  id: string;
  name: string;
  searchQuery: string;
  statusFilters: string[];
  autosave?: boolean;
  pinned?: boolean;
  private?: boolean;
  hideCompleted?: boolean;
  focusMode?: TaskFocusMode;
  ganttZoom?: GanttZoomLevel;
  columnVisibility?: Record<string, boolean>;
  columnWidths?: Record<string, number>;
  columnOrder?: string[];
  ganttLabelWidth?: number;
  ganttShowDependencies?: boolean;
  ganttShowBaselines?: boolean;
  ganttAutoShiftDependencies?: boolean;
  ganttCriticalOnly?: boolean;
  ganttFontSize?: number;
  ganttZoomScale?: number;
}

export interface ViewPersistenceSettings {
  autosave: boolean;
  pinned: boolean;
  private: boolean;
}

export interface ProjectMailLink {
  id: string;
  taskId: string;
  taskName: string;
  threadId: string;
  subject: string;
  snippet: string;
  fromName: string | null;
  fromEmail: string | null;
  latestMessageAt: string;
  gmailUrl: string;
  linkedAt: string;
}

export type ProjectCommunicationDirection = 'incoming' | 'outgoing' | 'note';

export interface ProjectCommunicationEntry {
  id: string;
  occurredAt: string;
  subject: string;
  summary: string;
  fromName: string | null;
  fromEmail: string | null;
  direction: ProjectCommunicationDirection;
  createdAt: string;
}

export interface ProjectMailSettings {
  customerName?: string;
  customerEmails?: string[];
  customerKeywords?: string[];
  linkedTaskThreads?: ProjectMailLink[];
  communicationLogEntries?: ProjectCommunicationEntry[];
}

export interface ProjectSettings {
  statuses: StatusOption[];
  customFields: CustomFieldDefinition[];
  columnLabels: Record<string, string>;
  columnOrder: string[];
  savedViews: SavedView[];
  hiddenBuiltInColumns?: string[];
  builtInColumnTypes?: Partial<Record<string, BuiltInColumnEditorType>>;
  viewPersistence?: Partial<ViewPersistenceSettings>;
  notes?: string;
  mailTracking?: Partial<ProjectMailSettings>;
}

export interface Task {
  id: string;
  list_id: string;
  parent_id: string | null;
  name: string;
  status: TaskStatus;
  task_type: string | null;
  color: string | null;
  icon: string | null;
  custom_fields: Record<string, CustomFieldValue>;
  start_date: string | null;
  end_date: string | null;
  baseline_start_date: string | null;
  baseline_end_date: string | null;
  onboarding_completion: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  depth: number;
  children: Task[];
}

export interface TaskDependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: string;
}

export interface ProjectTemplateTask {
  id: string;
  name: string;
  status: string;
  task_type: string | null;
  color: string | null;
  icon: string | null;
  custom_fields: Record<string, CustomFieldValue>;
  startOffsetDays: number | null;
  durationDays: number | null;
  children: ProjectTemplateTask[];
}

export interface ProjectTemplateDependency {
  predecessorTemplateTaskId: string;
  successorTemplateTaskId: string;
  dependency_type: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  color: string | null;
  icon: string | null;
  settings: ProjectSettings;
  starterTasks: ProjectTemplateTask[];
  dependencies: ProjectTemplateDependency[];
  sourceProjectName?: string | null;
  isBuiltIn?: boolean;
  updatedAt: string;
}

export interface List {
  id: string;
  space_id: string;
  folder_id: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  start_date: string | null;
  end_date: string | null;
  baseline_start_date: string | null;
  baseline_end_date: string | null;
  settings: ProjectSettings | null;
  folder_name: string | null;
  created_at: string;
}

export interface Folder {
  id: string;
  space_id: string;
  name: string;
  created_at: string;
}

export interface Space {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
  spaces: Space[];
}

export interface TaskTreeResponse {
  tasks: Task[];
  dependencies: TaskDependency[];
}

export interface SpaceListsResponse {
  lists: List[];
  folders: Folder[];
}

export interface SelectedListTarget {
  listId: string;
  listName: string;
  listColor: string | null;
  listIcon: string | null;
  folderId: string | null;
  startDate: string | null;
  endDate: string | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  listSettings: ProjectSettings | null;
  spaceId: string;
  spaceName: string;
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
}

export interface WorkloadShare {
  id: string;
  token: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SharedWorkloadSection {
  target: SelectedListTarget;
  tasks: Task[];
  dependencies: TaskDependency[];
}

export interface SharedWorkloadResponse {
  share: WorkloadShare;
  sections: SharedWorkloadSection[];
  refreshedAt: string;
}

export interface ProjectResource {
  id: string;
  list_id: string;
  type: 'link' | 'file';
  label: string;
  url: string | null;
  file_name: string | null;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}
