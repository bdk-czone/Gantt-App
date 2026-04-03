import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

import pool from './db';

dotenv.config();

function resolveSqlPath(inputPath: string) {
  const candidates = [
    path.resolve(process.cwd(), inputPath),
    path.resolve(__dirname, inputPath),
    path.resolve(__dirname, '..', inputPath),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: ts-node src/runSqlFile.ts <path-to-sql-file>');
  }

  const sqlPath = resolveSqlPath(inputPath);
  if (!sqlPath) {
    throw new Error(`Could not resolve SQL file path for "${inputPath}"`);
  }

  const sql = await fs.readFile(sqlPath, 'utf8');
  if (!sql.trim()) {
    throw new Error(`SQL file is empty: ${sqlPath}`);
  }

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log(`Applied SQL file: ${path.relative(process.cwd(), sqlPath)}`);
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error('Failed to apply SQL file.', error);
  process.exit(1);
});
