import type {
  CustomFieldValue,
  ProjectSettings,
  Workspace,
  TaskTreeResponse,
  SpaceListsResponse,
  Task,
  TaskDependency,
  List as ProjectList,
  SelectedListTarget,
  SharedWorkloadResponse,
  WorkloadShare,
  ProjectResource,
} from './types';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function normalizeDateOnly(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : trimmed;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  return String(value);
}

function normalizeList(list: Partial<ProjectList> | null | undefined): ProjectList {
  return {
    id: list?.id ?? '',
    space_id: list?.space_id ?? '',
    folder_id: list?.folder_id ?? null,
    name: list?.name ?? '',
    color: list?.color ?? null,
    icon: list?.icon ?? null,
    start_date: normalizeDateOnly(list?.start_date),
    end_date: normalizeDateOnly(list?.end_date),
    baseline_start_date: normalizeDateOnly(list?.baseline_start_date),
    baseline_end_date: normalizeDateOnly(list?.baseline_end_date),
    settings: list?.settings ?? null,
    folder_name: list?.folder_name ?? null,
    created_at: list?.created_at ?? '',
  };
}

function normalizeTask(task: Partial<Task> | null | undefined): Task {
  return {
    id: task?.id ?? '',
    list_id: task?.list_id ?? '',
    parent_id: task?.parent_id ?? null,
    name: task?.name ?? '',
    status: task?.status ?? 'NOT_STARTED',
    task_type: task?.task_type ?? null,
    color: task?.color ?? null,
    icon: task?.icon ?? null,
    custom_fields: (task?.custom_fields ?? {}) as Record<string, CustomFieldValue>,
    start_date: normalizeDateOnly(task?.start_date),
    end_date: normalizeDateOnly(task?.end_date),
    baseline_start_date: normalizeDateOnly(task?.baseline_start_date),
    baseline_end_date: normalizeDateOnly(task?.baseline_end_date),
    onboarding_completion: normalizeDateOnly(task?.onboarding_completion),
    position: typeof task?.position === 'number' ? task.position : 0,
    created_at: task?.created_at ?? '',
    updated_at: task?.updated_at ?? '',
    depth: typeof task?.depth === 'number' ? task.depth : 0,
    children: Array.isArray(task?.children) ? task!.children.map((child) => normalizeTask(child)) : [],
  };
}

function normalizeTaskTreeResponse(response: TaskTreeResponse): TaskTreeResponse {
  const uniqueDependencies = Array.from(
    new Map(response.dependencies.map((dependency) => [dependency.id, dependency])).values()
  );

  return {
    tasks: response.tasks.map((task) => normalizeTask(task)),
    dependencies: uniqueDependencies,
  };
}

function normalizeSpaceListsResponse(response: SpaceListsResponse): SpaceListsResponse {
  return {
    ...response,
    lists: response.lists.map((list) => normalizeList(list)),
  };
}

function normalizeSelectedListTarget(target: Partial<SelectedListTarget> | null | undefined): SelectedListTarget {
  return {
    listId: target?.listId ?? '',
    listName: target?.listName ?? '',
    listColor: target?.listColor ?? null,
    listIcon: target?.listIcon ?? null,
    folderId: target?.folderId ?? null,
    startDate: normalizeDateOnly(target?.startDate),
    endDate: normalizeDateOnly(target?.endDate),
    baselineStartDate: normalizeDateOnly(target?.baselineStartDate),
    baselineEndDate: normalizeDateOnly(target?.baselineEndDate),
    listSettings: target?.listSettings ?? null,
    spaceId: target?.spaceId ?? '',
    spaceName: target?.spaceName ?? '',
    workspaceId: target?.workspaceId ?? '',
    workspaceName: target?.workspaceName ?? '',
    createdAt: target?.createdAt ?? '',
  };
}

