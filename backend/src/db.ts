import { Pool, types } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Keep SQL DATE columns as yyyy-MM-dd strings so the frontend can bind them
// directly into native date inputs without timezone or timestamp drift.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;
