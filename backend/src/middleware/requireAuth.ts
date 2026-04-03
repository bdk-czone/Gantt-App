import { Request, Response, NextFunction } from 'express';
import pool from '../db';

// API paths that are open without a session
const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/shares/public/',
];

function getCookieToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const match = header.match(/(?:^|;\s*)mpp_session=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Only enforce auth on API routes
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  // Auth routes and public share route are always open
  if (PUBLIC_API_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    next();
    return;
  }

  const token = getCookieToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const result = await pool.query(
      'SELECT id FROM sessions WHERE token = $1 AND expires_at > NOW()',
      [token]
    );
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Session expired' });
      return;
    }
    next();
  } catch (err) {
    console.error('requireAuth error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
