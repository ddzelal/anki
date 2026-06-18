import { getCardsFromSheet } from './sheets';
import { pool } from './db';

/**
 * Prekopira kartice iz Google Sheet-a u Supabase (jedna transakcija).
 *   CardsV2 -> anki_cards (upsert po front+back+lesson)
 *           -> anki_card_groups (po-reč grupe; replace per kartica)
 * NE dira anki_users / anki_reviews (napredak studenata ostaje netaknut).
 * Koriste je i `pnpm sync` i POST /api/sync.
 */
export async function runSync(): Promise<{ cards: number; groupTags: number }> {
  const cards = await getCardsFromSheet();
  let groupTags = 0;

  const client = await pool.connect();
  try {
    await client.query('begin');

    for (const c of cards) {
      const { rows } = await client.query(
        `insert into public.anki_cards (front, back, lesson, is_active)
         values ($1, $2, $3, $4)
         on conflict (front, back, lesson)
         do update set is_active = excluded.is_active
         returning id`,
        [c.front, c.back, c.lesson, c.isActive],
      );
      const cardId = rows[0].id as number;

      // Replace grupa-tagova za ovu karticu
      await client.query('delete from public.anki_card_groups where card_id = $1', [cardId]);
      for (const g of c.groups) {
        await client.query(
          `insert into public.anki_card_groups (card_id, group_name)
           values ($1, $2) on conflict (card_id, group_name) do nothing`,
          [cardId, g],
        );
        groupTags++;
      }
    }

    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }

  return { cards: cards.length, groupTags };
}
