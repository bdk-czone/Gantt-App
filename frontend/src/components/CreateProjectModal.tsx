import React from 'react';
import { Layers, Plus, Sparkles, X } from 'lucide-react';
import { addDependency, createList, createTask } from '../api';
import type { ProjectTemplate } from '../types';
import { getAllProjectTemplates, resolveTemplateTaskDates } from '../lib/projectTemplates';
import ColorPicker from './ColorPicker';
import DatePicker from './DatePicker';
import IconPicker from './IconPicker';

interface SpaceOption {
  workspaceId: string;
  workspaceName: string;
  spaceId: string;
  spaceName: string;
}

interface CreateProjectModalProps {
  spaceOptions: SpaceOption[];
  defaultSpaceId: string;
  onClose: () => void;
  onCreated: (projectId: string) => Promise<void> | void;
}

const todayDate = new Date().toISOString().slice(0, 10);
const DEFAULT_TEMPLATE_ID = 'builtin-gcp-saas';

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ spaceOptions, defaultSpaceId, onClose, onCreated }) => {
  const [templates, setTemplates] = React.useState<ProjectTemplate[]>(() => getAllProjectTemplates());
  const [name, setName] = React.useState('');
  const [spaceId, setSpaceId] = React.useState(defaultSpaceId);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState(DEFAULT_TEMPLATE_ID);
  const [color, setColor] = React.useState('#2563EB');
  const [icon, setIcon] = React.useState('folder-kanban');
  const [startDate, setStartDate] = React.useState<string | null>(null);
  const [endDate, setEndDate] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedTemplate = React.useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );

  const groupedSpaces = React.useMemo(() => {
    const groups: Array<{ label: string; spaces: SpaceOption[] }> = [];
    const seen = new Map<string, number>();

    for (const option of spaceOptions) {
      if (!seen.has(option.workspaceId)) {
        seen.set(option.workspaceId, groups.length);
        groups.push({ label: option.workspaceName, spaces: [] });
      }
      groups[seen.get(option.workspaceId)!].spaces.push(option);
    }

    return groups;
  }, [spaceOptions]);

  React.useEffect(() => {
    setTemplates(getAllProjectTemplates());
  }, []);

  React.useEffect(() => {
    if (!selectedTemplate) return;
    setColor(selectedTemplate.color || '#2563EB');
    setIcon(selectedTemplate.icon || 'folder-kanban');
    setStartDate((current) => current ?? (selectedTemplate.starterTasks.length > 0 ? todayDate : current));
  }, [selectedTemplate]);

  const createTemplateTasks = React.useCallback(
    async (
      listId: string,
      template: ProjectTemplate,
      projectStartDate: string | null,
      parentId: string | null,
      items = template.starterTasks,
      taskMap = new Map<string, string>()
    ) => {
      for (const item of items) {
        const taskDates = resolveTemplateTaskDates(item, projectStartDate);
        const createdTask = await createTask({
          list_id: listId,
          parent_id: parentId,
          name: item.name,
          status: item.status,
          task_type: item.task_type ?? undefined,
          color: item.color,
          icon: item.icon,
          custom_fields: item.custom_fields,
          start_date: taskDates.start_date,
          end_date: taskDates.end_date,
        });

        taskMap.set(item.id, createdTask.id);

        if (item.children.length > 0) {
          await createTemplateTasks(listId, template, projectStartDate, createdTask.id, item.children, taskMap);
        }
      }

      return taskMap;
    },
    []
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    if (startDate && endDate && startDate > endDate) {
      setError('Project start date must be on or before the end date.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const createdList = await createList({
        space_id: spaceId,
        name: name.trim(),
        color,
        icon,
        start_date: startDate,
        end_date: endDate,
        settings: selectedTemplate?.settings ?? null,
      });

      if (selectedTemplate) {
        const taskMap = await createTemplateTasks(createdList.id, selectedTemplate, startDate, null);
        await Promise.all(
          selectedTemplate.dependencies.map((dependency) => {
            const predecessorId = taskMap.get(dependency.predecessorTemplateTaskId);
            const successorId = taskMap.get(dependency.successorTemplateTaskId);
            if (!predecessorId || !successorId) return Promise.resolve();
            return addDependency(successorId, predecessorId, dependency.dependency_type);
          })
        );
      }

      window.dispatchEvent(new Event('myproplanner:project-settings-updated'));
      await onCreated(createdList.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setSaving(false);
      return;
    }

    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-950/35" onClick={onClose} />
      <div className="relative mx-4 max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-[1.75rem] border border-white/60 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">New Project</p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Create from scratch or use a template</h3>
            <p className="mt-1 text-sm text-slate-500">Templates can preload colors, fields, statuses, saved views, starter tasks, and dependency links.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 p-2 text-slate-500 transition-colors hover:bg-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[calc(92vh-84px)] overflow-y-auto px-6 py-5">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-5">
              {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Project name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Q2 client onboarding"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    autoFocus
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Workspace / space</label>
                  <select
                    value={spaceId}
                    onChange={(e) => setSpaceId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500"
                  >
                    {groupedSpaces.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.spaces.map((space) => (
                          <option key={space.spaceId} value={space.spaceId}>
                            {space.spaceName}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Project start</label>
                  <div className="rounded-xl border border-slate-300 px-3 py-2.5">
                    <DatePicker value={startDate} onChange={setStartDate} placeholder="Set start date" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Project end</label>
                  <div className="rounded-xl border border-slate-300 px-3 py-2.5">
                    <DatePicker value={endDate} onChange={setEndDate} placeholder="Optional end date" />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Color</label>
                <ColorPicker value={color} onChange={setColor} />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Icon</label>
                <IconPicker value={icon} color={color} onChange={setIcon} />
              </div>
            </div>

            <div className="space-y-4 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Template</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500"
                >
                  <option value="">Blank project</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                      {template.isBuiltIn ? ' · Built-in' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedTemplate ? (
                <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-sky-50 p-2 text-sky-700">
                      <Sparkles size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{selectedTemplate.name}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{selectedTemplate.description}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Defaults</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {selectedTemplate.settings.statuses.length} statuses, {selectedTemplate.settings.customFields.length} fields
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Starter work</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {selectedTemplate.starterTasks.length} top-level tasks, {selectedTemplate.dependencies.length} links
                      </p>
                    </div>
                  </div>

                  {selectedTemplate.settings.savedViews.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Saved views</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedTemplate.settings.savedViews.map((view) => (
                          <span key={view.id} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
                            {view.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-500">
                  Blank projects start clean with your chosen name, color, icon, and optional dates.
                </div>
              )}

              <div className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                <div className="flex items-center gap-2 text-slate-900">
                  <Layers size={15} />
                  <span className="font-semibold">Template reuse</span>
                </div>
                <p className="mt-2 leading-6">
                  Save any existing project as a reusable template from its project settings. Those templates show up here automatically.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={14} />
              {saving ? 'Creating...' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProjectModal;
