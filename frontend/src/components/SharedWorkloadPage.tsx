import React from 'react';
import { CalendarDays, ExternalLink, FolderKanban, Link2, RefreshCw } from 'lucide-react';
import { getSharedWorkload } from '../api';
import { formatCompactDate } from '../lib/dateFormat';
import { getStatusOption, isCompletedStatus, normalizeProjectSettings } from '../lib/projectSettings';
import type { SelectedListTarget, SharedWorkloadResponse, Task } from '../types';
import StatusPill from './StatusPill';

const REFRESH_INTERVAL_MS = 30000;

function flattenTasks(tasks: Task[], result: Array<Task & { depthLevel: number }> = [], depthLevel = 0) {
  for (const task of tasks) {
    result.push({ ...task, depthLevel });
    if (task.children.length > 0) {
      flattenTasks(task.children, result, depthLevel + 1);
    }
  }
  return result;
}

function getTaskProgress(task: Task) {
  const value = task.custom_fields?.progress;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

function buildSectionSummary(target: SelectedListTarget, tasks: Task[]) {
  const settings = normalizeProjectSettings(target.listSettings);
  const flatTasks = flattenTasks(tasks);
  const completedTasks = flatTasks.filter((task) => isCompletedStatus(task.status, settings)).length;
  const overdueTasks = flatTasks.filter(
    (task) =>
      Boolean(task.end_date) &&
      (task.end_date as string) < new Date().toISOString().slice(0, 10) &&
      !isCompletedStatus(task.status, settings)
  ).length;
  const progressValues = flatTasks.map((task) => {
    if (isCompletedStatus(task.status, settings)) return 100;
    return getTaskProgress(task) ?? 0;
  });
  const averageProgress =
    progressValues.length > 0
      ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length)
      : 0;

  return {
    totalTasks: flatTasks.length,
    completedTasks,
    overdueTasks,
    averageProgress,
  };
}

interface SharedWorkloadPageProps {
  token: string;
}

const SharedWorkloadPage: React.FC<SharedWorkloadPageProps> = ({ token }) => {
  const [data, setData] = React.useState<SharedWorkloadResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadSharedWorkload = React.useCallback(
    async (background = false) => {
      if (background) setRefreshing(true);
      else setLoading(true);

      try {
        const response = await getSharedWorkload(token);
        setData(response);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shared workload');
      } finally {
        if (background) setRefreshing(false);
        else setLoading(false);
      }
    },
    [token]
  );

  React.useEffect(() => {
    void loadSharedWorkload();
  }, [loadSharedWorkload]);

  React.useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadSharedWorkload(true);
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadSharedWorkload]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600 shadow-sm">
          <RefreshCw size={16} className="animate-spin" />
          Loading shared workload...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-[1.75rem] border border-red-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">Share Link</p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">Unable to open this workload</h1>
          <p className="mt-3 text-sm text-slate-500">{error || 'This shared view is no longer available.'}</p>
        </div>
      </div>
    );
  }

  const overallTasks = data.sections.flatMap((section) => flattenTasks(section.tasks));
  const overallCompleted = data.sections.reduce(
    (sum, section) => sum + buildSectionSummary(section.target, section.tasks).completedTasks,
    0
  );
  const overallAverageProgress =
    data.sections.length > 0
      ? Math.round(
          data.sections.reduce((sum, section) => sum + buildSectionSummary(section.target, section.tasks).averageProgress, 0) /
            data.sections.length
        )
      : 0;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-slate-200 bg-white/92 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                <Link2 size={12} />
                Read-only live view
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{data.share.name}</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                This page refreshes automatically every 30 seconds and shows the latest project workload progress.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadSharedWorkload(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
                Refresh now
              </button>
              <a
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <ExternalLink size={15} />
                Open planner
              </a>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Projects</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{data.sections.length}</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total tasks</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{overallTasks.length}</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Completed</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{overallCompleted}</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Average progress</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{overallAverageProgress}%</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span>Last refresh: {formatCompactDate(data.refreshedAt)}</span>
            <span>Link created: {formatCompactDate(data.share.createdAt)}</span>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          {data.sections.map((section) => {
            const summary = buildSectionSummary(section.target, section.tasks);
            const flatTasks = flattenTasks(section.tasks);
            const settings = normalizeProjectSettings(section.target.listSettings);

            return (
              <section
                key={section.target.listId}
                className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
              >
                <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-white"
                          style={{ backgroundColor: section.target.listColor || '#2563EB' }}
                        >
                          <FolderKanban size={16} />
                        </span>
                        <div className="min-w-0">
                          <h2 className="truncate text-xl font-semibold text-slate-900">{section.target.listName}</h2>
                          <p className="truncate text-sm text-slate-500">
                            {section.target.workspaceName} / {section.target.spaceName}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                        {summary.totalTasks} tasks
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                        {summary.completedTasks} completed
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                        {summary.averageProgress}% progress
                      </span>
                      {summary.overdueTasks > 0 && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
                          {summary.overdueTasks} overdue
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-white">
                      <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        <th className="px-5 py-3">Task</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Progress</th>
                        <th className="px-5 py-3">Dates</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {flatTasks.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-5 py-6 text-sm text-slate-400">
                            No tasks in this project yet.
                          </td>
                        </tr>
                      ) : (
                        flatTasks.map((task) => {
                          const progress = getTaskProgress(task);
                          const statusOption = getStatusOption(task.status, settings);

                          return (
                            <tr key={task.id} className="align-top">
                              <td className="px-5 py-3">
                                <div style={{ paddingLeft: `${task.depthLevel * 18}px` }}>
                                  <p className="text-sm font-medium text-slate-900">{task.name}</p>
                                  {task.task_type && <p className="mt-0.5 text-xs text-slate-500 capitalize">{task.task_type}</p>}
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <StatusPill status={task.status} options={settings.statuses} />
                              </td>
                              <td className="px-5 py-3">
                                <div className="min-w-[9rem]">
                                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${progress ?? (isCompletedStatus(task.status, settings) ? 100 : 0)}%`,
                                        backgroundColor: statusOption.color,
                                      }}
                                    />
                                  </div>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {progress !== null ? `${progress}%` : isCompletedStatus(task.status, settings) ? '100%' : 'Not set'}
                                  </p>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-sm text-slate-600">
                                <div className="inline-flex items-center gap-2">
                                  <CalendarDays size={14} className="text-slate-400" />
                                  <span>
                                    {task.start_date ? formatCompactDate(task.start_date) : 'No start'} to{' '}
                                    {task.end_date ? formatCompactDate(task.end_date) : 'No end'}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SharedWorkloadPage;