function normalizeSharedWorkloadResponse(response: SharedWorkloadResponse): SharedWorkloadResponse {
  return {
    share: {
      id: response.share.id,
      token: response.share.token,
      name: response.share.name,
      createdAt: response.share.createdAt,
      updatedAt: response.share.updatedAt,
    },
    sections: response.sections.map((section) => ({
      target: normalizeSelectedListTarget(section.target),
      tasks: section.tasks.map((task) => normalizeTask(task)),
      dependencies: section.dependencies,
    })),
    refreshedAt: response.refreshedAt,
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    cache: options?.method && options.method !== 'GET' ? options.cache : 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export interface CommunicationAIStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
}

export interface CommunicationAIDraft {
  occurredAt: string;
  direction: 'incoming' | 'outgoing' | 'note' | 'unknown';
  fromName: string;
  fromEmail: string;
  subject: string;
  summary: string;
}

// Workspaces
export const getWorkspaces = (): Promise<Workspace[]> =>
  request<Workspace[]>('/api/workspaces');

export const createWorkspace = (name: string): Promise<Workspace> =>
  request<Workspace>('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

// Spaces
export const getSpaceLists = (spaceId: string): Promise<SpaceListsResponse> =>
  request<SpaceListsResponse>(`/api/spaces/${spaceId}/lists`).then((response) => normalizeSpaceListsResponse(response));

export const createSpace = (workspaceId: string, name: string) =>
  request(`/api/spaces`, {
    method: 'POST',
    body: JSON.stringify({ workspace_id: workspaceId, name }),
  });

// Lists
export const createList = (data: {
  space_id: string;
  folder_id?: string | null;
  name: string;
  color?: string | null;
  icon?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  baseline_start_date?: string | null;
  baseline_end_date?: string | null;
  settings?: ProjectSettings | null;
}) =>
  request<ProjectList>(`/api/lists`, {
    method: 'POST',
    body: JSON.stringify(data),
  }).then((list) => normalizeList(list));

export const getList = (id: string): Promise<ProjectList> =>
  request<ProjectList>(`/api/lists/${id}`).then((list) => normalizeList(list));

export const launchOutlookDesktopSearch = (query: string): Promise<{ status: string }> =>
  request<{ status: string }>('/api/outlook/launch-search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });

export const getCommunicationAIStatus = (): Promise<CommunicationAIStatus> =>
  request<CommunicationAIStatus>('/api/ai/status');

export const generateCommunicationAIDraft = (data: {
  projectName?: string;
  customerName?: string;
  referenceEmails?: string[];
  referenceKeywords?: string[];
  rawText?: string;
  imageDataUrl?: string;
}): Promise<CommunicationAIDraft> =>
  request<{ draft: CommunicationAIDraft }>('/api/ai/communication-draft', {
    method: 'POST',
    body: JSON.stringify(data),
  }).then((response) => response.draft);

export const extractCommunicationScreenshotText = (imageDataUrl: string): Promise<string> =>
  request<{ text: string }>('/api/ai/communication-screenshot-ocr', {
    method: 'POST',
    body: JSON.stringify({ imageDataUrl }),
  }).then((response) => response.text);

// Tasks
export const getTaskTree = async (listId: string): Promise<TaskTreeResponse> =>
  normalizeTaskTreeResponse(await request<TaskTreeResponse>(`/api/tasks/lists/${listId}/tasks/tree`));

export const getTask = async (id: string): Promise<Task> =>
  normalizeTask(await request<Task>(`/api/tasks/${id}`));

export const createTask = (data: {
  list_id: string;
  parent_id?: string | null;
  name: string;
  status?: string;
  task_type?: string;
  color?: string | null;
  icon?: string | null;
  custom_fields?: Record<string, CustomFieldValue>;
  start_date?: string | null;
  end_date?: string | null;
  baseline_start_date?: string | null;
  baseline_end_date?: string | null;
  onboarding_completion?: string | null;
  position?: number;
}): Promise<Task> =>
  request<Task>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  }).then((task) => normalizeTask(task));

export const updateTask = (
  id: string,
  data: Partial<{
    name: string;
    status: string;
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
    parent_id: string | null;
    list_id: string;
  }>
): Promise<Task> =>
  request<Task>(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }).then((task) => normalizeTask(task));

export const deleteTask = (id: string): Promise<void> =>
  request<void>(`/api/tasks/${id}`, { method: 'DELETE' });

