import { pool } from './db';
import { schedule, type ReviewState } from './fsrs';
import type { Grade } from 'ts-fsrs';

export interface DueCard {
  id: number;
  front: string;
  back: string;
  lesson: string;
  is_new: boolean;
}

/**
 * Due kartice za korisnika.
 * @param groupFilter
 *   - null  -> bez filtracije po grupama (sve aktivne kartice). Koristi se kad su grupe isključene.
 *   - string[] -> samo kartice koje su (bez grupa-restrikcije) ILI taggovane jednom od ovih grupa.
 *
 * Kartica je vidljiva ako: is_active = true I (groupFilter null
 *   ILI kartica nema ni jedan grupa-tag  ILI ima tag iz groupFilter-a).
 * Nove ili dospele (due <= now).
 */
export async function getDueCards(
  userId: number,
  groupFilter: string[] | null,
  limit = 50,
): Promise<DueCard[]> {
  const { rows } = await pool.query(
    `select c.id, c.front, c.back, c.lesson, (r.id is null) as is_new
     from public.anki_cards c
     left join public.anki_reviews r
       on r.card_id = c.id and r.user_id = $1
     where c.is_active = true
       and (
         $2::text[] is null
         or not exists (select 1 from public.anki_card_groups g where g.card_id = c.id)
         or exists (
           select 1 from public.anki_card_groups g
           where g.card_id = c.id and g.group_name = any($2)
         )
       )
       and (r.id is null or r.due <= now())
     order by (r.id is null) asc, r.due asc nulls last
     limit $3`,
    [userId, groupFilter, limit],
  );
  return rows as DueCard[];
}

/** Primeni ocenu (FSRS) i upiši sledeći termin u anki_reviews. */
export async function submitReview(userId: number, cardId: number, rating: Grade) {
  const cur = await pool.query(
    `select due, stability, difficulty, elapsed_days, scheduled_days,
            reps, lapses, state, last_review
     from public.anki_reviews where user_id = $1 and card_id = $2`,
    [userId, cardId],
  );
  const current = (cur.rows[0] as ReviewState | undefined) ?? null;
  const next = schedule(current, rating);

  await pool.query(
    `insert into public.anki_reviews
       (user_id, card_id, due, stability, difficulty, elapsed_days,
        scheduled_days, reps, lapses, state, last_review)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (user_id, card_id) do update set
       due = excluded.due, stability = excluded.stability,
       difficulty = excluded.difficulty, elapsed_days = excluded.elapsed_days,
       scheduled_days = excluded.scheduled_days, reps = excluded.reps,
       lapses = excluded.lapses, state = excluded.state,
       last_review = excluded.last_review`,
    [
      userId, cardId, next.due, next.stability, next.difficulty,
      next.elapsed_days, next.scheduled_days, next.reps, next.lapses,
      next.state, next.last_review,
    ],
  );
  return { due: next.due };
}
