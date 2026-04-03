import React from 'react';
import { BellRing, CalendarDays, ExternalLink, X } from 'lucide-react';
import { formatCompactDate } from '../lib/dateFormat';
import type { DueReminderNotification } from '../lib/reminderAgenda';

interface ReminderToastStackProps {
  notifications: DueReminderNotification[];
  onDismiss: (id: string) => void;
  onOpenAgenda: () => void;
}

const ReminderToastStack: React.FC<ReminderToastStackProps> = ({ notifications, onDismiss, onOpenAgenda }) => {
  if (notifications.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-24 z-[95] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-3">
      {notifications.slice(0, 4).map((notification) => (
        <div
          key={notification.id}
          className="pointer-events-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <div className="flex items-start gap-3 px-4 py-3">
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
              <BellRing size={16} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{notification.taskName}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{notification.listName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(notification.id)}
                  className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  title="Dismiss notification"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                <CalendarDays size={12} />
                <span>{formatCompactDate(notification.reminderAt)}</span>
              </div>

              {notification.note && (
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                  {notification.note}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="truncate text-[11px] text-slate-400">
                  {notification.workspaceName} / {notification.spaceName}
                </p>
                <button
                  type="button"
                  onClick={onOpenAgenda}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <ExternalLink size={12} />
                  Open agenda
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ReminderToastStack;
