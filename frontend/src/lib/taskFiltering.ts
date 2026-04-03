import type { Task } from '../types';

export function filterTaskTree(tasks: Task[], predicate: (task: Task) => boolean): Task[] {
  const nextTasks: Task[] = [];

  for (const task of tasks) {
    const filteredChildren = filterTaskTree(task.children, predicate);
    if (predicate(task) || filteredChildren.length > 0) {
      nextTasks.push({
        ...task,
        children: filteredChildren,
      });
    }
  }

  return nextTasks;
}

export function countTasks(tasks: Task[]): number {
  return tasks.reduce((sum, task) => sum + 1 + countTasks(task.children), 0);
}
