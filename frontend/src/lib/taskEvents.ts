export const TASKS_MUTATED_EVENT = 'myproplanner:tasks-mutated';

export type TaskMutationSource = 'list-view' | 'gantt-view' | 'agenda';

export interface TaskMutationDetail {
  source: TaskMutationSource;
}

export function emitTasksMutated(source: TaskMutationSource) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<TaskMutationDetail>(TASKS_MUTATED_EVENT, { detail: { source } }));
}
