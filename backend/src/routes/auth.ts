import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pool from '../db';

const router = Router();
const SESSION_HOURS = 24;
const COOKIE_NAME = 'mpp_session';

function getCookieToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const match = header.match(/(?:^|;\s*)mpp_session=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function getConfig(): Promise<{ passkey_hash: string | null } | null> {
  const result = await pool.query<{ passkey_hash: string | null }>(
    'SELECT passkey_hash FROM app_config WHERE id = 1'
  );
  return result.rows[0] ?? null;
}

async function createSession(): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await pool.query('INSERT INTO sessions (token, expires_at) VALUES ($1, $2)', [token, expiresAt]);
  return { token, expiresAt };
}

// GET /api/auth/status — checked on every app load
router.get('/status', async (req: Request, res: Response) => {
  try {
    const config = await getConfig();

    if (!config || config.passkey_hash === null) {
      return res.json({ authenticated: false, needsSetup: true });
    }

    const token = getCookieToken(req);
    if (!token) return res.json({ authenticated: false, needsSetup: false });

    const result = await pool.query(
      'SELECT id FROM sessions WHERE token = $1 AND expires_at > NOW()',
      [token]
    );
    res.json({ authenticated: result.rows.length > 0, needsSetup: false });
  } catch (err) {
    console.error('auth/status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/setup — first-run only, sets the initial passkey
router.post('/setup', async (req: Request, res: Response) => {
  try {
    const { passkey } = req.body as { passkey?: unknown };
    if (typeof passkey !== 'string' || passkey.length < 4) {
      return res.status(400).json({ error: 'Passkey must be at least 4 characters' });
    }

    const config = await getConfig();
    if (config && config.passkey_hash !== null) {
      return res.status(403).json({ error: 'Passkey already configured. Use change-passkey instead.' });
    }

    const hash = await bcrypt.hash(passkey, 12);
    await pool.query(
      `INSERT INTO app_config (id, passkey_hash, updated_at) VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET passkey_hash = $1, updated_at = NOW()`,
      [hash]
    );

    const { token, expiresAt } = await createSession();
    res
      .cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', expires: expiresAt })
      .json({ ok: true });
  } catch (err) {
    console.error('auth/setup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { passkey } = req.body as { passkey?: unknown };
    if (typeof passkey !== 'string') {
      return res.status(400).json({ error: 'Passkey required' });
    }

    const config = await getConfig();
    if (!config || config.passkey_hash === null) {
      return res.status(403).json({ error: 'App not configured yet. Use setup first.' });
    }

    const valid = await bcrypt.compare(passkey, config.passkey_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect passkey' });
    }

    const { token, expiresAt } = await createSession();
    res
      .cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', expires: expiresAt })
      .json({ ok: true });
  } catch (err) {
    console.error('auth/login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const token = getCookieToken(req);
    if (token) {
      await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    }
    // Also clean up expired sessions opportunistically
    await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()');
    res.clearCookie(COOKIE_NAME).json({ ok: true });
  } catch (err) {
    console.error('auth/logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/change-passkey — requires active session + current passkey
router.post('/change-passkey', async (req: Request, res: Response) => {
  try {
    const token = getCookieToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const sessionResult = await pool.query(
      'SELECT id FROM sessions WHERE token = $1 AND expires_at > NOW()',
      [token]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const { currentPasskey, newPasskey } = req.body as {
      currentPasskey?: unknown;
      newPasskey?: unknown;
    };
    if (typeof currentPasskey !== 'string' || typeof newPasskey !== 'string') {
      return res.status(400).json({ error: 'currentPasskey and newPasskey are required' });
    }
    if (newPasskey.length < 4) {
      return res.status(400).json({ error: 'New passkey must be at least 4 characters' });
    }

    const config = await getConfig();
    if (!config || config.passkey_hash === null) {
      return res.status(403).json({ error: 'App not configured' });
    }

    const valid = await bcrypt.compare(currentPasskey, config.passkey_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current passkey is incorrect' });
    }

    const newHash = await bcrypt.hash(newPasskey, 12);
    await pool.query(
      'UPDATE app_config SET passkey_hash = $1, updated_at = NOW() WHERE id = 1',
      [newHash]
    );

    // Invalidate all other sessions (keeps current session alive)
    await pool.query('DELETE FROM sessions WHERE token != $1', [token]);

    res.json({ ok: true });
  } catch (err) {
    console.error('auth/change-passkey error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
