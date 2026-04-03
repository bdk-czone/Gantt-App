import React from 'react';
import {
  Briefcase,
  CircleDot,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Layers,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import type { List as ProjectList, SelectedListTarget, Space, Task, Workspace } from '../types';
import {
  createSpace,
  createWorkspace,
  deleteList,
  getSpaceLists,
  getTaskTree,
  getWorkspaces,
  renameSpace,
  renameWorkspace,
} from '../api';
import { EntityIcon, getAppearanceColor } from '../lib/appearance';
import CreateProjectModal from './CreateProjectModal';
import ProjectEditModal from './ProjectEditModal';
import ResourcesPanel from './ResourcesPanel';

interface SidebarProps {
  onSelectionChange: (selection: {
    selectedLists: SelectedListTarget[];
    selectedListIds: string[];
    selectedWorkspaceIds: string[];
  }) => void;
  defaultTaskTreeExpanded: boolean;
}

interface SpaceWithLists extends Space {
  lists: ProjectList[];
}

interface WorkspaceWithSpaces extends Workspace {
  spacesData: SpaceWithLists[];
}

type CreatingIn =
  | { type: 'workspace' }
  | { type: 'space'; workspaceId: string };

type RenamingItem = { id: string; type: 'workspace' | 'space' } | null;
const SIDEBAR_SELECTED_WORKSPACES_KEY = 'myproplanner:sidebar-selected-workspaces:v1';
const SIDEBAR_SELECTED_LISTS_KEY = 'myproplanner:sidebar-selected-lists:v1';
const SIDEBAR_EXPANDED_WORKSPACES_KEY = 'myproplanner:sidebar-expanded-workspaces:v1';
const SIDEBAR_EXPANDED_SPACES_KEY = 'myproplanner:sidebar-expanded-spaces:v1';
const SIDEBAR_EXPANDED_PROJECT_TASKS_KEY = 'myproplanner:sidebar-expanded-project-tasks:v1';

function getStoredSet(key: string) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

function flattenTaskCount(tasks: Task[]): number {
  return tasks.reduce((sum, task) => sum + 1 + flattenTaskCount(task.children), 0);
}

const SidebarTaskNode: React.FC<{
  task: Task;
  depth: number;
  accentColor: string;
}> = ({ task, depth, accentColor }) => {
  const [expanded, setExpanded] = React.useState(true);
  const hasChildren = task.children.length > 0;
  const fallbackIcon = task.task_type === 'project' ? 'briefcase' : task.task_type === 'milestone' ? 'flag' : 'circle-dot';

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 text-xs text-gray-500 transition-colors hover:bg-slate-100"
        style={{ paddingLeft: 64 + depth * 16 }}
      >
        <button
          type="button"
          onClick={() => hasChildren && setExpanded((current) => !current)}
          className={`flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-slate-200 ${
            hasChildren ? 'text-gray-400' : 'text-transparent'
          }`}
        >
          {hasChildren ? (expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />) : <span className="w-3" />}
        </button>
        <EntityIcon
          icon={task.icon}
          fallbackIcon={fallbackIcon}
          color={accentColor}
          size={11}
          className="flex-shrink-0"
        />
        <span className="truncate">{task.name}</span>
      </div>

      {hasChildren && expanded && task.children.map((child) => (
        <SidebarTaskNode key={child.id} task={child} depth={depth + 1} accentColor={accentColor} />
      ))}
    </div>
  );
};

const InlineInput: React.FC<{
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  indent?: number;
}> = ({ placeholder, value, onChange, onConfirm, onCancel, indent = 0 }) => (
  <div className="flex items-center gap-1 px-2 py-1" style={{ paddingLeft: indent }}>
    <input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onConfirm();
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => {
        if (value.trim()) onConfirm();
        else onCancel();
      }}
      placeholder={placeholder}
      className="flex-1 rounded border border-blue-400 bg-white px-2 py-1 text-xs outline-none focus:border-blue-600"
    />
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="rounded p-0.5 text-gray-400 hover:bg-gray-200"
    >
      <X size={11} />
    </button>
  </div>
);

