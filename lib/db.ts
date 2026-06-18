import { Pool } from 'pg';

/**
 * Deljena pg konekcija ka Supabase (preko POOLER URL-a).
 * Server pristupa anki_* tabelama direktno (zaobilazi RLS).
 */
declare global {
  // eslint-disable-next-line no-var
  var _ankiPool: Pool | undefined;
}

export const pool =
  global._ankiPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Supabase zahteva SSL; pooler koristi self-signed lanac
    ssl: { rejectUnauthorized: false },
    max: 5,
  });

if (process.env.NODE_ENV !== 'production') global._ankiPool = pool;

export async function query<T = unknown>(text: string, params?: unknown[]) {
  const res = await pool.query(text, params as never);
  return res.rows as T[];
}
