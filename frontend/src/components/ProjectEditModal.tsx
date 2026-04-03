import React from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { CustomFieldDefinition, List as ProjectList, StatusOption } from '../types';
import { getTaskTree, updateList } from '../api';
import { CUSTOM_FIELD_TYPE_OPTIONS } from '../lib/customFields';
import { buildProjectTemplateFromProject, saveProjectTemplate } from '../lib/projectTemplates';
import {
  DEFAULT_COLUMN_LABELS,
  DEFAULT_STATUSES,
  normalizeProjectSettings,
  parseProjectDateValue,
  resolveProjectSchedule,
} from '../lib/projectSettings';
import ColorPicker from './ColorPicker';
import DatePicker from './DatePicker';
import IconPicker from './IconPicker';

interface SpaceOption {
  workspaceId: string;
  workspaceName: string;
  spaceId: string;
  spaceName: string;
}

interface ProjectEditModalProps {
  project: ProjectList;
  spaceOptions: SpaceOption[];
  onClose: () => void;
  onSaved: () => void;
}

function toMachineValue(label: string) {
  return label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'CUSTOM_STATUS';
}

const ProjectEditModal: React.FC<ProjectEditModalProps> = ({
  project,
  spaceOptions,
  onClose,
  onSaved,
}) => {
  const initialSettings = React.useMemo(() => normalizeProjectSettings(project.settings), [project.settings]);
  const initialSchedule = React.useMemo(
    () => resolveProjectSchedule(project.start_date, project.end_date, project.settings),
    [project.end_date, project.settings, project.start_date]
  );
  const initialColumnLabels = React.useMemo(
    () =>
      Object.fromEntries(
        Object.entries(initialSettings.columnLabels).map(([key, value]) => {
          if ((key === 'start_date' || key === 'end_date') && parseProjectDateValue(value)) {
            return [key, DEFAULT_COLUMN_LABELS[key] || key];
          }
          return [key, value];
        })
      ),
    [initialSettings.columnLabels]
  );
  const [name, setName] = React.useState(project.name);
  const [targetSpaceId, setTargetSpaceId] = React.useState(project.space_id);
  const [color, setColor] = React.useState(project.color || '#2563EB');
  const [icon, setIcon] = React.useState(project.icon || 'folder-kanban');
  const [startDate, setStartDate] = React.useState(initialSchedule.startDate);
  const [endDate, setEndDate] = React.useState(initialSchedule.endDate);
  const [notes, setNotes] = React.useState(initialSettings.notes ?? '');
  const [statuses, setStatuses] = React.useState<StatusOption[]>(initialSettings.statuses);
  const [customFields, setCustomFields] = React.useState<CustomFieldDefinition[]>(initialSettings.customFields);
  const [columnLabels, setColumnLabels] = React.useState<Record<string, string>>(initialColumnLabels);
  const [saving, setSaving] = React.useState(false);
  const [savingTemplate, setSavingTemplate] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError(null);

    if (startDate && endDate && startDate > endDate) {
      setError('Project start date must be on or before the end date.');
      setSaving(false);
      return;
    }

    try {
      const sanitizedColumnLabels = Object.fromEntries(
        Object.entries(columnLabels).map(([key, value]) => {
          const trimmedValue = value.trim() || DEFAULT_COLUMN_LABELS[key] || key;
          if ((key === 'start_date' || key === 'end_date') && parseProjectDateValue(trimmedValue)) {
            return [key, DEFAULT_COLUMN_LABELS[key] || key];
          }
          return [key, trimmedValue];
        })
      );

      await updateList(project.id, {
        name: name.trim(),
        space_id: targetSpaceId,
        folder_id: targetSpaceId === project.space_id ? project.folder_id : null,
        color,
        icon,
        start_date: startDate,
        end_date: endDate,
        settings: {
          ...initialSettings,
          notes: notes.trim() || undefined,
          columnOrder: initialSettings.columnOrder,
          savedViews: initialSettings.savedViews,
          statuses:
            statuses
              .filter((status) => status.label.trim())
              .map((status) => ({
                ...status,
                value: toMachineValue(status.label),
              })) || DEFAULT_STATUSES,
          customFields: customFields
            .filter((field) => field.name.trim())
            .map((field) => ({
              ...field,
              options:
                field.type === 'select'
                  ? (field.options ?? []).filter((option) => option.trim())
                  : undefined,
            })),
          columnLabels: sanitizedColumnLabels,
          hiddenBuiltInColumns: initialSettings.hiddenBuiltInColumns,
          builtInColumnTypes: initialSettings.builtInColumnTypes,
          viewPersistence: initialSettings.viewPersistence,
        },
      });
      window.dispatchEvent(new Event('myproplanner:project-settings-updated'));
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project');
      setSaving(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    const templateName = window.prompt('Template name', `${name.trim() || project.name} template`);
    if (!templateName?.trim()) return;

    setSavingTemplate(true);
    setError(null);

    try {
      const projectTree = await getTaskTree(project.id);
      saveProjectTemplate(
        buildProjectTemplateFromProject({
          projectName: templateName.trim(),
          color,
          icon,
          projectStartDate: startDate,
          settings: {
            ...initialSettings,
            columnOrder: initialSettings.columnOrder,
            savedViews: initialSettings.savedViews,
            statuses:
              statuses
                .filter((status) => status.label.trim())
                .map((status) => ({
                  ...status,
                  value: toMachineValue(status.label),
                })) || DEFAULT_STATUSES,
            customFields: customFields
              .filter((field) => field.name.trim())
              .map((field) => ({
                ...field,
                options:
                  field.type === 'select'
                    ? (field.options ?? []).filter((option) => option.trim())
                    : undefined,
              })),
            columnLabels: Object.fromEntries(
              Object.entries(columnLabels).map(([key, value]) => [key, value.trim() || DEFAULT_COLUMN_LABELS[key] || key])
            ),
            hiddenBuiltInColumns: initialSettings.hiddenBuiltInColumns,
            builtInColumnTypes: initialSettings.builtInColumnTypes,
            viewPersistence: initialSettings.viewPersistence,
          },
          tasks: projectTree.tasks,
          dependencies: projectTree.dependencies,
          description: `Template captured from ${project.name}.`,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mx-4 max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">Project Settings</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-5">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Project Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Workspace / Space</label>
                <select
                  value={targetSpaceId}
                  onChange={(e) => setTargetSpaceId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
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
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Project Start</label>
                <div className="rounded-lg border border-gray-300 px-3 py-2">
                  <DatePicker value={startDate} onChange={setStartDate} placeholder="Set start date" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Project End</label>
                <div className="rounded-lg border border-gray-300 px-3 py-2">
                  <DatePicker value={endDate} onChange={setEndDate} placeholder="Set end date" />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-600">Color</label>
              <ColorPicker value={color} onChange={setColor} />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-600">Icon</label>
              <IconPicker value={icon} color={color} onChange={setIcon} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Project Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Add any general info, context, or notes about this project…"
                className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </section>

          <section className="space-y-3 border-t border-gray-100 pt-5">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Column Labels</h4>
              <p className="text-xs text-gray-500">Rename the built-in columns used in List and Gantt views.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(DEFAULT_COLUMN_LABELS).map(([key, defaultLabel]) => (
                <div key={key}>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                    {key === 'gantt_task' ? 'Gantt task column' : defaultLabel}
                  </label>
                  <input
                    value={columnLabels[key] ?? defaultLabel}
                    onChange={(e) =>
                      setColumnLabels((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder={defaultLabel}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Statuses</h4>
                <p className="text-xs text-gray-500">Customize the status values available for tasks in this project.</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setStatuses((prev) => [
                    ...prev,
                    { value: `CUSTOM_${prev.length + 1}`, label: 'New Status', color: '#2563EB' },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50"
              >
                <Plus size={12} />
                Add status
              </button>
            </div>

            <div className="space-y-3">
              {statuses.map((status, index) => (
                <div key={`${status.value}-${index}`} className="rounded-xl border border-gray-200 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <input
                      value={status.label}
                      onChange={(e) =>
                        setStatuses((prev) =>
                          prev.map((current, currentIndex) =>
                            currentIndex === index ? { ...current, label: e.target.value } : current
                          )
                        )
                      }
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      placeholder="Status name"
                    />
                    <button
                      type="button"
                      onClick={() => setStatuses((prev) => prev.filter((_, currentIndex) => currentIndex !== index))}
                      className="rounded p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      title="Remove status"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <ColorPicker
                    value={status.color}
                    onChange={(nextColor) =>
                      setStatuses((prev) =>
                        prev.map((current, currentIndex) =>
                          currentIndex === index ? { ...current, color: nextColor } : current
                        )
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Custom Task Fields</h4>
                <p className="text-xs text-gray-500">Add text, number, date, or select fields to the task table and editor.</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setCustomFields((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      name: 'New Field',
                      type: 'text',
                    },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50"
              >
                <Plus size={12} />
                Add field
              </button>
            </div>

            <div className="space-y-3">
              {customFields.map((field, index) => (
                <div key={field.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_auto]">
                    <input
                      value={field.name}
                      onChange={(e) =>
                        setCustomFields((prev) =>
                          prev.map((current, currentIndex) =>
                            currentIndex === index ? { ...current, name: e.target.value } : current
                          )
                        )
                      }
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      placeholder="Field name"
                    />
                    <select
                      value={field.type}
                      onChange={(e) =>
                        setCustomFields((prev) =>
                          prev.map((current, currentIndex) =>
                            currentIndex === index
                              ? {
                                  ...current,
                                  type: e.target.value as CustomFieldDefinition['type'],
                                  options:
                                    e.target.value === 'select'
                                      ? current.options && current.options.length > 0
                                        ? current.options
                                        : ['Option 1']
                                      : undefined,
                                }
                              : current
                          )
                        )
                      }
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                    >
                      {CUSTOM_FIELD_TYPE_OPTIONS.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setCustomFields((prev) => prev.filter((_, currentIndex) => currentIndex !== index))}
                      className="rounded p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      title="Remove field"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {field.type === 'select' && (
                    <div className="mt-3">
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                        Options
                      </label>
                      <input
                        value={(field.options ?? []).join(', ')}
                        onChange={(e) =>
                          setCustomFields((prev) =>
                            prev.map((current, currentIndex) =>
                              currentIndex === index
                                ? {
                                    ...current,
                                    options: e.target.value
                                      .split(',')
                                      .map((option) => option.trim())
                                      .filter(Boolean),
                                  }
                                : current
                            )
                          )
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        placeholder="Option 1, Option 2, Option 3"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => void handleSaveAsTemplate()}
              disabled={savingTemplate}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingTemplate ? 'Saving Template...' : 'Save as Template'}
            </button>
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
              {saving ? 'Saving...' : 'Save Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjectEditModal;
