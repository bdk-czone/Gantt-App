import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/lists/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM lists WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'List not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lists
router.post('/', async (req: Request, res: Response) => {
  try {
    const { space_id, folder_id, name, color, icon, start_date, end_date, baseline_start_date, baseline_end_date, settings } = req.body;

    if (!space_id || !name) {
      return res.status(400).json({ error: 'space_id and name are required' });
    }

    if (start_date && end_date && start_date > end_date) {
      return res.status(400).json({ error: 'Project start date must be on or before the end date' });
    }
    if (baseline_start_date && baseline_end_date && baseline_start_date > baseline_end_date) {
      return res.status(400).json({ error: 'Project baseline start date must be on or before the baseline end date' });
    }

    const result = await pool.query(
      'INSERT INTO lists (space_id, folder_id, name, color, icon, start_date, end_date, baseline_start_date, baseline_end_date, settings) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [
        space_id,
        folder_id || null,
        name,
        color || null,
        icon || null,
        start_date || null,
        end_date || null,
        baseline_start_date || null,
        baseline_end_date || null,
        settings || {},
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/lists/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, space_id, folder_id, color, icon, start_date, end_date, baseline_start_date, baseline_end_date, settings } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    const currentResult = await pool.query('SELECT start_date, end_date, baseline_start_date, baseline_end_date FROM lists WHERE id = $1', [id]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'List not found' });
    }

    const effectiveStartDate = start_date !== undefined ? start_date || null : currentResult.rows[0].start_date;
    const effectiveEndDate = end_date !== undefined ? end_date || null : currentResult.rows[0].end_date;
    const effectiveBaselineStartDate =
      baseline_start_date !== undefined ? baseline_start_date || null : currentResult.rows[0].baseline_start_date;
    const effectiveBaselineEndDate =
      baseline_end_date !== undefined ? baseline_end_date || null : currentResult.rows[0].baseline_end_date;

    if (effectiveStartDate && effectiveEndDate && effectiveStartDate > effectiveEndDate) {
      return res.status(400).json({ error: 'Project start date must be on or before the end date' });
    }
    if (
      effectiveBaselineStartDate &&
      effectiveBaselineEndDate &&
      effectiveBaselineStartDate > effectiveBaselineEndDate
    ) {
      return res.status(400).json({ error: 'Project baseline start date must be on or before the baseline end date' });
    }

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (space_id !== undefined) {
      updates.push(`space_id = $${paramCount++}`);
      values.push(space_id);
    }
    if (folder_id !== undefined) {
      updates.push(`folder_id = $${paramCount++}`);
      values.push(folder_id || null);
    }
    if (color !== undefined) {
      updates.push(`color = $${paramCount++}`);
      values.push(color || null);
    }
    if (icon !== undefined) {
      updates.push(`icon = $${paramCount++}`);
      values.push(icon || null);
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
    if (settings !== undefined) {
      updates.push(`settings = $${paramCount++}`);
      values.push(settings || {});
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE lists SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/lists/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM lists WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'List not found' });
    }

    res.json({ message: 'List deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
