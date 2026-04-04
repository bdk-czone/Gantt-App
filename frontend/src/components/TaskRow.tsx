import React from 'react';
import { ChevronDown, ChevronRight, Edit2, Plus, Trash2 } from 'lucide-react';
import type { BuiltInColumnEditorType, CustomFieldValue, StatusOption, Task } from '../types';
import { formatCompactDate } from '../lib/dateFormat';
import { EntityIcon, getAppearanceColor } from '../lib/appearance';
import DatePicker from './DatePicker';
import StatusPill from './StatusPill';
import type { ListColumnConfig } from './listColumns';

function parseProgressInput(value: unknown) {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return Math.max(0, Math.min(100, value));
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/%$/, '');
    if (!normalized) return null;
    const parsed = Number(normalized);
    if (!Number.isNaN(parsed)) {
      return Math.max(0, Math.min(100, parsed));
    }
  }

  return null;
}

const ProgressEditor: React.FC<{
  value: string;
  onValueChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}> = ({ value, onValueChange, onCommit, onCancel, inputRef }) => {
  const numericValue = parseProgressInput(value) ?? 0;

  return (
    <div
      className="flex items-center gap-2"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={numericValue}
        onChange={(event) => onValueChange(event.target.value)}
        onPointerUp={() => onCommit()}
        className="min-w-0 flex-1 accent-blue-600"
      />
      <div className="relative w-16 shrink-0">
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onCommit();
            if (event.key === 'Escape') onCancel();
          }}
          className="w-full rounded border border-blue-300 px-2 py-1 pr-5 text-xs outline-none focus:border-blue-500"
          placeholder="0"
          autoFocus
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
          %
        </span>
      </div>
    </div>
  );
};

interface TaskRowProps {
  task: Task;
  depth: number;
  projectColor: string | null;
  projectIcon: string | null;
  statusOptions: StatusOption[];
  builtInColumnTypes?: Partial<Record<string, BuiltInColumnEditorType>>;
  columns: ListColumnConfig[];
  onUpdate: (id: string, data: Partial<Task>) => void;
  onAddStatusOption?: (task: Task, option: StatusOption) => Promise<void>;
  onEditStatusOption?: (task: Task, value: string, updates: Pick<StatusOption, 'label' | 'color'>) => Promise<void>;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (task: Task) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onContextMenu: (task: Task, x: number, y: number) => void;
}

