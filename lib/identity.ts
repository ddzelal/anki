import { pool } from './db';

/**
 * Ko je trenutni korisnik i koje lekcije sme da vidi.
 *
 * FAZA 6 (TODO): čitati LTI sesiju (ltijs token) -> moodle_sub + Moodle grupa,
 * pa lekcije iz anki_group_access za tu grupu.
 *
 * Za sada: DEV korisnik (lokalno) koji vidi SVE lekcije — da možemo da testiramo
 * study tok pre Moodle integracije.
 */
const DEV_SUB = 'dev-local';

export interface CurrentUser {
  userId: number;
  lessons: string[];
  isDev: boolean;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const { rows } = await pool.query(
    `insert into public.anki_users (moodle_sub, display_name)
     values ($1, $2)
     on conflict (moodle_sub) do update set display_name = excluded.display_name
     returning id`,
    [DEV_SUB, 'Dev (lokalno)'],
  );
  const userId: number = rows[0].id;

  const { rows: lrows } = await pool.query(
    `select distinct lesson from public.anki_cards order by lesson`,
  );
  return { userId, lessons: lrows.map((r: { lesson: string }) => r.lesson), isDev: true };
}
