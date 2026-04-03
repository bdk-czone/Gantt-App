import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

import workspacesRouter from './routes/workspaces';
import spacesRouter from './routes/spaces';
import listsRouter from './routes/lists';
import tasksRouter from './routes/tasks';
import sharesRouter from './routes/shares';
import authRouter from './routes/auth';
import { listResourcesRouter, resourcesRouter } from './routes/resources';
import { requireAuth } from './middleware/requireAuth';
import { ensureSchema } from './ensureSchema';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  ...configuredOrigins,
  ...(isProduction ? [] : ['http://localhost:5173', 'http://localhost:3000']),
]);

// Middleware
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, allowedOrigins.has(origin));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(requireAuth);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api/spaces', spacesRouter);
app.use('/api/lists', listsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/shares', sharesRouter);
app.use('/api/lists', listResourcesRouter);
app.use('/api/resources', resourcesRouter);

const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
const frontendEntryPath = path.join(frontendDistPath, 'index.html');

if (fs.existsSync(frontendEntryPath)) {
  app.use(express.static(frontendDistPath));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(frontendEntryPath);
  });
}

async function start() {
  try {
    await ensureSchema();
    app.listen(PORT, () => {
      console.log(`MyProPlanner backend running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start MyProPlanner backend', error);
    process.exit(1);
  }
}

void start();

export default app;