const TaskRow: React.FC<TaskRowProps> = ({
  task,
  depth,
  projectColor,
  projectIcon,
  statusOptions,
  builtInColumnTypes,
  columns,
  onUpdate,
  onAddStatusOption,
  onEditStatusOption,
  onDelete,
  onAddChild,
  onEdit,
  expandedIds,
  onToggleExpand,
  onContextMenu,
}) => {
  const [editingName, setEditingName] = React.useState(false);
  const [nameValue, setNameValue] = React.useState(task.name);
  const [editingType, setEditingType] = React.useState(false);
  const [typeValue, setTypeValue] = React.useState(task.task_type || '');
  const [editingOnboardingText, setEditingOnboardingText] = React.useState(false);
  const [editingOnboardingProgress, setEditingOnboardingProgress] = React.useState(false);
  const [editingCustomProgressFieldId, setEditingCustomProgressFieldId] = React.useState<string | null>(null);
  const [customProgressValue, setCustomProgressValue] = React.useState('');
  const [onboardingTextValue, setOnboardingTextValue] = React.useState(
    typeof task.custom_fields?.onboarding_completion_text === 'string' ? task.custom_fields.onboarding_completion_text : ''
  );
  const [onboardingProgressValue, setOnboardingProgressValue] = React.useState(() => {
    const currentValue = parseProgressInput(task.custom_fields?.onboarding_completion_progress);
    return currentValue === null ? '' : String(currentValue);
  });
  const [hovered, setHovered] = React.useState(false);
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const onboardingInputRef = React.useRef<HTMLInputElement>(null);
  const onboardingProgressInputRef = React.useRef<HTMLInputElement>(null);
  const customProgressInputRef = React.useRef<HTMLInputElement>(null);

  const isExpanded = expandedIds.has(task.id);
  const hasChildren = task.children.length > 0;
  const isProject = task.task_type === 'project';
  const indentPx = depth * 20;
  const fallbackIcon = isProject ? projectIcon || 'briefcase' : 'circle-dot';
  const iconColor = getAppearanceColor(
    projectColor,
    getAppearanceColor(task.color, isProject ? '#F59E0B' : '#94A3B8')
  );

  const saveName = () => {
    if (nameValue.trim() && nameValue !== task.name) {
      onUpdate(task.id, { name: nameValue.trim() });
    } else {
      setNameValue(task.name);
    }
    setEditingName(false);
  };

  const saveType = () => {
    if (typeValue !== (task.task_type || '')) {
      onUpdate(task.id, { task_type: typeValue || null });
    }
    setEditingType(false);
  };

  React.useEffect(() => {
    setOnboardingTextValue(
      typeof task.custom_fields?.onboarding_completion_text === 'string' ? task.custom_fields.onboarding_completion_text : ''
    );
    const currentProgress = parseProgressInput(task.custom_fields?.onboarding_completion_progress);
    setOnboardingProgressValue(currentProgress === null ? '' : String(currentProgress));
  }, [task.custom_fields]);

  const saveOnboardingText = () => {
    const trimmedValue = onboardingTextValue.trim();
    const nextCustomFields = { ...task.custom_fields };
    if (trimmedValue) {
      nextCustomFields.onboarding_completion_text = trimmedValue;
    } else {
      delete nextCustomFields.onboarding_completion_text;
    }
    onUpdate(task.id, {
      onboarding_completion: null,
      custom_fields: nextCustomFields,
    });
    setEditingOnboardingText(false);
  };

  const saveOnboardingProgress = () => {
    const trimmedValue = onboardingProgressValue.trim();
    const parsedValue = trimmedValue ? parseProgressInput(trimmedValue) : null;
    if (trimmedValue && parsedValue === null) {
      const fallbackProgress = parseProgressInput(task.custom_fields?.onboarding_completion_progress);
      setOnboardingProgressValue(fallbackProgress === null ? '' : String(fallbackProgress));
      setEditingOnboardingProgress(false);
      return;
    }

    const nextCustomFields = { ...task.custom_fields };
    if (parsedValue === null) {
      delete nextCustomFields.onboarding_completion_progress;
    } else {
      nextCustomFields.onboarding_completion_progress = parsedValue;
    }

    onUpdate(task.id, {
      onboarding_completion: null,
      custom_fields: nextCustomFields,
    });
    setEditingOnboardingProgress(false);
  };


  const startCustomProgressEditing = (fieldId: string, value: CustomFieldValue) => {
    const parsedValue = parseProgressInput(value);
    setEditingCustomProgressFieldId(fieldId);
    setCustomProgressValue(parsedValue === null ? '' : String(parsedValue));
    setTimeout(() => customProgressInputRef.current?.select(), 10);
  };

  const saveCustomProgress = (fieldId: string, previousValue: CustomFieldValue) => {
    const trimmedValue = customProgressValue.trim();
    if (!trimmedValue) {
      updateCustomFieldValue(fieldId, null);
      setEditingCustomProgressFieldId(null);
      return;
    }

    const parsedValue = parseProgressInput(trimmedValue);
    if (parsedValue === null) {
      const fallbackValue = parseProgressInput(previousValue);
      setCustomProgressValue(fallbackValue === null ? '' : String(fallbackValue));
      setEditingCustomProgressFieldId(null);
      return;
    }

    updateCustomFieldValue(fieldId, parsedValue);
    setEditingCustomProgressFieldId(null);
  };

  const visibleColumns = columns.filter((column) => column.visible);

  const getBuiltInColumnType = (key: string): BuiltInColumnEditorType => {
    if (key === 'status') return builtInColumnTypes?.status ?? 'status_bar';
    if (key === 'start_date') return builtInColumnTypes?.start_date ?? 'start_date';
    if (key === 'end_date') return builtInColumnTypes?.end_date ?? 'end_date';
    if (key === 'onboarding_completion') return builtInColumnTypes?.onboarding_completion ?? 'date';
    return builtInColumnTypes?.[key] ?? 'text';
  };

  const updateCustomFieldValue = (fieldId: string, value: CustomFieldValue) => {
    const nextCustomFields = { ...task.custom_fields };
    if (value === null || value === undefined || value === '') {
      delete nextCustomFields[fieldId];
    } else {
      nextCustomFields[fieldId] = value;
    }
    onUpdate(task.id, { custom_fields: nextCustomFields });
  };

  const renderProgressValue = (value: number | null) => {
    const hasValue = typeof value === 'number' && !Number.isNaN(value);
    const progress = hasValue ? Math.max(0, Math.min(100, value)) : 0;
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-200">
          <span
            className={`block h-full rounded-full transition-[width] ${hasValue ? 'bg-blue-500' : 'bg-gray-300'}`}
            style={{ width: `${progress}%` }}
          />
        </span>
        <span className={`shrink-0 text-[11px] font-medium ${hasValue ? 'text-gray-500' : 'text-gray-400'}`}>
          {hasValue ? `${progress}%` : 'Set'}
        </span>
      </span>
    );
  };

  const renderCustomValue = (value: CustomFieldValue, columnFieldType?: string) => {
    if (columnFieldType === 'date') {
      return formatCompactDate(typeof value === 'string' ? value : null) || <span className="text-gray-300">-</span>;
    }

    if (columnFieldType === 'checkbox') {
      return value === true ? (
        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Yes</span>
      ) : (
        <span className="text-gray-300">-</span>
      );
    }

    if (columnFieldType === 'progress') {
      return renderProgressValue(parseProgressInput(value));
    }

    if (columnFieldType === 'url' && typeof value === 'string' && value.trim()) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="text-xs text-blue-600 underline-offset-2 hover:underline"
        >
          Open link
        </a>
      );
    }

    if (value !== null && value !== undefined && value !== '') {
      return String(value);
    }

    return <span className="text-gray-300">-</span>;
  };

  return (
    <>
      <tr
        className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${hovered ? 'bg-gray-50' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={() => onEdit(task)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(task, e.clientX, e.clientY);
        }}
      >
        {visibleColumns.map((column) => {
          const columnType =
            column.kind === 'builtin' && column.key
              ? getBuiltInColumnType(column.key)
              : column.field?.type ?? 'text';

          if (column.kind === 'builtin' && column.key === 'name') {
            return (
              <td key={column.id} className="px-3 py-1.5" style={{ paddingLeft: `${12 + indentPx}px` }}>
                <div className="flex min-w-0 items-center gap-1">
                  <button
                    onClick={() => hasChildren && onToggleExpand(task.id)}
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded transition-colors hover:bg-gray-200 ${
                      hasChildren ? 'cursor-pointer text-gray-500' : 'cursor-default text-transparent'
                    }`}
                  >
                    {hasChildren ? (
                      isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                    ) : (
                      <span className="w-3" />
                    )}
                  </button>

                  <span className="flex-shrink-0">
                    <EntityIcon icon={task.icon} fallbackIcon={fallbackIcon} color={iconColor} size={13} />
                  </span>

                  {editingName ? (
                    <input
                      ref={nameInputRef}
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      onBlur={saveName}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveName();
                        if (e.key === 'Escape') {
                          setNameValue(task.name);
                          setEditingName(false);
                        }
                      }}
                      className="min-w-0 flex-1 rounded border border-blue-300 px-1 py-0.5 text-sm outline-none focus:border-blue-500"
                      autoFocus
                    />
                  ) : (
                    <span
                      onClick={() => {
                        setEditingName(true);
                        setTimeout(() => nameInputRef.current?.select(), 10);
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      className={`flex-1 cursor-text truncate text-sm ${
                        isProject ? 'font-semibold text-gray-800' : 'text-gray-700'
                      }`}
                      title={task.name}
                    >
                      {task.name}
                    </span>
                  )}

                  {hovered && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(task);
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className="ml-1 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
                        title="Edit task"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddChild(task.id);
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className="rounded p-0.5 text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700"
                        title="Add subtask"
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(task.id);
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className="rounded p-0.5 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-500"
                        title="Delete task"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </td>
            );
          }

          if (column.kind === 'builtin' && column.key === 'status') {
            return (
              <td key={column.id} className="px-3 py-1.5">
                <StatusPill
                  status={task.status}
                  options={statusOptions}
                  editable
                  onChange={(status) => onUpdate(task.id, { status })}
                  onAddOption={onAddStatusOption ? (option) => onAddStatusOption(task, option) : undefined}
                  onEditOption={onEditStatusOption ? (value, updates) => onEditStatusOption(task, value, updates) : undefined}
                />
              </td>
            );
          }

          if (column.kind === 'builtin' && column.key === 'start_date') {
            return (
              <td key={column.id} className="px-3 py-1.5">
                <DatePicker
                  value={task.start_date}
                  onChange={(start_date) => onUpdate(task.id, { start_date })}
                  placeholder="Start date"
                />
              </td>
            );
          }

          if (column.kind === 'builtin' && column.key === 'end_date') {
            return (
              <td key={column.id} className="px-3 py-1.5">
                <DatePicker
                  value={task.end_date}
                  onChange={(end_date) => onUpdate(task.id, { end_date })}
                  placeholder="End date"
                />
              </td>
            );
          }

          if (column.kind === 'builtin' && column.key === 'onboarding_completion') {
            if (columnType === 'text') {
              return (
                <td key={column.id} className="px-3 py-1.5">
                  {editingOnboardingText ? (
                    <input
                      ref={onboardingInputRef}
                      value={onboardingTextValue}
                      onChange={(e) => setOnboardingTextValue(e.target.value)}
                      onBlur={saveOnboardingText}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveOnboardingText();
                        if (e.key === 'Escape') {
                          setOnboardingTextValue(
                            typeof task.custom_fields?.onboarding_completion_text === 'string'
                              ? task.custom_fields.onboarding_completion_text
                              : ''
                          );
                          setEditingOnboardingText(false);
                        }
                      }}
                      className="w-full rounded border border-blue-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
                      placeholder={column.label}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingOnboardingText(true);
                        setTimeout(() => onboardingInputRef.current?.focus(), 10);
                      }}
                      className="w-full text-left text-xs text-gray-600 transition-colors hover:text-blue-600"
                    >
                      {typeof task.custom_fields?.onboarding_completion_text === 'string' && task.custom_fields.onboarding_completion_text.trim() ? (
                        <span className="text-gray-700">{task.custom_fields.onboarding_completion_text}</span>
                      ) : (
                        <span className="text-gray-400 hover:text-blue-400">{column.label}</span>
                      )}
                    </button>
                  )}
                </td>
              );
            }
            if (columnType === 'progress') {
              return (
                <td key={column.id} className="px-3 py-1.5">
                  {editingOnboardingProgress ? (
                    <ProgressEditor
                      inputRef={onboardingProgressInputRef}
                      value={onboardingProgressValue}
                      onValueChange={setOnboardingProgressValue}
                      onCommit={saveOnboardingProgress}
                      onCancel={() => {
                        const fallbackValue = parseProgressInput(task.custom_fields?.onboarding_completion_progress);
                        setOnboardingProgressValue(fallbackValue === null ? '' : String(fallbackValue));
                        setEditingOnboardingProgress(false);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentValue = parseProgressInput(task.custom_fields?.onboarding_completion_progress);
                        setOnboardingProgressValue(currentValue === null ? '' : String(currentValue));
                        setEditingOnboardingProgress(true);
                        setTimeout(() => onboardingProgressInputRef.current?.select(), 10);
                      }}
                      className="w-full text-left text-xs text-gray-600 transition-colors hover:text-blue-600"
                    >
                      {renderProgressValue(parseProgressInput(task.custom_fields?.onboarding_completion_progress))}
                    </button>
                  )}
                </td>
              );
            }
            if (columnType === 'status' || columnType === 'status_bar') {
              return (
                <td key={column.id} className="px-3 py-1.5">
                  <StatusPill
                    status={task.status}
                    options={statusOptions}
                    editable
                    onChange={(status) => onUpdate(task.id, { status })}
                    onAddOption={onAddStatusOption ? (option) => onAddStatusOption(task, option) : undefined}
                    onEditOption={onEditStatusOption ? (value, updates) => onEditStatusOption(task, value, updates) : undefined}
                  />
                </td>
              );
            }
            if (columnType === 'start_date') {
              return (
                <td key={column.id} className="px-3 py-1.5">
                  <DatePicker
                    value={task.start_date}
                    onChange={(start_date) => onUpdate(task.id, { start_date })}
                    placeholder={column.label}
                  />
                </td>
              );
            }
            if (columnType === 'end_date') {
              return (
                <td key={column.id} className="px-3 py-1.5">
                  <DatePicker
                    value={task.end_date}
                    onChange={(end_date) => onUpdate(task.id, { end_date })}
                    placeholder={column.label}
                  />
                </td>
              );
            }
            return (
              <td key={column.id} className="px-3 py-1.5">
                <DatePicker
                  value={task.onboarding_completion}
                  onChange={(onboarding_completion) => onUpdate(task.id, { onboarding_completion })}
                  placeholder={column.label}
                />
              </td>
            );
          }

          if (column.kind === 'builtin' && column.key === 'task_type') {
            return (
              <td key={column.id} className="px-3 py-1.5">
                {editingType ? (
                  <input
                    value={typeValue}
                    onChange={(e) => setTypeValue(e.target.value)}
                    onBlur={saveType}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveType();
                      if (e.key === 'Escape') {
                        setTypeValue(task.task_type || '');
                        setEditingType(false);
                      }
                    }}
                    className="w-24 rounded border border-blue-300 px-1 py-0.5 text-xs outline-none focus:border-blue-500"
                    autoFocus
                  />
                ) : (
                  <span
                    onClick={() => setEditingType(true)}
                    className="cursor-text text-xs text-gray-500 hover:text-gray-700"
                  >
                    {task.task_type || <span className="text-gray-300">-</span>}
                  </span>
                )}
              </td>
            );
          }

          const value =
            column.field?.type === 'status' || column.field?.type === 'status_bar'
              ? task.status
              : column.field?.type === 'start_date'
                ? task.start_date
                : column.field?.type === 'end_date'
                  ? task.end_date
                  : column.field
                    ? task.custom_fields?.[column.field.id]
                    : null;
          const isUrlField = column.field?.type === 'url' && typeof value === 'string' && value.trim();

          if (column.field?.type === 'status' || column.field?.type === 'status_bar') {
            return (
              <td key={column.id} className="px-3 py-1.5">
                <StatusPill
                  status={task.status}
                  options={statusOptions}
                  editable
                  onChange={(status) => onUpdate(task.id, { status })}
                  onAddOption={onAddStatusOption ? (option) => onAddStatusOption(task, option) : undefined}
                  onEditOption={onEditStatusOption ? (nextValue, updates) => onEditStatusOption(task, nextValue, updates) : undefined}
                />
              </td>
            );
          }

          if (column.field?.type === 'start_date') {
            return (
              <td key={column.id} className="px-3 py-1.5">
                <DatePicker
                  value={task.start_date}
                  onChange={(start_date) => onUpdate(task.id, { start_date })}
                  placeholder={column.label}
                />
              </td>
            );
          }

          if (column.field?.type === 'end_date') {
            return (
              <td key={column.id} className="px-3 py-1.5">
                <DatePicker
                  value={task.end_date}
                  onChange={(end_date) => onUpdate(task.id, { end_date })}
                  placeholder={column.label}
                />
              </td>
            );
          }

          if (column.field?.type === 'date') {
            return (
              <td key={column.id} className="px-3 py-1.5">
                <DatePicker
                  value={typeof value === 'string' ? value : null}
                  onChange={(nextValue) => updateCustomFieldValue(column.field!.id, nextValue)}
                  placeholder={column.label}
                />
              </td>
            );
          }

          if (column.field?.type === 'checkbox') {
            return (
              <td key={column.id} className="px-3 py-1.5">
                <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={value === true}
                    onChange={(e) => updateCustomFieldValue(column.field!.id, e.target.checked ? true : null)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {value === true ? 'Enabled' : 'Off'}
                </label>
              </td>
            );
          }

          if (column.field?.type === 'progress') {
            const progressValue = parseProgressInput(value);
            const isEditingProgress = editingCustomProgressFieldId === column.field.id;

            return (
              <td key={column.id} className="px-3 py-1.5">
                {isEditingProgress ? (
                  <ProgressEditor
                    inputRef={customProgressInputRef}
                    value={customProgressValue}
                    onValueChange={setCustomProgressValue}
                    onCommit={() => saveCustomProgress(column.field!.id, value)}
                    onCancel={() => {
                      const fallbackValue = parseProgressInput(value);
                      setCustomProgressValue(fallbackValue === null ? '' : String(fallbackValue));
                      setEditingCustomProgressFieldId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startCustomProgressEditing(column.field!.id, value);
                    }}
                    className="w-full text-left text-xs text-gray-600 transition-colors hover:text-blue-600"
                  >
                    {renderProgressValue(progressValue)}
                  </button>
                )}
              </td>
            );
          }

          return (
            <td key={column.id} className="px-3 py-1.5">
              {isUrlField ? (
                <div className="text-xs text-gray-600">{renderCustomValue(value, column.field?.type)}</div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(task);
                  }}
                  className="w-full text-left text-xs text-gray-600 transition-colors hover:text-blue-600"
                >
                  {renderCustomValue(value, column.field?.type)}
                </button>
              )}
            </td>
          );
        })}
      </tr>

      {hasChildren &&
        isExpanded &&
        task.children.map((child) => (
          <TaskRow
            key={child.id}
            task={child}
            depth={depth + 1}
            projectColor={projectColor}
            projectIcon={projectIcon}
            statusOptions={statusOptions}
            builtInColumnTypes={builtInColumnTypes}
            columns={columns}
            onUpdate={onUpdate}
            onAddStatusOption={onAddStatusOption}
            onEditStatusOption={onEditStatusOption}
            onDelete={onDelete}
            onAddChild={onAddChild}
            onEdit={onEdit}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
            onContextMenu={onContextMenu}
          />
        ))}
    </>
  );
};

export default TaskRow;