const Sidebar: React.FC<SidebarProps> = ({ onSelectionChange, defaultTaskTreeExpanded }) => {
  const [workspaces, setWorkspaces] = React.useState<WorkspaceWithSpaces[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expandedWorkspaces, setExpandedWorkspaces] = React.useState<Set<string>>(() => getStoredSet(SIDEBAR_EXPANDED_WORKSPACES_KEY));
  const [expandedSpaces, setExpandedSpaces] = React.useState<Set<string>>(() => getStoredSet(SIDEBAR_EXPANDED_SPACES_KEY));
  const [expandedProjectTasks, setExpandedProjectTasks] = React.useState<Set<string>>(() => getStoredSet(SIDEBAR_EXPANDED_PROJECT_TASKS_KEY));
  const [projectTasks, setProjectTasks] = React.useState<Record<string, Task[]>>({});
  const [loadingProjectTaskIds, setLoadingProjectTaskIds] = React.useState<Set<string>>(new Set());
  const [creatingIn, setCreatingIn] = React.useState<CreatingIn | null>(null);
  const [createName, setCreateName] = React.useState('');
  const [renamingItem, setRenamingItem] = React.useState<RenamingItem>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = React.useState<Set<string>>(() => getStoredSet(SIDEBAR_SELECTED_WORKSPACES_KEY));
  const [selectedListIds, setSelectedListIds] = React.useState<Set<string>>(() => getStoredSet(SIDEBAR_SELECTED_LISTS_KEY));
  const [editingProject, setEditingProject] = React.useState<ProjectList | null>(null);
  const [createProjectSpaceId, setCreateProjectSpaceId] = React.useState<string | null>(null);
  const [resourcesPanelProject, setResourcesPanelProject] = React.useState<ProjectList | null>(null);

  const selectedWorkspaceIdsRef = React.useRef(selectedWorkspaceIds);
  const selectedListIdsRef = React.useRef(selectedListIds);

  React.useEffect(() => {
    selectedWorkspaceIdsRef.current = selectedWorkspaceIds;
  }, [selectedWorkspaceIds]);

  React.useEffect(() => {
    selectedListIdsRef.current = selectedListIds;
  }, [selectedListIds]);

  React.useEffect(() => {
    localStorage.setItem(SIDEBAR_SELECTED_WORKSPACES_KEY, JSON.stringify(Array.from(selectedWorkspaceIds)));
  }, [selectedWorkspaceIds]);

  React.useEffect(() => {
    localStorage.setItem(SIDEBAR_SELECTED_LISTS_KEY, JSON.stringify(Array.from(selectedListIds)));
  }, [selectedListIds]);

  React.useEffect(() => {
    localStorage.setItem(SIDEBAR_EXPANDED_WORKSPACES_KEY, JSON.stringify(Array.from(expandedWorkspaces)));
  }, [expandedWorkspaces]);

  React.useEffect(() => {
    localStorage.setItem(SIDEBAR_EXPANDED_SPACES_KEY, JSON.stringify(Array.from(expandedSpaces)));
  }, [expandedSpaces]);

  React.useEffect(() => {
    localStorage.setItem(SIDEBAR_EXPANDED_PROJECT_TASKS_KEY, JSON.stringify(Array.from(expandedProjectTasks)));
  }, [expandedProjectTasks]);

  const buildSelectedLists = React.useCallback(
    (
      workspaceIds: Set<string>,
      listIds: Set<string>,
      sourceWorkspaces: WorkspaceWithSpaces[]
    ): SelectedListTarget[] => {
      const selected = new Map<string, SelectedListTarget>();

      for (const workspace of sourceWorkspaces) {
        const includeWorkspace = workspaceIds.has(workspace.id);
        for (const space of workspace.spacesData) {
          for (const list of space.lists) {
            if (includeWorkspace || listIds.has(list.id)) {
              selected.set(list.id, {
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
                workspaceId: workspace.id,
                workspaceName: workspace.name,
                createdAt: list.created_at,
              });
            }
          }
        }
      }

      return Array.from(selected.values());
    },
    []
  );

  const getFirstListTarget = React.useCallback((sourceWorkspaces: WorkspaceWithSpaces[]) => {
    for (const workspace of sourceWorkspaces) {
      for (const space of workspace.spacesData) {
        const firstList = space.lists[0];
        if (firstList) {
          return {
            listId: firstList.id,
            listName: firstList.name,
            listColor: firstList.color,
            listIcon: firstList.icon,
            folderId: firstList.folder_id,
            startDate: firstList.start_date,
            endDate: firstList.end_date,
            baselineStartDate: firstList.baseline_start_date,
            baselineEndDate: firstList.baseline_end_date,
            listSettings: firstList.settings,
            spaceId: space.id,
            spaceName: space.name,
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            createdAt: firstList.created_at,
          } satisfies SelectedListTarget;
        }
      }
    }
    return null;
  }, []);

  const emitSelection = React.useCallback(
    (
      workspaceIds: Set<string>,
      listIds: Set<string>,
      sourceWorkspaces: WorkspaceWithSpaces[],
      options?: { fallbackToFirst?: boolean }
    ) => {
      const validWorkspaceIds = new Set(
        [...workspaceIds].filter((id) => sourceWorkspaces.some((workspace) => workspace.id === id))
      );
      const validListIds = new Set(
        [...listIds].filter((id) =>
          sourceWorkspaces.some((workspace) =>
            workspace.spacesData.some((space) => space.lists.some((list) => list.id === id))
          )
        )
      );

      let selectedLists = buildSelectedLists(validWorkspaceIds, validListIds, sourceWorkspaces);

      if (selectedLists.length === 0 && options?.fallbackToFirst !== false) {
        const firstList = getFirstListTarget(sourceWorkspaces);
        if (firstList) {
          validWorkspaceIds.clear();
          validListIds.clear();
          validListIds.add(firstList.listId);
          selectedLists = [firstList];
        }
      }

      setSelectedWorkspaceIds(new Set(validWorkspaceIds));
      setSelectedListIds(new Set(validListIds));
      onSelectionChange({
        selectedLists,
        selectedListIds: Array.from(validListIds),
        selectedWorkspaceIds: Array.from(validWorkspaceIds),
      });
    },
    [buildSelectedLists, getFirstListTarget, onSelectionChange]
  );

  const loadWorkspaces = React.useCallback(
    async (selectionOverride?: {
      workspaceIds?: Set<string>;
      listIds?: Set<string>;
      fallbackToFirst?: boolean;
    }) => {
      try {
        setLoading(true);
        const data = await getWorkspaces();
        const withSpaces: WorkspaceWithSpaces[] = await Promise.all(
          data.map(async (workspace) => {
            const spacesData = await Promise.all(
              workspace.spaces.map(async (space) => {
                const listsData = await getSpaceLists(space.id);
                return {
                  ...space,
                  lists: listsData.lists,
                };
              })
            );

            return {
              ...workspace,
              spacesData,
            };
          })
        );

        setWorkspaces(withSpaces);
        setExpandedWorkspaces((prev) => {
          const filtered = new Set([...prev].filter((id) => withSpaces.some((workspace) => workspace.id === id)));
          if (filtered.size > 0) return filtered;
          return withSpaces[0] ? new Set([withSpaces[0].id]) : new Set();
        });
        setExpandedSpaces((prev) => {
          const filtered = new Set(
            [...prev].filter((id) =>
              withSpaces.some((workspace) => workspace.spacesData.some((space) => space.id === id))
            )
          );
          if (filtered.size > 0) return filtered;
          const firstSpace = withSpaces[0]?.spacesData[0];
          return firstSpace ? new Set([firstSpace.id]) : new Set();
        });
        setExpandedProjectTasks((prev) => {
          const allListIds = withSpaces.flatMap((workspace) =>
            workspace.spacesData.flatMap((space) => space.lists.map((list) => list.id))
          );
          const filtered = new Set([...prev].filter((id) => allListIds.includes(id)));
          if (filtered.size > 0 || !defaultTaskTreeExpanded) return filtered;
          return new Set(allListIds);
        });

        emitSelection(
          selectionOverride?.workspaceIds ?? selectedWorkspaceIdsRef.current,
          selectionOverride?.listIds ?? selectedListIdsRef.current,
          withSpaces,
          { fallbackToFirst: selectionOverride?.fallbackToFirst }
        );
      } catch (err) {
        console.error('Failed to load workspaces:', err);
      } finally {
        setLoading(false);
      }
    },
    [defaultTaskTreeExpanded, emitSelection]
  );

  React.useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  React.useEffect(() => {
    const handleRefresh = () => {
      void loadWorkspaces({
        workspaceIds: new Set(selectedWorkspaceIdsRef.current),
        listIds: new Set(selectedListIdsRef.current),
        fallbackToFirst: false,
      });
    };

    window.addEventListener('myproplanner:project-settings-updated', handleRefresh);
    return () => window.removeEventListener('myproplanner:project-settings-updated', handleRefresh);
  }, [loadWorkspaces]);

  const effectiveSelectedLists = React.useMemo(
    () => buildSelectedLists(selectedWorkspaceIds, selectedListIds, workspaces),
    [buildSelectedLists, selectedListIds, selectedWorkspaceIds, workspaces]
  );
  const effectiveSelectedListIds = React.useMemo(
    () => new Set(effectiveSelectedLists.map((list) => list.listId)),
    [effectiveSelectedLists]
  );

  const spaceOptions = React.useMemo(
    () =>
      workspaces.flatMap((workspace) =>
        workspace.spacesData.map((space) => ({
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          spaceId: space.id,
          spaceName: space.name,
        }))
      ),
    [workspaces]
  );

  const toggleWorkspace = (workspace: WorkspaceWithSpaces) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(workspace.id)) next.delete(workspace.id);
      else next.add(workspace.id);
      return next;
    });
  };

  const toggleSpace = (space: SpaceWithLists) => {
    setExpandedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(space.id)) next.delete(space.id);
      else next.add(space.id);
      return next;
    });
  };

  const startCreating = (location: CreatingIn) => {
    setCreateName('');
    setCreatingIn(location);
  };

  const cancelCreate = () => {
    setCreatingIn(null);
    setCreateName('');
  };

  const handleCreate = async () => {
    const trimmed = createName.trim();
    if (!trimmed || !creatingIn) return;

    setCreatingIn(null);
    setCreateName('');

    try {
      if (creatingIn.type === 'workspace') {
        await createWorkspace(trimmed);
        await loadWorkspaces();
      } else if (creatingIn.type === 'space') {
        await createSpace(creatingIn.workspaceId, trimmed);
        setExpandedWorkspaces((prev) => new Set([...prev, creatingIn.workspaceId]));
        await loadWorkspaces();
      }
    } catch (err) {
      console.error('Failed to create:', err);
    }
  };

  const startRename = (id: string, type: 'workspace' | 'space', currentName: string) => {
    setRenamingItem({ id, type });
    setRenameValue(currentName);
  };

  const handleRenameConfirm = async () => {
    if (!renamingItem || !renameValue.trim()) {
      setRenamingItem(null);
      return;
    }

    const trimmed = renameValue.trim();
    const item = renamingItem;
    setRenamingItem(null);

    try {
      if (item.type === 'workspace') await renameWorkspace(item.id, trimmed);
      else await renameSpace(item.id, trimmed);
      await loadWorkspaces();
    } catch (err) {
      console.error('Failed to rename:', err);
    }
  };

  const handleWorkspaceMultiToggle = (workspaceId: string) => {
    const nextWorkspaceIds = new Set(selectedWorkspaceIdsRef.current);
    if (nextWorkspaceIds.has(workspaceId)) nextWorkspaceIds.delete(workspaceId);
    else nextWorkspaceIds.add(workspaceId);

    emitSelection(nextWorkspaceIds, new Set(selectedListIdsRef.current), workspaces, {
      fallbackToFirst: false,
    });
  };

  const handleListMultiToggle = (listId: string) => {
    const nextWorkspaceIds = new Set(selectedWorkspaceIdsRef.current);
    const nextListIds = new Set(selectedListIdsRef.current);
    const effectiveSelectedIds = new Set(buildSelectedLists(nextWorkspaceIds, nextListIds, workspaces).map((list) => list.listId));
    const isCurrentlySelected = effectiveSelectedIds.has(listId);
    const workspaceContainingList = workspaces.find((workspace) =>
      workspace.spacesData.some((space) => space.lists.some((list) => list.id === listId))
    );

    if (workspaceContainingList && nextWorkspaceIds.has(workspaceContainingList.id)) {
      nextWorkspaceIds.delete(workspaceContainingList.id);
      for (const space of workspaceContainingList.spacesData) {
        for (const list of space.lists) {
          if (list.id !== listId && effectiveSelectedIds.has(list.id)) {
            nextListIds.add(list.id);
          }
        }
      }
    }

    if (isCurrentlySelected) nextListIds.delete(listId);
    else nextListIds.add(listId);

    emitSelection(nextWorkspaceIds, nextListIds, workspaces, {
      fallbackToFirst: false,
    });
  };

  const handleProjectDelete = async (project: ProjectList) => {
    if (!confirm(`Delete project "${project.name}" and all of its tasks?`)) return;

    try {
      await deleteList(project.id);
      const nextListIds = new Set(selectedListIdsRef.current);
      nextListIds.delete(project.id);
      await loadWorkspaces({
        workspaceIds: new Set(selectedWorkspaceIdsRef.current),
        listIds: nextListIds,
        fallbackToFirst: false,
      });
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  const loadProjectTasks = React.useCallback(async (projectId: string) => {
    if (projectTasks[projectId]) return;

    setLoadingProjectTaskIds((prev) => new Set([...prev, projectId]));
    try {
      const data = await getTaskTree(projectId);
      setProjectTasks((prev) => ({
        ...prev,
        [projectId]: data.tasks,
      }));
    } catch (err) {
      console.error('Failed to load project tasks:', err);
      setProjectTasks((prev) => ({
        ...prev,
        [projectId]: [],
      }));
    } finally {
      setLoadingProjectTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }, [projectTasks]);

  const toggleProjectTasks = (projectId: string) => {
    const shouldExpand = !expandedProjectTasks.has(projectId);
    setExpandedProjectTasks((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });

    if (shouldExpand) {
      void loadProjectTasks(projectId);
    }
  };

  React.useEffect(() => {
    expandedProjectTasks.forEach((projectId) => {
      if (!projectTasks[projectId] && !loadingProjectTaskIds.has(projectId)) {
        void loadProjectTasks(projectId);
      }
    });
  }, [expandedProjectTasks, loadingProjectTaskIds, loadProjectTasks, projectTasks]);

  React.useEffect(() => {
    const allListIds = workspaces.flatMap((workspace) =>
      workspace.spacesData.flatMap((space) => space.lists.map((list) => list.id))
    );
    setExpandedProjectTasks(defaultTaskTreeExpanded ? new Set(allListIds) : new Set());
  }, [defaultTaskTreeExpanded]);

  if (loading) {
    return (
      <div className="h-full w-full bg-slate-50 p-4">
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-4 w-4/5 rounded bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50">
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {workspaces.map((workspace) => {
            const workspaceExpanded = expandedWorkspaces.has(workspace.id);
            const workspaceChecked = selectedWorkspaceIds.has(workspace.id);

            return (
              <div key={workspace.id}>
                <div
                  className={`group flex items-center transition-colors ${
                    workspaceChecked ? 'bg-indigo-50' : 'hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={workspaceChecked}
                    onChange={() => handleWorkspaceMultiToggle(workspace.id)}
                    className="ml-3 h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    title="Include this workspace in the current view"
                  />
                  <button onClick={() => toggleWorkspace(workspace)} className="p-2">
                    {workspaceExpanded ? (
                      <ChevronDown size={13} className="text-gray-500" />
                    ) : (
                      <ChevronRight size={13} className="text-gray-500" />
                    )}
                  </button>
                  <button
                    onClick={() =>
                      emitSelection(new Set([workspace.id]), new Set(), workspaces, {
                        fallbackToFirst: false,
                      })
                    }
                    className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
                  >
                    <Briefcase size={13} className="flex-shrink-0 text-indigo-500" />
                    {renamingItem?.id === workspace.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={handleRenameConfirm}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleRenameConfirm();
                          if (e.key === 'Escape') setRenamingItem(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="min-w-0 flex-1 rounded border border-blue-400 bg-white px-1 py-0.5 text-sm font-semibold outline-none"
                      />
                    ) : (
                      <span
                        className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startRename(workspace.id, 'workspace', workspace.name);
                        }}
                        title="Double-click to rename"
                      >
                        {workspace.name}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startCreating({ type: 'space', workspaceId: workspace.id });
                      if (!workspaceExpanded) toggleWorkspace(workspace);
                    }}
                    className="mr-2 rounded p-1 text-gray-400 opacity-0 transition-colors group-hover:opacity-100 hover:bg-slate-200 hover:text-indigo-600"
                    title="New space"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {creatingIn?.type === 'space' && creatingIn.workspaceId === workspace.id && (
                  <div style={{ paddingLeft: 20 }}>
                    <InlineInput
                      placeholder="Space name..."
                      value={createName}
                      onChange={setCreateName}
                      onConfirm={handleCreate}
                      onCancel={cancelCreate}
                      indent={8}
                    />
                  </div>
                )}

                {workspaceExpanded &&
                  workspace.spacesData.map((space) => {
                    const spaceExpanded = expandedSpaces.has(space.id);
                    return (
                      <div key={space.id}>
                        <div
                          className="group flex items-center transition-colors hover:bg-slate-100"
                          style={{ paddingLeft: 18 }}
                        >
                          <button onClick={() => toggleSpace(space)} className="p-2">
                            {spaceExpanded ? (
                              <ChevronDown size={12} className="text-gray-400" />
                            ) : (
                              <ChevronRight size={12} className="text-gray-400" />
                            )}
                          </button>
                          <Layers size={12} className="mr-1.5 flex-shrink-0 text-blue-400" />
                          {renamingItem?.id === space.id ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={handleRenameConfirm}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleRenameConfirm();
                                if (e.key === 'Escape') setRenamingItem(null);
                              }}
                              className="min-w-0 flex-1 rounded border border-blue-400 bg-white px-1 py-0.5 text-sm outline-none"
                            />
                          ) : (
                            <span
                              className="min-w-0 flex-1 truncate text-sm text-gray-700"
                              onDoubleClick={() => startRename(space.id, 'space', space.name)}
                              title="Double-click to rename"
                            >
                              {space.name}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCreateProjectSpaceId(space.id);
                              setExpandedWorkspaces((prev) => new Set([...prev, workspace.id]));
                              if (!spaceExpanded) toggleSpace(space);
                            }}
                            className="mr-2 rounded p-1 text-gray-400 opacity-0 transition-colors group-hover:opacity-100 hover:bg-slate-200 hover:text-blue-600"
                            title="New project"
                          >
                            <Plus size={12} />
                          </button>
                        </div>

                        {spaceExpanded && (
                          <div>
                            {space.lists.map((list) => {
                              const selected = effectiveSelectedListIds.has(list.id);
                              const accentColor = getAppearanceColor(list.color, '#2563EB');
                              const projectTasksExpanded = expandedProjectTasks.has(list.id);
                              const isProjectTasksLoading = loadingProjectTaskIds.has(list.id);
                              const taskTree = projectTasks[list.id];
                              const taskCount = taskTree ? flattenTaskCount(taskTree) : 0;

                              return (
                                <div key={list.id}>
                                  <div
                                    className={`group/list flex items-center transition-colors ${
                                      selected ? 'bg-blue-50' : 'hover:bg-slate-100'
                                    }`}
                                    style={{ paddingLeft: 46 }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => toggleProjectTasks(list.id)}
                                      className="mr-1 flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-slate-200 hover:text-gray-600"
                                      title={projectTasksExpanded ? 'Collapse project tasks' : 'Expand project tasks'}
                                    >
                                      {projectTasksExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                    </button>
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={() => handleListMultiToggle(list.id)}
                                      onClick={(event) => event.stopPropagation()}
                                      className="mr-2 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                      title="Include this project in the current view"
                                    />
                                    <button
                                      onClick={() =>
                                        emitSelection(new Set(), new Set([list.id]), workspaces, {
                                          fallbackToFirst: false,
                                        })
                                      }
                                      onDoubleClick={() => setEditingProject(list)}
                                      className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                                      title="Double-click for project settings"
                                    >
                                      <EntityIcon
                                        icon={list.icon}
                                        fallbackIcon="folder-kanban"
                                        color={accentColor}
                                        size={13}
                                        className="flex-shrink-0"
                                      />
                                      <span
                                        className={`min-w-0 truncate text-xs ${
                                          selected ? 'font-medium text-blue-700' : 'text-gray-600'
                                        }`}
                                      >
                                        {list.name}
                                      </span>
                                      {projectTasksExpanded && taskTree && (
                                        <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] text-gray-400">
                                          {taskCount}
                                        </span>
                                      )}
                                    </button>
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setResourcesPanelProject(list);
                                      }}
                                      className="rounded p-1 text-gray-400 opacity-0 transition-colors group-hover/list:opacity-100 hover:bg-blue-50 hover:text-blue-600"
                                      title="Project resources"
                                    >
                                      <FolderOpen size={12} />
                                    </button>
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setEditingProject(list);
                                      }}
                                      className="rounded p-1 text-gray-400 opacity-0 transition-colors group-hover/list:opacity-100 hover:bg-slate-200 hover:text-gray-700"
                                      title="Edit project"
                                    >
                                      <Settings2 size={12} />
                                    </button>
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleProjectDelete(list);
                                      }}
                                      className="mr-2 rounded p-1 text-gray-400 opacity-0 transition-colors group-hover/list:opacity-100 hover:bg-red-100 hover:text-red-600"
                                      title="Delete project"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>

                                  {projectTasksExpanded && (
                                    <div>
                                      {isProjectTasksLoading ? (
                                        <div className="flex items-center gap-2 py-1.5 text-xs text-gray-400" style={{ paddingLeft: 68 }}>
                                          <Loader2 size={11} className="animate-spin" />
                                          Loading tasks...
                                        </div>
                                      ) : taskTree && taskTree.length > 0 ? (
                                        taskTree.map((task) => (
                                          <SidebarTaskNode
                                            key={task.id}
                                            task={task}
                                            depth={0}
                                            accentColor={accentColor}
                                          />
                                        ))
                                      ) : (
                                        <div className="flex items-center gap-2 py-1.5 text-xs text-gray-400" style={{ paddingLeft: 68 }}>
                                          <CircleDot size={11} />
                                          No tasks yet
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {space.lists.length === 0 && (
                              <p className="py-1.5 text-xs text-gray-400" style={{ paddingLeft: 48 }}>
                                No projects yet
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}

          {workspaces.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-400">No workspaces found</p>
          )}
        </div>

        <div className="border-t border-gray-200 bg-white/60 px-4 py-3">
          <p className="text-xs text-gray-500">
            {effectiveSelectedLists.length === 0
              ? 'Nothing selected'
              : `${effectiveSelectedLists.length} project${effectiveSelectedLists.length === 1 ? '' : 's'} selected`}
          </p>
        </div>

        <div className="border-t border-gray-200 p-2">
          {spaceOptions.length > 0 && (
            <button
              onClick={() => setCreateProjectSpaceId(spaceOptions[0].spaceId)}
              className="mb-1 flex w-full items-center gap-2 rounded px-3 py-2 text-xs text-gray-500 transition-colors hover:bg-slate-100 hover:text-gray-700"
              title="Create a new project or use a template"
            >
              <Plus size={12} />
              New project / template
            </button>
          )}
          {creatingIn?.type === 'workspace' ? (
            <InlineInput
              placeholder="Workspace name..."
              value={createName}
              onChange={setCreateName}
              onConfirm={handleCreate}
              onCancel={cancelCreate}
            />
          ) : (
            <button
              onClick={() => startCreating({ type: 'workspace' })}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs text-gray-500 transition-colors hover:bg-slate-100 hover:text-gray-700"
            >
              <Plus size={12} />
              New workspace
            </button>
          )}
        </div>
      </aside>

      {editingProject && (
        <ProjectEditModal
          project={editingProject}
          spaceOptions={spaceOptions}
          onClose={() => setEditingProject(null)}
          onSaved={() => void loadWorkspaces()}
        />
      )}

      {createProjectSpaceId && (
        <CreateProjectModal
          spaceOptions={spaceOptions}
          defaultSpaceId={createProjectSpaceId}
          onClose={() => setCreateProjectSpaceId(null)}
          onCreated={async (projectId) => {
            const targetSpace = spaceOptions.find((option) => option.spaceId === createProjectSpaceId);
            if (targetSpace) {
              setExpandedWorkspaces((prev) => new Set([...prev, targetSpace.workspaceId]));
            }
            setExpandedSpaces((prev) => new Set([...prev, createProjectSpaceId]));
            await loadWorkspaces({
              workspaceIds: new Set(),
              listIds: new Set([projectId]),
            });
          }}
        />
      )}

      {resourcesPanelProject && (
        <ResourcesPanel
          listId={resourcesPanelProject.id}
          listName={resourcesPanelProject.name}
          onClose={() => setResourcesPanelProject(null)}
        />
      )}
    </>
  );
};

export default Sidebar;
