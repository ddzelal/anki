import { pool } from './db';

/**
 * Ko je trenutni korisnik.
 * - DEV (lokalno, bez LTI): fiksni korisnik, bez filtracije po grupama.
 * - PRAVI (LTI launch): vidi upsertUserFromToken — token.user = Moodle `sub`.
 */
const DEV_SUB = 'dev-local';

export async function getCurrentUser(): Promise<{ userId: number; isDev: boolean }> {
  const { rows } = await pool.query(
    `insert into public.anki_users (moodle_sub, display_name)
     values ($1, $2)
     on conflict (moodle_sub) do update set display_name = excluded.display_name
     returning id`,
    [DEV_SUB, 'Dev (lokalno)'],
  );
  return { userId: rows[0].id as number, isDev: true };
}

/**
 * Pravi LTI korisnik iz ltijs tokena: token.user = Moodle `sub` (stabilan po platformi).
 * Upsert u anki_users -> svaki student ima svoj red i svoj FSRS napredak.
 */
export async function upsertUserFromToken(token: {
  user: string;
  userInfo?: { name?: string; given_name?: string; email?: string };
}): Promise<number> {
  const sub = token.user;
  const name = token.userInfo?.name ?? token.userInfo?.given_name ?? null;
  const { rows } = await pool.query(
    `insert into public.anki_users (moodle_sub, display_name)
     values ($1, $2)
     on conflict (moodle_sub)
     do update set display_name = coalesce(excluded.display_name, public.anki_users.display_name)
     returning id`,
    [sub, name],
  );
  return rows[0].id as number;
}
