import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/spaces - List all spaces
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM spaces ORDER BY created_at ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/spaces/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM spaces WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Space not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/spaces/:spaceId/lists - Get lists in a space (including those in folders)
router.get('/:spaceId/lists', async (req: Request, res: Response) => {
  try {
    const { spaceId } = req.params;

    const listsResult = await pool.query(
      `SELECT l.*, f.name as folder_name
       FROM lists l
       LEFT JOIN folders f ON l.folder_id = f.id
       WHERE l.space_id = $1
       ORDER BY l.created_at ASC`,
      [spaceId]
    );

    const foldersResult = await pool.query(
      'SELECT * FROM folders WHERE space_id = $1 ORDER BY created_at ASC',
      [spaceId]
    );

    res.json({
      lists: listsResult.rows,
      folders: foldersResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/spaces
router.post('/', async (req: Request, res: Response) => {
  try {
    const { workspace_id, name } = req.body;

    if (!workspace_id || !name) {
      return res.status(400).json({ error: 'workspace_id and name are required' });
    }

    const result = await pool.query(
      'INSERT INTO spaces (workspace_id, name) VALUES ($1, $2) RETURNING *',
      [workspace_id, name]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/spaces/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await pool.query(
      'UPDATE spaces SET name = $1 WHERE id = $2 RETURNING *',
      [name, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Space not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/spaces/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM spaces WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Space not found' });
    }

    res.json({ message: 'Space deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
