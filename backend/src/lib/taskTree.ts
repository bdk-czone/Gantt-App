import pool from '../db';

export interface TaskRow {
  id: string;
  list_id: string;
  parent_id: string | null;
  name: string;
  status: string;
  task_type: string | null;
  color: string | null;
  icon: string | null;
  custom_fields: Record<string, unknown>;
  start_date: string | null;
  end_date: string | null;
  baseline_start_date: string | null;
  baseline_end_date: string | null;
  onboarding_completion: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  depth: number;
}

export interface TaskNode extends TaskRow {
  children: TaskNode[];
}

export interface DependencyRow {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: string;
}

export function buildTree(rows: TaskRow[]): TaskNode[] {
  const map = new Map<string, TaskNode>();
  const roots: TaskNode[] = [];

  for (const row of rows) {
    map.set(row.id, { ...row, children: [] });
  }

  for (const row of rows) {
    const node = map.get(row.id)!;
    if (row.parent_id === null) {
      roots.push(node);
      continue;
    }

    const parent = map.get(row.parent_id);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function getTaskTreeForList(listId: string) {
  const taskResult = await pool.query<TaskRow>(
    `WITH RECURSIVE task_tree AS (
      SELECT *, 0 as depth FROM tasks WHERE list_id = $1 AND parent_id IS NULL
      UNION ALL
      SELECT t.*, tt.depth + 1 FROM tasks t
      JOIN task_tree tt ON t.parent_id = tt.id
    )
    SELECT * FROM task_tree ORDER BY depth, position, created_at`,
    [listId]
  );

  const depResult = await pool.query<DependencyRow>(
    `SELECT td.*
     FROM task_dependencies td
     WHERE EXISTS (
       SELECT 1 FROM tasks predecessor
       WHERE predecessor.id = td.predecessor_id
         AND predecessor.list_id = $1
     )
     AND EXISTS (
       SELECT 1 FROM tasks successor
       WHERE successor.id = td.successor_id
         AND successor.list_id = $1
     )`,
    [listId]
  );

  return {
    tasks: buildTree(taskResult.rows),
    dependencies: depResult.rows,
  };
}
