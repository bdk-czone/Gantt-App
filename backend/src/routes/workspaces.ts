import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/workspaces - List all workspaces with their spaces
router.get('/', async (_req: Request, res: Response) => {
  try {
    const workspacesResult = await pool.query(
      'SELECT * FROM workspaces ORDER BY created_at ASC'
    );

    const spacesResult = await pool.query(
      'SELECT * FROM spaces ORDER BY created_at ASC'
    );

    const workspaces = workspacesResult.rows.map((ws) => ({
      ...ws,
      spaces: spacesResult.rows.filter((s) => s.workspace_id === ws.id),
    }));

    res.json(workspaces);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/workspaces/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM workspaces WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const spacesResult = await pool.query(
      'SELECT * FROM spaces WHERE workspace_id = $1 ORDER BY created_at ASC',
      [id]
    );

    res.json({ ...result.rows[0], spaces: spacesResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/workspaces
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await pool.query(
      'INSERT INTO workspaces (name) VALUES ($1) RETURNING *',
      [name]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/workspaces/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await pool.query(
      'UPDATE workspaces SET name = $1 WHERE id = $2 RETURNING *',
      [name, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/workspaces/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM workspaces WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json({ message: 'Workspace deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
