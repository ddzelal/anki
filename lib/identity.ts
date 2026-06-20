import { pool } from './db';
import { verifySession } from './session';

export interface ResolvedUser {
  userId: number;
  name: string | null;
  groups: string[];
  allGroups?: string[]; // sve grupe kursa (dijagnostika, samo admin)
  isDev: boolean;
  isAdmin: boolean;
}

/**
 * Identitet iz session kolačića (postavljen pri LTI launch-u).
 * Nema kolačića / nevažeći -> DEV korisnik (lokalni test, vidi sve).
 */
export async function resolveUser(sessionToken: string | undefined | null): Promise<ResolvedUser> {
  const session = verifySession(sessionToken);

  const sub = session?.sub ?? 'dev-local';
  const name = session?.name ?? (session ? null : 'Dev (lokalno)');

  const { rows } = await pool.query(
    `insert into public.anki_users (moodle_sub, display_name)
     values ($1, $2)
     on conflict (moodle_sub)
     do update set display_name = coalesce(excluded.display_name, public.anki_users.display_name)
     returning id, display_name`,
    [sub, name],
  );

  return {
    userId: rows[0].id as number,
    name: (rows[0].display_name as string | null) ?? name,
    groups: session?.groups ?? [],
    allGroups: session?.allGroups,
    isDev: !session,
    // pravi session -> njegov isAdmin; bez sesije -> admin SAMO u dev-u (lokalni test),
    // nikad u produkciji (inače bi neprijavljeni posetilac mogao da pokrene sync).
    isAdmin: session ? session.isAdmin : process.env.NODE_ENV !== 'production',
  };
}
