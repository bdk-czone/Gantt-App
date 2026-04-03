import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import pool from '../db';

const UPLOADS_DIR = path.resolve(__dirname, '../../../data/uploads');

// Ensure uploads directory exists at startup
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// ── Mounted at /api/lists ─────────────────────────────────────────────────────

export const listResourcesRouter = Router();

// GET /api/lists/:listId/resources
listResourcesRouter.get('/:listId/resources', async (req: Request, res: Response) => {
  try {
    const { listId } = req.params;
    const result = await pool.query(
      'SELECT * FROM project_resources WHERE list_id = $1 ORDER BY created_at ASC',
      [listId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lists/:listId/resources  — add a bookmark link
listResourcesRouter.post('/:listId/resources', async (req: Request, res: Response) => {
  try {
    const { listId } = req.params;
    const { label, url } = req.body as { label?: string; url?: string };

    if (!label || !url) {
      return res.status(400).json({ error: 'label and url are required' });
    }

    const result = await pool.query(
      `INSERT INTO project_resources (list_id, type, label, url)
       VALUES ($1, 'link', $2, $3)
       RETURNING *`,
      [listId, label.trim(), url.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lists/:listId/resources/upload  — upload a file
listResourcesRouter.post('/:listId/resources/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { listId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const label = (req.body as { label?: string }).label?.trim() || file.originalname;

    const result = await pool.query(
      `INSERT INTO project_resources (list_id, type, label, file_name, file_path, file_size, mime_type)
       VALUES ($1, 'file', $2, $3, $4, $5, $6)
       RETURNING *`,
      [listId, label, file.originalname, file.filename, file.size, file.mimetype]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Mounted at /api/resources ─────────────────────────────────────────────────

export const resourcesRouter = Router();

// GET /api/resources/:id/download  — serve a file
resourcesRouter.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT * FROM project_resources WHERE id = $1 AND type = 'file'",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const resource = result.rows[0] as {
      file_path: string;
      file_name: string;
      mime_type: string;
    };
    const filePath = path.join(UPLOADS_DIR, resource.file_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${resource.file_name}"`);
    res.setHeader('Content-Type', resource.mime_type || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/resources/:id/view  — serve a file inline (for in-browser preview)
resourcesRouter.get('/:id/view', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT * FROM project_resources WHERE id = $1 AND type = 'file'",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const resource = result.rows[0] as {
      file_path: string;
      file_name: string;
      mime_type: string;
    };
    const filePath = path.join(UPLOADS_DIR, resource.file_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Disposition', `inline; filename="${resource.file_name}"`);
    res.setHeader('Content-Type', resource.mime_type || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/resources/:id/preview  — convert DOCX to HTML for in-browser preview
resourcesRouter.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT * FROM project_resources WHERE id = $1 AND type = 'file'",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const resource = result.rows[0] as {
      file_path: string;
      file_name: string;
      mime_type: string;
    };

    const isDocx =
      resource.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      (resource.file_name ?? '').toLowerCase().endsWith('.docx');

    if (!isDocx) {
      return res.status(415).json({ error: 'Preview only supported for DOCX files' });
    }

    const filePath = path.join(UPLOADS_DIR, resource.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const mammoth = await import('mammoth');
    const converted = await mammoth.convertToHtml({ path: filePath });
    res.json({ html: converted.value });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/resources/:id
resourcesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM project_resources WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const resource = result.rows[0] as { type: string; file_path: string };
    if (resource.type === 'file' && resource.file_path) {
      const filePath = path.join(UPLOADS_DIR, resource.file_path);
      fs.unlink(filePath, () => {}); // best-effort delete
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
