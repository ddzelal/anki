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

const TZ = 'Europe/Belgrade';

// Predikat vidljivosti kartice ($2 = groupFilter text[] | null).
const VISIBLE = `
  c.is_active = true
  and (
    $2::text[] is null
    or not exists (select 1 from public.anki_card_groups g where g.card_id = c.id)
    or exists (
      select 1 from public.anki_card_groups g
      where g.card_id = c.id and g.group_name = any($2)
    )
  )`;

/** Koliko je NOVIH kartica korisnik uveo danas (po Europe/Belgrade danu). */
async function introducedToday(userId: number): Promise<number> {
  const { rows } = await pool.query(
    `select count(*)::int as n from public.anki_reviews
     where user_id = $1
       and (introduced_at at time zone '${TZ}')::date = (now() at time zone '${TZ}')::date`,
    [userId],
  );
  return rows[0].n as number;
}

/**
 * Due kartice: sva dospela ponavljanja (neograničeno) + do (newPerDay - danas uvedeno) NOVIH.
 */
export async function getDueCards(
  userId: number,
  groupFilter: string[] | null,
  newPerDay: number,
  limit = 50,
): Promise<DueCard[]> {
  const newRemaining = Math.max(0, newPerDay - (await introducedToday(userId)));

  const { rows } = await pool.query(
    `with vis as (
       select c.id, c.front, c.back, c.lesson, r.id as rid, r.due
       from public.anki_cards c
       left join public.anki_reviews r on r.card_id = c.id and r.user_id = $1
       where ${VISIBLE}
     ),
     reviews as (select * from vis where rid is not null and due <= now()),
     news as (select * from vis where rid is null order by id limit $3)
     select id, front, back, lesson, (rid is null) as is_new
     from (select * from reviews union all select * from news) t
     order by (rid is null) asc, due asc nulls last
     limit $4`,
    [userId, groupFilter, newRemaining, limit],
  );
  return rows as DueCard[];
}

export interface Stats {
  total: number;
  learned: number;
  started: number;
  fresh: number;
  due: number; // dostupno za vežbu SAD (ponavljanja + nove u okviru dnevnog limita)
  newPerDay: number;
  newToday: number;
  newLeft: number;
  streak: number;
}

export interface LessonProgress {
  lesson: string;
  total: number;
  learned: number;
}

function prevDay(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

async function computeStreak(userId: number): Promise<number> {
  const { rows } = await pool.query(
    `select distinct (reviewed_at at time zone '${TZ}')::date::text as d
     from public.anki_review_log where user_id = $1
     order by d desc limit 400`,
    [userId],
  );
  const set = new Set(rows.map((r: { d: string }) => r.d));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  let cursor = set.has(today) ? today : prevDay(today);
  if (!set.has(cursor)) return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = prevDay(cursor);
  }
  return streak;
}

/** Progres korisnika + dnevni limit novih + streak. */
export async function getStats(
  userId: number,
  groupFilter: string[] | null,
  newPerDay: number,
): Promise<Stats> {
  const { rows } = await pool.query(
    `select
       count(*)::int as total,
       count(*) filter (where r.state = 2)::int as learned,
       count(*) filter (where r.id is not null)::int as started,
       count(*) filter (where r.id is null)::int as fresh,
       count(*) filter (where r.id is not null and r.due <= now())::int as due_reviews,
       count(*) filter (
         where r.id is not null
           and (r.introduced_at at time zone '${TZ}')::date = (now() at time zone '${TZ}')::date
       )::int as new_today
     from public.anki_cards c
     left join public.anki_reviews r on r.card_id = c.id and r.user_id = $1
     where ${VISIBLE}`,
    [userId, groupFilter],
  );
  const s = rows[0];
  const newToday = s.new_today as number;
  const newLeft = Math.max(0, newPerDay - newToday);
  const availableNew = Math.min(newLeft, s.fresh as number);
  const streak = await computeStreak(userId);

  return {
    total: s.total,
    learned: s.learned,
    started: s.started,
    fresh: s.fresh,
    due: (s.due_reviews as number) + availableNew,
    newPerDay,
    newToday,
    newLeft,
    streak,
  };
}

/** Napredak po lekciji. */
export async function getLessonProgress(
  userId: number,
  groupFilter: string[] | null,
): Promise<LessonProgress[]> {
  const { rows } = await pool.query(
    `select c.lesson,
            count(*)::int as total,
            count(*) filter (where r.state = 2)::int as learned
     from public.anki_cards c
     left join public.anki_reviews r on r.card_id = c.id and r.user_id = $1
     where ${VISIBLE}
     group by c.lesson
     order by nullif(regexp_replace(c.lesson, '\\D', '', 'g'), '')::int nulls last, c.lesson`,
    [userId, groupFilter],
  );
  return rows as LessonProgress[];
}

/** Primeni ocenu (FSRS), upiši sledeći termin i loguj ocenu (za streak). */
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

  await pool.query(
    `insert into public.anki_review_log (user_id, card_id, rating) values ($1, $2, $3)`,
    [userId, cardId, Number(rating)],
  );

  return { due: next.due };
}
