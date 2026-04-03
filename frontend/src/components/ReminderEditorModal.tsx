import React from 'react';
import { Bell, Trash2, X } from 'lucide-react';
import type { Task } from '../types';
import {
  fromReminderInputValues,
  getTaskReminderAt,
  getTaskReminderNote,
  toReminderDateInputValue,
  toReminderTimeInputValue,
} from '../lib/taskReminders';

interface ReminderEditorModalProps {
  task: Task;
  onClose: () => void;
  onSave: (details: { reminderAt: string | null; note: string | null }) => Promise<void> | void;
}

const ReminderEditorModal: React.FC<ReminderEditorModalProps> = ({ task, onClose, onSave }) => {
  const reminderAt = getTaskReminderAt(task);
  const [dateValue, setDateValue] = React.useState(() => toReminderDateInputValue(reminderAt));
  const [timeValue, setTimeValue] = React.useState(() => toReminderTimeInputValue(reminderAt));
  const [noteValue, setNoteValue] = React.useState(() => getTaskReminderNote(task) ?? '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handlePersist = async (nextValue: { reminderAt: string | null; note: string | null }) => {
    try {
      setSaving(true);
      setError(null);
      await onSave(nextValue);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save reminder');
      setSaving(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if ((dateValue.trim() && !timeValue.trim()) || (!dateValue.trim() && timeValue.trim())) {
      setError('Please set both a reminder date and a 24-hour time.');
      return;
    }

    await handlePersist({
      reminderAt: fromReminderInputValues(dateValue, timeValue),
      note: noteValue.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-blue-600" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">Task Reminder</h3>
              <p className="text-xs text-slate-500">{task.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Reminder</label>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="date"
                value={dateValue}
                onChange={(event) => setDateValue(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <input
                type="time"
                step={60}
                value={timeValue}
                onChange={(event) => setTimeValue(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Set a date and a 24-hour time. Tasks with reminders appear in the Agenda sidebar and stay visible there even after you mark them complete.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Reminder Note</label>
            <textarea
              value={noteValue}
              onChange={(event) => setNoteValue(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Add an optional reminder note..."
            />
            <p className="mt-2 text-xs text-slate-500">
              This is free text for the reminder itself. Clearing the reminder removes this note, but it does not delete the task.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                void handlePersist({
                  reminderAt: null,
                  note: null,
                })
              }
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={14} />
              Clear reminder only
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save reminder'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReminderEditorModal;
