import pool from './db';

const SCHEMA_PATCHES = [
  // Auth: single-row config table (passkey hash)
  `CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    passkey_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT app_config_single_row CHECK (id = 1)
  )`,
  // Auth: sessions table
  `CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions (token)',
  'CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at)',
  'ALTER TABLE lists ADD COLUMN IF NOT EXISTS color TEXT',
  'ALTER TABLE lists ADD COLUMN IF NOT EXISTS icon TEXT',
  'ALTER TABLE lists ADD COLUMN IF NOT EXISTS start_date DATE',
  'ALTER TABLE lists ADD COLUMN IF NOT EXISTS end_date DATE',
  'ALTER TABLE lists ADD COLUMN IF NOT EXISTS baseline_start_date DATE',
  'ALTER TABLE lists ADD COLUMN IF NOT EXISTS baseline_end_date DATE',
  "ALTER TABLE lists ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb",
  'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS color TEXT',
  'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS icon TEXT',
  "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb",
  'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS baseline_start_date DATE',
  'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS baseline_end_date DATE',
  `CREATE TABLE IF NOT EXISTS workload_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    list_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  'ALTER TABLE workload_shares ADD COLUMN IF NOT EXISTS token TEXT',
  'ALTER TABLE workload_shares ADD COLUMN IF NOT EXISTS name TEXT',
  "ALTER TABLE workload_shares ADD COLUMN IF NOT EXISTS list_ids JSONB NOT NULL DEFAULT '[]'::jsonb",
  'ALTER TABLE workload_shares ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()',
  'ALTER TABLE workload_shares ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()',
  'CREATE UNIQUE INDEX IF NOT EXISTS workload_shares_token_idx ON workload_shares (token)',
  // Project resources: files and bookmark links per project (list)
  `CREATE TABLE IF NOT EXISTS project_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('link', 'file')),
    label TEXT NOT NULL,
    url TEXT,
    file_name TEXT,
    file_path TEXT,
    file_size INTEGER,
    mime_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  'CREATE INDEX IF NOT EXISTS project_resources_list_id_idx ON project_resources (list_id)',
];

export async function ensureSchema() {
  const client = await pool.connect();
  try {
    for (const query of SCHEMA_PATCHES) {
      await client.query(query);
    }
  } finally {
    client.release();
  }
}
