import { getCardsFromSheet, getAccessFromSheet } from './sheets';
import { pool } from './db';

/**
 * Prekopira sadržaj iz Google Sheet-a u Supabase (jedna transakcija).
 *   CardsV2 -> anki_cards (upsert po front+back+lesson)
 *   Access  -> anki_group_access (replace-all)
 * NE dira anki_users / anki_reviews (napredak studenata ostaje netaknut).
 * Koriste je i `pnpm sync` i POST /api/sync.
 */
export async function runSync(): Promise<{ cards: number; access: number }> {
  const cards = await getCardsFromSheet();
  const access = await getAccessFromSheet();

  const client = await pool.connect();
  try {
    await client.query('begin');

    for (const c of cards) {
      await client.query(
        `insert into public.anki_cards (front, back, lesson, is_active)
         values ($1, $2, $3, $4)
         on conflict (front, back, lesson)
         do update set is_active = excluded.is_active`,
        [c.front, c.back, c.lesson, c.isActive],
      );
    }

    await client.query('truncate public.anki_group_access');
    for (const a of access) {
      await client.query(
        `insert into public.anki_group_access (group_name, lesson)
         values ($1, $2) on conflict (group_name, lesson) do nothing`,
        [a.groupName, a.lesson],
      );
    }

    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }

  return { cards: cards.length, access: access.length };
}
