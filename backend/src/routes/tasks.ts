import { Router, Request, Response } from 'express';
import pool from '../db';
import { getTaskTreeForList } from '../lib/taskTree';

const router = Router();

// GET /api/lists/:listId/tasks/tree - Returns nested task tree
router.get('/lists/:listId/tasks/tree', async (req: Request, res: Response) => {
  try {
    const { listId } = req.params;
    res.json(await getTaskTreeForList(listId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/:id - Get single task
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks - Create task
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      list_id,
      parent_id,
      name,
      status,
      task_type,
      color,
      icon,
      custom_fields,
      start_date,
      end_date,
      baseline_start_date,
      baseline_end_date,
      onboarding_completion,
      position,
    } = req.body;

    if (!list_id || !name) {
      return res.status(400).json({ error: 'list_id and name are required' });
    }

    // Get position if not provided
    let taskPosition = position;
    if (taskPosition === undefined || taskPosition === null) {
      const posResult = await pool.query(
        'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM tasks WHERE list_id = $1 AND parent_id IS NOT DISTINCT FROM $2',
        [list_id, parent_id || null]
      );
      taskPosition = posResult.rows[0].next_pos;
    }

    const result = await pool.query(
      `INSERT INTO tasks (list_id, parent_id, name, status, task_type, color, icon, custom_fields, start_date, end_date, baseline_start_date, baseline_end_date, onboarding_completion, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        list_id,
        parent_id || null,
        name,
        status || 'NOT_STARTED',
        task_type || null,
        color || null,
        icon || null,
        custom_fields || {},
        start_date || null,
        end_date || null,
        baseline_start_date || null,
        baseline_end_date || null,
        onboarding_completion || null,
        taskPosition,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tasks/:id - Update task (inline editing)
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      status,
      task_type,
      color,
      icon,
      custom_fields,
      start_date,
      end_date,
      baseline_start_date,
      baseline_end_date,
      onboarding_completion,
      position,
      parent_id,
      list_id,
    } = req.body;

    // Build dynamic update query for the root task
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (task_type !== undefined) {
      updates.push(`task_type = $${paramCount++}`);
      values.push(task_type);
    }
    if (color !== undefined) {
      updates.push(`color = $${paramCount++}`);
      values.push(color || null);
    }
    if (icon !== undefined) {
      updates.push(`icon = $${paramCount++}`);
      values.push(icon || null);
    }
    if (custom_fields !== undefined) {
      updates.push(`custom_fields = $${paramCount++}`);
      values.push(custom_fields || {});
    }
    if (start_date !== undefined) {
      updates.push(`start_date = $${paramCount++}`);
      values.push(start_date || null);
    }
    if (end_date !== undefined) {
      updates.push(`end_date = $${paramCount++}`);
      values.push(end_date || null);
    }
    if (baseline_start_date !== undefined) {
      updates.push(`baseline_start_date = $${paramCount++}`);
      values.push(baseline_start_date || null);
    }
    if (baseline_end_date !== undefined) {
      updates.push(`baseline_end_date = $${paramCount++}`);
      values.push(baseline_end_date || null);
    }
    if (onboarding_completion !== undefined) {
      updates.push(`onboarding_completion = $${paramCount++}`);
      values.push(onboarding_completion || null);
    }
    if (position !== undefined) {
      updates.push(`position = $${paramCount++}`);
      values.push(position);
    }
    if (parent_id !== undefined) {
      updates.push(`parent_id = $${paramCount++}`);
      values.push(parent_id || null);
    }

    // If moving to a different list, update this task + all descendants atomically
    if (list_id !== undefined) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Move all descendants to the new list
        await client.query(
          `WITH RECURSIVE descendants AS (
            SELECT id FROM tasks WHERE id = $1
            UNION ALL
            SELECT t.id FROM tasks t JOIN descendants d ON t.parent_id = d.id
          )
          UPDATE tasks SET list_id = $2, parent_id = CASE WHEN id = $1 THEN NULL ELSE parent_id END, updated_at = NOW()
          WHERE id IN (SELECT id FROM descendants)`,
          [id, list_id]
        );
        // Also apply any other field changes to the root task
        if (updates.length > 0) {
          updates.push(`updated_at = NOW()`);
          values.push(id);
          await client.query(
            `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramCount}`,
            values
          );
        }
        await client.query('COMMIT');
        const result = await client.query('SELECT * FROM tasks WHERE id = $1', [id]);
        return res.json(result.rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id - Delete task (cascades to children via DB)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks/:id/dependencies - Add dependency
router.post('/:id/dependencies', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { predecessor_id } = req.body;

    // id is the successor, predecessor_id is the predecessor
    const successorId = id;
    const predecessorId = predecessor_id;

    if (!predecessorId) {
      return res.status(400).json({ error: 'predecessor_id is required' });
    }

    // Check for circular dependency
    const circularCheck = await pool.query(
      `WITH RECURSIVE dep_check AS (
        SELECT successor_id as id FROM task_dependencies WHERE predecessor_id = $1
        UNION ALL
        SELECT td.successor_id FROM task_dependencies td
        JOIN dep_check dc ON td.predecessor_id = dc.id
      )
      SELECT id FROM dep_check WHERE id = $2`,
      [successorId, predecessorId]
    );

    if (circularCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Circular dependency detected' });
    }

    const result = await pool.query(
      `INSERT INTO task_dependencies (predecessor_id, successor_id, dependency_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (predecessor_id, successor_id) DO UPDATE SET dependency_type = $3
       RETURNING *`,
      [predecessorId, successorId, 'FS']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id/dependencies/:depId - Remove dependency
router.delete('/:id/dependencies/:depId', async (req: Request, res: Response) => {
  try {
    const { depId } = req.params;

    const result = await pool.query(
      'DELETE FROM task_dependencies WHERE id = $1 RETURNING *',
      [depId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dependency not found' });
    }

    res.json({ message: 'Dependency removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
