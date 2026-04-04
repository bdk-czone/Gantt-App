import React from 'react';
import {
  AlarmClock,
  Bell,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type NotePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface StickyNoteData {
  id: string;
  title: string;
  content: string;
  priority: NotePriority;
  color: string;
  reminderAt: string | null; // ISO datetime string
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'myproplanner:sticky-notes:v1';

const PRIORITY_CONFIG: Record<NotePriority, { label: string; dot: string; badge: string }> = {
  low:    { label: 'Low',    dot: 'bg-gray-400',  badge: 'bg-gray-100 text-gray-600' },
  medium: { label: 'Medium', dot: 'bg-blue-500',  badge: 'bg-blue-100 text-blue-700' },
  high:   { label: 'High',   dot: 'bg-orange-500',badge: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', dot: 'bg-red-500',   badge: 'bg-red-100 text-red-700' },
};

const NOTE_COLORS = [
  { value: '#FEF9C3', label: 'Yellow' },
  { value: '#DCFCE7', label: 'Green' },
  { value: '#DBEAFE', label: 'Blue' },
  { value: '#FCE7F3', label: 'Pink' },
  { value: '#EDE9FE', label: 'Purple' },
  { value: '#FEE2E2', label: 'Red' },
  { value: '#F1F5F9', label: 'Gray' },
];

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadNotes(): StickyNoteData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StickyNoteData[]) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: StickyNoteData[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function generateId() {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Note Form Modal ───────────────────────────────────────────────────────────

interface NoteFormProps {
  initial?: Partial<StickyNoteData>;
  onSave: (data: Omit<StickyNoteData, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}

const NoteForm: React.FC<NoteFormProps> = ({ initial, onSave, onCancel }) => {
  const [title, setTitle] = React.useState(initial?.title ?? '');
  const [content, setContent] = React.useState(initial?.content ?? '');
  const [priority, setPriority] = React.useState<NotePriority>(initial?.priority ?? 'medium');
  const [color, setColor] = React.useState(initial?.color ?? NOTE_COLORS[0].value);
  const [reminderAt, setReminderAt] = React.useState(
    initial?.reminderAt ? initial.reminderAt.slice(0, 16) : ''
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      content: content.trim(),
      priority,
      color,
      reminderAt: reminderAt ? new Date(reminderAt).toISOString() : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <span className="text-sm font-semibold text-gray-800">
            {initial?.title ? 'Edit Note' : 'New Note'}
          </span>
          <button onClick={onCancel} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
            />
          </div>

          {/* Content */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your note..."
              rows={4}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Priority</label>
            <div className="flex gap-2">
              {(Object.keys(PRIORITY_CONFIG) as NotePriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-xs font-medium transition-all ${
                    priority === p
                      ? `${PRIORITY_CONFIG[p].badge} border-current`
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${PRIORITY_CONFIG[p].dot}`} />
                  {PRIORITY_CONFIG[p].label}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Color</label>
            <div className="flex gap-1.5">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setColor(c.value)}
                  style={{ backgroundColor: c.value }}
                  className={`h-6 w-6 rounded-full border-2 transition-all ${
                    color === c.value ? 'border-indigo-500 scale-110' : 'border-transparent hover:border-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Reminder */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
              <AlarmClock size={11} />
              Reminder (optional)
            </label>
            <input
              type="datetime-local"
              value={reminderAt}
              onChange={(e) => setReminderAt(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main Panel ────────────────────────────────────────────────────────────────

const StickyNotesPanel: React.FC = () => {
  const [notes, setNotes] = React.useState<StickyNoteData[]>(loadNotes);
  const [expanded, setExpanded] = React.useState(true);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingNote, setEditingNote] = React.useState<StickyNoteData | null>(null);

  // Reminder notification check
  React.useEffect(() => {
    const check = () => {
      const now = new Date();
      notes.forEach((note) => {
        if (!note.reminderAt) return;
        const reminderDate = new Date(note.reminderAt);
        const diff = reminderDate.getTime() - now.getTime();
        // Fire within a 1-minute window
        if (diff > 0 && diff <= 60_000) {
          setTimeout(() => {
            if (Notification.permission === 'granted') {
              new Notification(`Reminder: ${note.title}`, {
                body: note.content || undefined,
              });
            } else {
              alert(`Reminder: ${note.title}${note.content ? `\n${note.content}` : ''}`);
            }
          }, diff);
        }
      });
    };

    // Request permission once
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }

    check();
  }, [notes]);

  const persist = (updated: StickyNoteData[]) => {
    setNotes(updated);
    saveNotes(updated);
  };

  const handleSave = (data: Omit<StickyNoteData, 'id' | 'createdAt'>) => {
    if (editingNote) {
      persist(notes.map((n) => (n.id === editingNote.id ? { ...editingNote, ...data } : n)));
      setEditingNote(null);
    } else {
      const newNote: StickyNoteData = {
        id: generateId(),
        createdAt: new Date().toISOString(),
        ...data,
      };
      persist([newNote, ...notes]);
      setFormOpen(false);
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this note?')) return;
    persist(notes.filter((n) => n.id !== id));
  };

  const overdueOrSoon = (reminderAt: string | null) => {
    if (!reminderAt) return false;
    const diff = new Date(reminderAt).getTime() - Date.now();
    return diff < 3_600_000; // within 1 hour or overdue
  };

  const sortedNotes = [...notes].sort((a, b) => {
    const order: Record<NotePriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    return order[a.priority] - order[b.priority];
  });

  return (
    <>
      {/* Panel */}
      <div className="border-t border-gray-200">
        {/* Header row */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 transition-colors"
        >
          {expanded ? (
            <ChevronDown size={12} className="flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronRight size={12} className="flex-shrink-0 text-gray-400" />
          )}
          <StickyNote size={12} className="flex-shrink-0 text-amber-500" />
          <span className="min-w-0 flex-1 text-xs font-semibold text-gray-700">Notes</span>
          {notes.length > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              {notes.length}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFormOpen(true);
            }}
            className="rounded p-0.5 text-gray-400 hover:bg-amber-100 hover:text-amber-600 transition-colors"
            title="New note"
          >
            <Plus size={12} />
          </button>
        </button>

        {/* Note list */}
        {expanded && (
          <div className="max-h-52 overflow-y-auto pb-1">
            {sortedNotes.length === 0 ? (
              <p className="px-4 py-2 text-[11px] text-gray-400">No notes yet. Click + to add one.</p>
            ) : (
              sortedNotes.map((note) => {
                const cfg = PRIORITY_CONFIG[note.priority];
                const isUrgent = overdueOrSoon(note.reminderAt);
                return (
                  <div
                    key={note.id}
                    className="group/note mx-2 mb-1 rounded-lg border border-black/5 px-2.5 py-2 text-[11px]"
                    style={{ backgroundColor: note.color }}
                  >
                    <div className="flex items-start gap-1.5">
                      <span className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${cfg.dot}`} title={cfg.label} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-tight text-gray-800 truncate">{note.title}</p>
                        {note.content && (
                          <p className="mt-0.5 leading-snug text-gray-600 line-clamp-2">{note.content}</p>
                        )}
                        {note.reminderAt && (
                          <p className={`mt-1 flex items-center gap-0.5 ${isUrgent ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            <Bell size={9} />
                            {new Date(note.reminderAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 opacity-0 group-hover/note:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingNote(note)}
                          className="rounded p-0.5 text-gray-500 hover:bg-white/60 hover:text-gray-700"
                          title="Edit note"
                        >
                          <Pencil size={10} />
                        </button>
                        <button
                          onClick={() => handleDelete(note.id)}
                          className="rounded p-0.5 text-gray-500 hover:bg-white/60 hover:text-red-600"
                          title="Delete note"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* New note form */}
      {formOpen && (
        <NoteForm
          onSave={handleSave}
          onCancel={() => setFormOpen(false)}
        />
      )}

      {/* Edit note form */}
      {editingNote && (
        <NoteForm
          initial={editingNote}
          onSave={handleSave}
          onCancel={() => setEditingNote(null)}
        />
      )}
    </>
  );
};

export default StickyNotesPanel;
