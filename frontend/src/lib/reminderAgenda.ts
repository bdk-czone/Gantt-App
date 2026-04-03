import { getList, getTaskTree } from '../api';
import type { ProjectSettings, SelectedListTarget, Task } from '../types';
import { isCompletedStatus, resolveProjectSchedule } from './projectSettings';
import { getPriorityRank, getTaskPriorityLabel, getTaskReminderAt, getTaskReminderNote } from './taskReminders';

export interface ReminderAgendaTaskItem {
  task: Task;
  reminderAt: string;
  note: string | null;
  priorityLabel: string | null;
  projectSettings: ProjectSettings | null;
}

export interface ReminderAgendaProjectGroup {
  target: SelectedListTarget;
  projectSettings: ProjectSettings | null;
  tasks: ReminderAgendaTaskItem[];
}

export interface DueReminderNotification {
  id: string;
  taskId: string;
  listId: string;
  taskName: string;
  listName: string;
  workspaceName: string;
  spaceName: string;
  reminderAt: string;
  note: string | null;
}

export function flattenTasks(tasks: Task[], result: Task[] = []) {
  for (const task of tasks) {
    result.push(task);
    if (task.children.length > 0) {
      flattenTasks(task.children, result);
    }
  }
  return result;
}

export function compareReminderDates(left: string, right: string) {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return left.localeCompare(right);
  if (Number.isNaN(leftTime)) return 1;
  if (Number.isNaN(rightTime)) return -1;
  return leftTime - rightTime;
}

export async function loadReminderAgendaGroups(selectedLists: SelectedListTarget[]): Promise<ReminderAgendaProjectGroup[]> {
  if (selectedLists.length === 0) return [];

  const nextGroups = await Promise.all(
    selectedLists.map(async (target) => {
      const [data, list] = await Promise.all([getTaskTree(target.listId), getList(target.listId)]);
      const schedule = resolveProjectSchedule(list.start_date, list.end_date, list.settings);
      const projectTarget: SelectedListTarget = {
        ...target,
        listName: list.name,
        listColor: list.color,
        listIcon: list.icon,
        folderId: list.folder_id,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        baselineStartDate: list.baseline_start_date,
        baselineEndDate: list.baseline_end_date,
        listSettings: list.settings,
        spaceId: list.space_id,
        createdAt: list.created_at,
      };

      const reminderTasks = flattenTasks(data.tasks)
        .map((task) => {
          const reminderAt = getTaskReminderAt(task);
          if (!reminderAt) return null;

          return {
            task,
            reminderAt,
            note: getTaskReminderNote(task),
            priorityLabel: getTaskPriorityLabel(task, list.settings),
            projectSettings: list.settings,
          } satisfies ReminderAgendaTaskItem;
        })
        .filter((task): task is ReminderAgendaTaskItem => task !== null)
        .sort((left, right) => {
          const leftCompleted = isCompletedStatus(left.task.status, left.projectSettings);
          const rightCompleted = isCompletedStatus(right.task.status, right.projectSettings);
          if (leftCompleted !== rightCompleted) return leftCompleted ? 1 : -1;

          const rankDiff = getPriorityRank(left.priorityLabel) - getPriorityRank(right.priorityLabel);
          if (rankDiff !== 0) return rankDiff;

          const reminderDiff = compareReminderDates(left.reminderAt, right.reminderAt);
          if (reminderDiff !== 0) return reminderDiff;

          return left.task.name.localeCompare(right.task.name);
        });

      return {
        target: projectTarget,
        projectSettings: list.settings,
        tasks: reminderTasks,
      } satisfies ReminderAgendaProjectGroup;
    })
  );

  return nextGroups.filter((group) => group.tasks.length > 0);
}

export function buildReminderNotificationId(taskId: string, reminderAt: string) {
  return `${taskId}:${reminderAt}`;
}

export function getDueReminderNotifications(groups: ReminderAgendaProjectGroup[], nowMs = Date.now()): DueReminderNotification[] {
  return groups
    .flatMap((group) =>
      group.tasks
        .filter((item) => {
          if (isCompletedStatus(item.task.status, item.projectSettings)) return false;
          const reminderMs = new Date(item.reminderAt).getTime();
          if (Number.isNaN(reminderMs)) return false;
          return reminderMs <= nowMs;
        })
        .map((item) => ({
          id: buildReminderNotificationId(item.task.id, item.reminderAt),
          taskId: item.task.id,
          listId: group.target.listId,
          taskName: item.task.name,
          listName: group.target.listName,
          workspaceName: group.target.workspaceName,
          spaceName: group.target.spaceName,
          reminderAt: item.reminderAt,
          note: item.note,
        }))
    )
    .sort((left, right) => compareReminderDates(left.reminderAt, right.reminderAt));
}
