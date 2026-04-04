import React from 'react';
import { ExternalLink, Mail, RefreshCw, Trash2, X } from 'lucide-react';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { CustomFieldDefinition, CustomFieldValue, Task, TaskDependency, TaskStatus } from '../types';
import { addDependency, createTask, getAllListsFlat, getTask, getTaskTree, removeDependency, type FlatList, updateTask } from '../api';
import { formatCompactDate } from '../lib/dateFormat';
import { getTaskMailLinks } from '../lib/mailSettings';
import { normalizeProjectSettings } from '../lib/projectSettings';
import { parseProgressInput } from '../lib/progress';
import ColorPicker from './ColorPicker';
import IconPicker from './IconPicker';
import { ProgressFieldControl } from './ProgressFieldControl';
import StatusPill from './StatusPill';

interface TaskEditModalProps {
  taskId: string | null;
  task: Task | null;
  listId: string;
  parentId: string | null;
  initialTasks?: Task[];
  initialDependencies?: TaskDependency[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onMoved?: () => void | Promise<void>;
  onDependencyAdded?: (data: { listId: string; tasks: Task[]; dependencies: TaskDependency[] }) => void | Promise<void>;
  onDependencyRemoved?: (data: { listId: string; tasks: Task[]; dependencies: TaskDependency[] }) => void | Promise<void>;
}

function parseNumberValue(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
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

function findTaskById(tasks: Task[], taskId: string): Task | null {
  for (const task of tasks) {
    if (task.id === taskId) return task;
    const childMatch = findTaskById(task.children, taskId);
    if (childMatch) return childMatch;
  }
  return null;
}

function collectDescendantIds(task: Task, result = new Set<string>()) {
  result.add(task.id);
  for (const child of task.children) {
    collectDescendantIds(child, result);
  }
  return result;
}

const TaskEditModal: React.FC<TaskEditModalProps> = ({
  taskId,
  task,
  listId,
  parentId,
  initialTasks,
  initialDependencies,
  onClose,
  onSaved,
  onMoved,
  onDependencyAdded,
  onDependencyRemoved,
}) => {
  const [sourceTask, setSourceTask] = React.useState<Task | null>(task);
  const [loadingTask, setLoadingTask] = React.useState(Boolean(taskId && !task));
  const [name, setName] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [taskType, setTaskType] = React.useState('');
  const [color, setColor] = React.useState('#2563EB');
  const [icon, setIcon] = React.useState('circle-dot');
  const [targetListId, setTargetListId] = React.useState(listId);
  const [selectedParentId, setSelectedParentId] = React.useState(parentId ?? '');
  const [allLists, setAllLists] = React.useState<FlatList[]>([]);
  const [customFieldValues, setCustomFieldValues] = React.useState<Record<string, CustomFieldValue>>(
    {}
  );
  const [listTasks, setListTasks] = React.useState<Task[]>(initialTasks ?? []);
  const [listDependencies, setListDependencies] = React.useState<TaskDependency[]>(initialDependencies ?? []);
  const [draftDependencyTaskIds, setDraftDependencyTaskIds] = React.useState<string[]>([]);
  const [newDependencyTaskId, setNewDependencyTaskId] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isEditing = taskId !== null;
  const effectiveTask = isEditing ? sourceTask : null;
  const activeList = React.useMemo(
    () => allLists.find((list) => list.listId === targetListId) ?? allLists.find((list) => list.listId === listId),
    [allLists, listId, targetListId]
  );
  const contextListId = task?.list_id ?? listId;
  const hasInitialContext = Array.isArray(initialTasks) && Array.isArray(initialDependencies);
  const projectSettings = normalizeProjectSettings(activeList?.listSettings);
  const defaultStatus = projectSettings.statuses[0]?.value ?? 'NOT_STARTED';
  const linkedTaskThreads = React.useMemo(
    () => (effectiveTask ? getTaskMailLinks(activeList?.listSettings, effectiveTask.id) : []),
    [activeList?.listSettings, effectiveTask]
  );
  const [status, setStatus] = React.useState<TaskStatus>(
    task?.status ?? defaultStatus
  );

  React.useEffect(() => {
    let cancelled = false;

    const loadEditorContext = async () => {
      if (!taskId) {
        setSourceTask(null);
        setTargetListId(listId);
        setLoadingTask(false);
        return;
      }

      if (task && task.id === taskId) {
        setSourceTask(task);
        setTargetListId(task.list_id || listId);
        setLoadingTask(false);
        return;
      }

      setLoadingTask(true);

      try {
        const freshTask = await getTask(taskId);
        if (cancelled) return;

        setTargetListId(freshTask.list_id || listId);
        setSourceTask(freshTask);
      } catch {
        if (cancelled) return;
        setSourceTask(task);
        setTargetListId(task?.list_id || listId);
      } finally {
        if (!cancelled) {
          setLoadingTask(false);
        }
      }
    };

    void loadEditorContext();

    return () => {
      cancelled = true;
    };
  }, [listId, task, taskId]);

  const formSeedKey = React.useMemo(() => {
    if (!isEditing) {
      return `new:${listId}:${parentId ?? 'root'}`;
    }
    if (!effectiveTask) {
      return `loading:${taskId ?? 'unknown'}`;
    }
    return [
      effectiveTask.id,
      effectiveTask.updated_at,
      effectiveTask.list_id,
      effectiveTask.parent_id ?? 'root',
    ].join(':');
  }, [
    effectiveTask?.id,
    effectiveTask?.updated_at,
    effectiveTask?.list_id,
    effectiveTask?.parent_id,
    isEditing,
    listId,
    parentId,
    taskId,
  ]);

  React.useEffect(() => {
    if (!effectiveTask) return;

    setName(effectiveTask.name);
    setStartDate(effectiveTask.start_date ?? '');
    setEndDate(effectiveTask.end_date ?? '');
    setTaskType(effectiveTask.task_type ?? '');
    setColor(effectiveTask.color || '#2563EB');
    setIcon(effectiveTask.icon || (effectiveTask.task_type === 'project' ? 'briefcase' : 'circle-dot'));
    setTargetListId(effectiveTask.list_id || listId);
    setSelectedParentId(effectiveTask.parent_id ?? '');
    setCustomFieldValues(effectiveTask.custom_fields ?? {});
    setNewDependencyTaskId('');
    setError(null);
    setSaving(false);
    setStatus(effectiveTask.status ?? defaultStatus);
  }, [formSeedKey]);

  React.useEffect(() => {
    if (isEditing) return;

    setName('');
    setStartDate('');
    setEndDate('');
    setTaskType('');
    setColor('#2563EB');
    setIcon('circle-dot');
    setTargetListId(listId);
    setSelectedParentId(parentId ?? '');
    setCustomFieldValues({});
    setNewDependencyTaskId('');
    setError(null);
    setSaving(false);
    setStatus(defaultStatus);
  }, [defaultStatus, isEditing, listId, parentId]);

  React.useEffect(() => {
    getAllListsFlat().then(setAllLists).catch(() => {});
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    if (hasInitialContext && targetListId === contextListId) {
      setListTasks(initialTasks);
      setListDependencies(initialDependencies);
      return () => {
        cancelled = true;
      };
    }

    getTaskTree(targetListId)
      .then((data) => {
        if (cancelled) return;
        setListTasks(data.tasks);
        setListDependencies(data.dependencies);
      })
      .catch(() => {
        if (cancelled) return;
        setListTasks([]);
        setListDependencies([]);
      });

    return () => {
      cancelled = true;
    };
  }, [contextListId, hasInitialContext, initialDependencies, initialTasks, targetListId]);

  const groupedLists = React.useMemo(() => {
    const groups: { label: string; lists: FlatList[] }[] = [];
    const seen = new Map<string, number>();

    for (const list of allLists) {
      const groupLabel = `${list.workspaceName} / ${list.spaceName}`;
      if (!seen.has(groupLabel)) {
        seen.set(groupLabel, groups.length);
        groups.push({ label: groupLabel, lists: [] });
      }
      groups[seen.get(groupLabel)!].lists.push(list);
    }

    return groups;
  }, [allLists]);

  const handleCustomFieldChange = (field: CustomFieldDefinition, value: string | boolean) => {
    let nextValue: CustomFieldValue;

    if (field.type === 'number') {
      nextValue = typeof value === 'string' ? parseNumberValue(value) : null;
    } else if (field.type === 'progress') {
      nextValue = typeof value === 'string' ? parseProgressInput(value) : null;
    } else if (field.type === 'checkbox') {
      nextValue = Boolean(value);
    } else {
      nextValue = typeof value === 'string' ? value || null : null;
    }

    setCustomFieldValues((prev) => ({
      ...prev,
      [field.id]: nextValue,
    }));
  };

  const renderCustomFieldInput = (field: CustomFieldDefinition, value: CustomFieldValue) => {
    if (field.type === 'status' || field.type === 'status_bar') {
      return (
        <StatusPill
          status={status}
          options={projectSettings.statuses}
          editable
          onChange={setStatus}
        />
      );
    }

    if (field.type === 'start_date') {
      return (
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      );
    }

    if (field.type === 'end_date') {
      return (
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      );
    }

    if (field.type === 'select') {
      return (
        <select
          value={String(value ?? '')}
          onChange={(e) => handleCustomFieldChange(field, e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
        >
          <option value="">Select...</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === 'checkbox') {
      return (
        <label className="flex h-[42px] items-center gap-3 rounded-lg border border-gray-300 px-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => handleCustomFieldChange(field, e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Mark as enabled
        </label>
      );
    }

    if (field.type === 'progress') {
      return (
        <ProgressFieldControl
          value={value === null || value === undefined ? '' : String(value)}
          onValueChange={(nextValue) => handleCustomFieldChange(field, nextValue)}
          emptyLabel="Set progress"
        />
      );
    }

    return (
      <div className="relative">
        <input
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : 'text'}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => handleCustomFieldChange(field, e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          placeholder={field.name}
        />
      </div>
    );
  };

  const dependencyCandidates = React.useMemo(() => {
    if (!effectiveTask) return [];
    return flattenTasks(listTasks).filter((candidate) => candidate.id !== effectiveTask.id);
  }, [effectiveTask, listTasks]);

  const blockedParentIds = React.useMemo(() => {
    if (!effectiveTask) return new Set<string>();
    const currentTask = flattenTasks(listTasks).find((candidate) => candidate.id === effectiveTask.id) ?? effectiveTask;
    return collectDescendantIds(currentTask);
  }, [effectiveTask, listTasks]);

  const parentCandidates = React.useMemo(
    () => flattenTasks(listTasks).filter((candidate) => !blockedParentIds.has(candidate.id)),
    [blockedParentIds, listTasks]
  );

  React.useEffect(() => {
    if (!selectedParentId) return;
    if (parentCandidates.some((candidate) => candidate.id === selectedParentId)) return;
    setSelectedParentId('');
  }, [parentCandidates, selectedParentId]);

  const persistedTaskDependencies = React.useMemo(() => {
    if (!effectiveTask) return [];
    return listDependencies.filter((dependency) => dependency.successor_id === effectiveTask.id);
  }, [effectiveTask, listDependencies]);

  const taskDependencies = React.useMemo(
    () =>
      draftDependencyTaskIds.map((predecessorId) => ({
        predecessorId,
        predecessor: dependencyCandidates.find((candidate) => candidate.id === predecessorId) ?? null,
        persistedDependency: persistedTaskDependencies.find((dependency) => dependency.predecessor_id === predecessorId) ?? null,
      })),
    [dependencyCandidates, draftDependencyTaskIds, persistedTaskDependencies]
  );

  React.useEffect(() => {
    setDraftDependencyTaskIds(persistedTaskDependencies.map((dependency) => dependency.predecessor_id));
  }, [formSeedKey, persistedTaskDependencies]);

  const dependencyWarnings = React.useMemo(() => {
    if (!effectiveTask) return [];

    return taskDependencies.flatMap((dependency) => {
      const predecessor = dependency.predecessor;
      if (!predecessor?.start_date || !predecessor?.end_date || !startDate || !endDate) return [];

      const predecessorStart = parseISO(predecessor.start_date);
      const predecessorEnd = parseISO(predecessor.end_date);
      const currentStart = parseISO(startDate);
      const currentEnd = parseISO(endDate);

      if (
        Number.isNaN(predecessorStart.getTime()) ||
        Number.isNaN(predecessorEnd.getTime()) ||
        Number.isNaN(currentStart.getTime()) ||
        Number.isNaN(currentEnd.getTime())
      ) {
        return [];
      }

      if (currentStart < predecessorEnd) {
        return [`${predecessor.name} must finish before this task starts.`];
      }

      return [];
    });
  }, [dependencyCandidates, effectiveTask, endDate, startDate, taskDependencies]);

  const handleAutoShiftDates = () => {
    if (!effectiveTask || !startDate || !endDate) return;

    const currentStart = parseISO(startDate);
    const currentEnd = parseISO(endDate);
    if (Number.isNaN(currentStart.getTime()) || Number.isNaN(currentEnd.getTime())) return;

    let earliestStart: Date | null = null;

    for (const dependency of taskDependencies) {
      const predecessor = dependency.predecessor;
      if (!predecessor?.start_date || !predecessor?.end_date) continue;

      const predecessorStart = parseISO(predecessor.start_date);
      const predecessorEnd = parseISO(predecessor.end_date);
      if (Number.isNaN(predecessorStart.getTime()) || Number.isNaN(predecessorEnd.getTime())) continue;

      earliestStart =
        !earliestStart || predecessorEnd.getTime() > earliestStart.getTime() ? predecessorEnd : earliestStart;
    }

    const durationDays = Math.max(0, differenceInCalendarDays(currentEnd, currentStart));
    const startShiftDays = earliestStart ? differenceInCalendarDays(earliestStart, currentStart) : 0;
    const shiftDays = Math.max(0, startShiftDays);

    if (shiftDays === 0) return;

    const nextStart = addDays(currentStart, shiftDays);
    const nextEnd = addDays(nextStart, durationDays);
    setStartDate(format(nextStart, 'yyyy-MM-dd'));
    setEndDate(format(nextEnd, 'yyyy-MM-dd'));
  };

  const availableDependencyCandidates = React.useMemo(
    () => dependencyCandidates.filter((candidate) => !draftDependencyTaskIds.includes(candidate.id)),
    [dependencyCandidates, draftDependencyTaskIds]
  );

  const handleRemoveDependency = (predecessorId: string) => {
    setDraftDependencyTaskIds((current) => current.filter((candidateId) => candidateId !== predecessorId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError(null);

    if (startDate && endDate && startDate > endDate) {
      setError('Task start date must be on or before the end date.');
      setSaving(false);
      return;
    }

    try {
      const payload = {
        name: name.trim(),
        status,
        start_date: startDate || null,
        end_date: endDate || null,
        parent_id: selectedParentId || null,
        task_type: taskType || null,
        color: color || null,
        icon: icon || null,
        custom_fields: {
          ...customFieldValues,
        },
      };

      if (isEditing && effectiveTask) {
        const updatePayload: Parameters<typeof updateTask>[1] = { ...payload };
        if (targetListId !== listId) {
          updatePayload.list_id = targetListId;
        }
        const updatedTask = await updateTask(effectiveTask.id, updatePayload);

        if (targetListId === listId) {
          const desiredDependencyIds = new Set(draftDependencyTaskIds);
          const dependencyRemovals = persistedTaskDependencies.filter(
            (dependency) => !desiredDependencyIds.has(dependency.predecessor_id)
          );
          const dependencyAdditions = draftDependencyTaskIds.filter(
            (predecessorId) =>
              !persistedTaskDependencies.some((dependency) => dependency.predecessor_id === predecessorId)
          );

          await Promise.all(
            dependencyRemovals.map((dependency) => removeDependency(effectiveTask.id, dependency.id))
          );
          await Promise.all(
            dependencyAdditions.map((predecessorId) => addDependency(effectiveTask.id, predecessorId, 'FS'))
          );
        }

        const refreshedTree = await getTaskTree(updatedTask.list_id || targetListId);
        const refreshedTask = findTaskById(refreshedTree.tasks, updatedTask.id) ?? updatedTask;
        setListTasks(refreshedTree.tasks);
        setListDependencies(refreshedTree.dependencies);
        setSourceTask(refreshedTask);
        setTargetListId(updatedTask.list_id || targetListId);

        if (targetListId !== listId && onMoved) await onMoved();
        else await onSaved();
      } else {
        await createTask({
          list_id: listId,
          parent_id: payload.parent_id,
          name: payload.name,
          status: payload.status,
          start_date: payload.start_date,
          end_date: payload.end_date,
          task_type: payload.task_type ?? undefined,
          color: payload.color,
          icon: payload.icon,
          custom_fields: payload.custom_fields,
        });
        await onSaved();
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mx-4 max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">
            {isEditing ? 'Edit Task' : parentId ? 'New Subtask' : 'New Task'}
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {loadingTask && isEditing && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              <RefreshCw size={14} className="animate-spin" />
              Loading latest saved task details...
            </div>
          )}
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          {isEditing && !effectiveTask ? (
            <div className="flex min-h-[16rem] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
              Loading the current saved task details...
            </div>
          ) : (
            <>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Enter task name"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                {projectSettings.statuses.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Task Type</label>
              <input
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="project, milestone, task..."
              />
            </div>
          </div>

          {isEditing && (
            <div className={targetListId !== listId ? '-mx-1 rounded-lg border border-blue-300 bg-blue-50 p-3' : ''}>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Move to Workspace / List
                {targetListId !== listId && (
                  <span className="ml-2 font-normal text-blue-600">
                    will move this task and its subtasks
                  </span>
                )}
              </label>
              <select
                value={targetListId}
                onChange={(e) => setTargetListId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                {groupedLists.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.lists.map((list) => (
                      <option key={list.listId} value={list.listId}>
                        {list.listName}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Parent Task / Level</label>
            <select
              value={selectedParentId}
              onChange={(e) => setSelectedParentId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="">{targetListId === listId ? 'Top level task' : 'Top level task in destination list'}</option>
              {parentCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {`${'-- '.repeat(Math.max(0, candidate.depth ?? 0))}${candidate.name}`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Use this to promote a subtask to top level or nest it under another task.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-600">Color</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-600">Icon</label>
            <IconPicker value={icon} color={color} onChange={setIcon} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {projectSettings.customFields.length > 0 && (
            <section className="space-y-3 border-t border-gray-100 pt-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Custom Fields</h4>
                <p className="text-xs text-gray-500">These fields are configured per project.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {projectSettings.customFields.map((field) => {
                  const value = customFieldValues[field.id];
                  return (
                    <div key={field.id}>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                        {field.name}
                      </label>
                      {renderCustomFieldInput(field, value)}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {isEditing && linkedTaskThreads.length > 0 && (
            <section className="space-y-3 border-t border-gray-100 pt-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Linked Customer Threads</h4>
                <p className="text-xs text-gray-500">
                  These threads were attached from a mail view for quick task context.
                </p>
              </div>

              <div className="space-y-2">
                {linkedTaskThreads.map((link) => (
                  <div key={link.id} className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-blue-50 p-1 text-blue-600">
                            <Mail size={12} />
                          </span>
                          <p className="truncate text-sm font-semibold text-slate-900">{link.subject}</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {link.fromName || link.fromEmail || 'Unknown sender'} · {formatCompactDate(link.latestMessageAt)}
                        </p>
                        {link.snippet && (
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{link.snippet}</p>
                        )}
                      </div>

                      <a
                        href={link.gmailUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        <ExternalLink size={12} />
                        Open
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3 border-t border-gray-100 pt-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Dependencies</h4>
              <p className="text-xs text-gray-500">
                Choose which task must finish before this one can start.
              </p>
              <p className="text-xs text-gray-400">
                Dependency changes are saved when you click Save Changes.
              </p>
            </div>

            {!isEditing ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Save the task first, then add dependencies.
              </p>
            ) : targetListId !== listId ? (
              <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                Save the move first, then configure dependencies in the destination project.
              </p>
            ) : (
              <>
                <div>
                  <select
                    value={newDependencyTaskId}
                    onChange={(e) => {
                      setNewDependencyTaskId(e.target.value);
                      if (e.target.value) {
                        setDraftDependencyTaskIds((current) =>
                          current.includes(e.target.value) ? current : [...current, e.target.value]
                        );
                        setNewDependencyTaskId('');
                      }
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">
                      {availableDependencyCandidates.length === 0
                        ? 'No more predecessor tasks available'
                        : 'Select predecessor task...'}
                    </option>
                    {availableDependencyCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  {taskDependencies.length === 0 ? (
                    <p className="text-sm text-gray-400">No dependencies yet.</p>
                  ) : (
                    taskDependencies.map((dependency) => {
                      const predecessor = dependency.predecessor;

                      return (
                        <div key={dependency.predecessorId} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-gray-800">
                              {predecessor?.name || dependency.predecessorId}
                            </p>
                            <p className="text-xs text-gray-500">Must finish before this task can start</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveDependency(dependency.predecessorId)}
                            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            title="Remove dependency"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {dependencyWarnings.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-amber-800">Dependency warnings</p>
                      <button
                        type="button"
                        onClick={handleAutoShiftDates}
                        className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                      >
                        Auto-shift dates
                      </button>
                    </div>
                    <div className="space-y-1">
                      {dependencyWarnings.map((warning, index) => (
                        <p key={`${warning}-${index}`} className="text-sm text-amber-700">
                          {warning}
                        </p>
                      ))}
                    </div>
                    <p className="text-xs text-amber-700/80">
                      Auto-shift keeps the current task duration and moves it forward just enough to satisfy its predecessor rules.
                    </p>
                  </div>
                )}
              </>
            )}
          </section>

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create'}
            </button>
          </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default TaskEditModal;
