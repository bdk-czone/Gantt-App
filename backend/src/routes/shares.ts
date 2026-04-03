import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { getTaskTreeForList } from '../lib/taskTree';

const router = Router();

interface ShareRow {
  id: string;
  token: string;
  name: string;
  list_ids: string[];
  created_at: string;
  updated_at: string;
}

interface SharedListRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  folder_id: string | null;
  start_date: string | null;
  end_date: string | null;
  baseline_start_date: string | null;
  baseline_end_date: string | null;
  settings: Record<string, unknown> | null;
  created_at: string;
  space_id: string;
  space_name: string;
  workspace_id: string;
  workspace_name: string;
}

function buildShareName(listNames: string[]) {
  if (listNames.length === 1) return `${listNames[0]} Progress`;
  if (listNames.length === 2) return `${listNames[0]} + ${listNames[1]} Progress`;
  return 'My workload progress';
}

function createShareToken() {
  return crypto.randomBytes(18).toString('base64url');
}

async function getSharedLists(listIds: string[]) {
  if (listIds.length === 0) return [];

  const result = await pool.query<SharedListRow>(
    `SELECT
       l.id,
       l.name,
       l.color,
       l.icon,
       l.folder_id,
       l.start_date,
       l.end_date,
       l.baseline_start_date,
       l.baseline_end_date,
       l.settings,
       l.created_at,
       s.id AS space_id,
       s.name AS space_name,
       w.id AS workspace_id,
       w.name AS workspace_name
     FROM lists l
     JOIN spaces s ON s.id = l.space_id
     JOIN workspaces w ON w.id = s.workspace_id
     WHERE l.id = ANY($1::uuid[])`,
    [listIds]
  );

  const order = new Map(listIds.map((id, index) => [id, index]));
  return result.rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
}

// POST /api/shares/workload
router.post('/workload', async (req: Request, res: Response) => {
  try {
    const rawListIds = Array.isArray(req.body?.list_ids) ? req.body.list_ids : [];
    const listIds = rawListIds.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0);

    if (listIds.length === 0) {
      return res.status(400).json({ error: 'At least one list_id is required' });
    }

    const sharedLists = await getSharedLists(listIds);
    if (sharedLists.length === 0) {
      return res.status(404).json({ error: 'No projects found for the requested workload' });
    }

    const token = createShareToken();
    const name =
      typeof req.body?.name === 'string' && req.body.name.trim().length > 0
        ? req.body.name.trim()
        : buildShareName(sharedLists.map((list) => list.name));

    const result = await pool.query<ShareRow>(
      `INSERT INTO workload_shares (token, name, list_ids, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       RETURNING *`,
      [token, name, JSON.stringify(sharedLists.map((list) => list.id))]
    );

    res.status(201).json({
      id: result.rows[0].id,
      token: result.rows[0].token,
      name: result.rows[0].name,
      list_ids: result.rows[0].list_ids,
      created_at: result.rows[0].created_at,
      updated_at: result.rows[0].updated_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/shares/public/:token
router.get('/public/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const shareResult = await pool.query<ShareRow>('SELECT * FROM workload_shares WHERE token = $1', [token]);

    if (shareResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shared workload not found' });
    }

    const share = shareResult.rows[0];
    const listIds = Array.isArray(share.list_ids) ? share.list_ids : [];
    const sharedLists = await getSharedLists(listIds);

    const sections = await Promise.all(
      sharedLists.map(async (list) => ({
        target: {
          listId: list.id,
          listName: list.name,
          listColor: list.color,
          listIcon: list.icon,
          folderId: list.folder_id,
          startDate: list.start_date,
          endDate: list.end_date,
          baselineStartDate: list.baseline_start_date,
          baselineEndDate: list.baseline_end_date,
          listSettings: list.settings,
          spaceId: list.space_id,
          spaceName: list.space_name,
          workspaceId: list.workspace_id,
          workspaceName: list.workspace_name,
          createdAt: list.created_at,
        },
        ...(await getTaskTreeForList(list.id)),
      }))
    );

    res.json({
      share: {
        id: share.id,
        token: share.token,
        name: share.name,
        createdAt: share.created_at,
        updatedAt: share.updated_at,
      },
      sections,
      refreshedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