export const addDependency = (
  successorId: string,
  predecessorId: string,
  dependencyType = 'FS'
): Promise<TaskDependency> =>
  request<TaskDependency>(`/api/tasks/${successorId}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ predecessor_id: predecessorId, dependency_type: dependencyType }),
  });

export const removeDependency = (taskId: string, depId: string): Promise<void> =>
  request<void>(`/api/tasks/${taskId}/dependencies/${depId}`, { method: 'DELETE' });

export interface FlatList {
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

export async function getAllListsFlat(): Promise<FlatList[]> {
  const workspaces = await getWorkspaces();
  const listGroups = await Promise.all(
    workspaces.flatMap((ws) =>
      ws.spaces.map(async (space) => {
        const data = await getSpaceLists(space.id);
        return data.lists.map((list) => ({
          listId: list.id,
          listName: list.name,
          listColor: list.color,
          listIcon: list.icon,
          folderId: list.folder_id,
          startDate: list.start_date,
          endDate: list.end_date,
          baselineStartDate: list.baseline_start_date,
          baselineEndDate: list.baseline_end_date,
          listSettings: list.settings,
          spaceId: space.id,
          spaceName: space.name,
          workspaceId: ws.id,
          workspaceName: ws.name,
          createdAt: list.created_at,
        }));
      })
    )
  );

  return listGroups.flat();
}

export const renameWorkspace = (id: string, name: string) =>
  request(`/api/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });

export const renameSpace = (id: string, name: string) =>
  request(`/api/spaces/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });

export const renameList = (id: string, name: string) =>
  request(`/api/lists/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });

export const updateList = (
  id: string,
  data: Partial<{
    name: string;
    space_id: string;
    folder_id: string | null;
    color: string | null;
    icon: string | null;
    start_date: string | null;
    end_date: string | null;
    baseline_start_date: string | null;
    baseline_end_date: string | null;
    settings: ProjectSettings | null;
  }>
) =>
  request<ProjectList>(`/api/lists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }).then((list) => normalizeList(list));

export const deleteList = (id: string) =>
  request<void>(`/api/lists/${id}`, { method: 'DELETE' });

export const createWorkloadShare = (params: {
  listIds: string[];
  name?: string;
}): Promise<WorkloadShare> =>
  request<{
    id: string;
    token: string;
    name: string;
    created_at: string;
    updated_at: string;
  }>('/api/shares/workload', {
    method: 'POST',
    body: JSON.stringify({
      list_ids: params.listIds,
      name: params.name,
    }),
  }).then((response) => ({
    id: response.id,
    token: response.token,
    name: response.name,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
  }));

export const getSharedWorkload = (token: string): Promise<SharedWorkloadResponse> =>
  request<SharedWorkloadResponse>(`/api/shares/public/${token}`).then((response) => normalizeSharedWorkloadResponse(response));

// Resources
export const getResources = (listId: string): Promise<ProjectResource[]> =>
  request<ProjectResource[]>(`/api/lists/${listId}/resources`);

export const addLinkResource = (listId: string, label: string, url: string): Promise<ProjectResource> =>
  request<ProjectResource>(`/api/lists/${listId}/resources`, {
    method: 'POST',
    body: JSON.stringify({ label, url }),
  });

export const uploadFileResource = (listId: string, file: File, label?: string): Promise<ProjectResource> => {
  const formData = new FormData();
  formData.append('file', file);
  if (label) formData.append('label', label);
  return fetch(`${API_URL}/api/lists/${listId}/resources/upload`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  }).then(async (res) => {
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error((error as { error: string }).error || `HTTP ${res.status}`);
    }
    return res.json() as Promise<ProjectResource>;
  });
};

export const deleteResource = (id: string): Promise<void> =>
  request<void>(`/api/resources/${id}`, { method: 'DELETE' });

export const getResourceDownloadUrl = (id: string): string =>
  `${API_URL}/api/resources/${id}/download`;

export const getResourceViewUrl = (id: string): string =>
  `${API_URL}/api/resources/${id}/view`;

export const fetchDocxPreview = (id: string): Promise<{ html: string }> =>
  request<{ html: string }>(`/api/resources/${id}/preview`);
