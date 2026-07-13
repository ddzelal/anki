import { pool } from './db';
import { schedule, type ReviewState } from './fsrs';
import type { Grade } from 'ts-fsrs';
import type { SheetCard } from './sheets';

export interface DueCard {
  key: string;
  front: string;
  back: string;
  lesson: string;
  is_new: boolean;
}

const TZ = 'Europe/Belgrade';

/** Napredak jednog korisnika: card_key -> stanje (za listanje/statistiku). */
interface ReviewRow {
  due: Date;
  state: number;
  introduced_at: Date;
}

async function getUserReviews(userId: number): Promise<Map<string, ReviewRow>> {
  const { rows } = await pool.query(
    `select card_key, due, state, introduced_at
     from public.anki_reviews where user_id = $1`,
    [userId],
  );
  const map = new Map<string, ReviewRow>();
  for (const r of rows) {
    map.set(r.card_key as string, {
      due: r.due as Date,
      state: r.state as number,
      introduced_at: r.introduced_at as Date,
    });
  }
  return map;
}

function belgradeDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
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

export interface StudyPayload {
  cards: DueCard[];
  stats: Stats;
  lessons: LessonProgress[];
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
  const today = belgradeDate(new Date());
  let cursor = set.has(today) ? today : prevDay(today);
  if (!set.has(cursor)) return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = prevDay(cursor);
  }
  return streak;
}

/**
 * Sve za /study, izračunato u JS-u iz (vidljive kartice iz Sheet-a) + (napredak iz baze):
 *  - due kartice: sva dospela ponavljanja + do (newPerDay - danas uvedeno) NOVIH
 *  - statistika + napredak po lekciji
 */
export async function buildStudy(
  userId: number,
  visibleCards: SheetCard[],
  newPerDayLimit: number,
  limit = 50,
): Promise<StudyPayload> {
  const reviews = await getUserReviews(userId);
  const now = new Date();
  const today = belgradeDate(now);

  // koliko je NOVIH uvedeno danas (po Beogradu)
  let newToday = 0;
  for (const r of reviews.values()) {
    if (belgradeDate(r.introduced_at) === today) newToday++;
  }
  const newLeft = Math.max(0, newPerDayLimit - newToday);

  const dueList: { card: SheetCard; due: Date }[] = [];
  const newList: SheetCard[] = [];
  let learned = 0;
  let started = 0;
  let fresh = 0;

  for (const card of visibleCards) {
    const r = reviews.get(card.key);
    if (r) {
      started++;
      if (r.state === 2) learned++;
      if (r.due.getTime() <= now.getTime()) dueList.push({ card, due: r.due });
    } else {
      fresh++;
      newList.push(card);
    }
  }

  dueList.sort((a, b) => a.due.getTime() - b.due.getTime());
  const newsToShow = newList.slice(0, newLeft); // newList je u redosledu Sheet-a

  const combined: DueCard[] = [
    ...dueList.map(({ card }) => toDue(card, false)),
    ...newsToShow.map((card) => toDue(card, true)),
  ].slice(0, limit);

  // napredak po lekciji
  const byLesson = new Map<string, { total: number; learned: number }>();
  for (const card of visibleCards) {
    const agg = byLesson.get(card.lesson) ?? { total: 0, learned: 0 };
    agg.total++;
    if (reviews.get(card.key)?.state === 2) agg.learned++;
    byLesson.set(card.lesson, agg);
  }
  const lessons: LessonProgress[] = [...byLesson.entries()]
    .map(([lesson, v]) => ({ lesson, total: v.total, learned: v.learned }))
    .sort((a, b) => lessonNum(a.lesson) - lessonNum(b.lesson) || a.lesson.localeCompare(b.lesson));

  const streak = await computeStreak(userId);
  const availableNew = Math.min(newLeft, fresh);

  return {
    cards: combined,
    lessons,
    stats: {
      total: visibleCards.length,
      learned,
      started,
      fresh,
      due: dueList.length + availableNew,
      newPerDay: newPerDayLimit,
      newToday,
      newLeft,
      streak,
    },
  };
}

function toDue(c: SheetCard, is_new: boolean): DueCard {
  return { key: c.key, front: c.front, back: c.back, lesson: c.lesson, is_new };
}

function lessonNum(lesson: string): number {
  const digits = lesson.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : Number.MAX_SAFE_INTEGER;
}

/** Primeni ocenu (FSRS), upiši sledeći termin i loguj ocenu (za streak). Ključ = card_key. */
export async function submitReview(userId: number, key: string, rating: Grade) {
  const cur = await pool.query(
    `select due, stability, difficulty, elapsed_days, scheduled_days,
            reps, lapses, state, last_review
     from public.anki_reviews where user_id = $1 and card_key = $2`,
    [userId, key],
  );
  const current = (cur.rows[0] as ReviewState | undefined) ?? null;
  const next = schedule(current, rating);

  await pool.query(
    `insert into public.anki_reviews
       (user_id, card_key, due, stability, difficulty, elapsed_days,
        scheduled_days, reps, lapses, state, last_review)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (user_id, card_key) do update set
       due = excluded.due, stability = excluded.stability,
       difficulty = excluded.difficulty, elapsed_days = excluded.elapsed_days,
       scheduled_days = excluded.scheduled_days, reps = excluded.reps,
       lapses = excluded.lapses, state = excluded.state,
       last_review = excluded.last_review`,
    [
      userId, key, next.due, next.stability, next.difficulty,
      next.elapsed_days, next.scheduled_days, next.reps, next.lapses,
      next.state, next.last_review,
    ],
  );

  await pool.query(
    `insert into public.anki_review_log (user_id, card_key, rating) values ($1, $2, $3)`,
    [userId, key, Number(rating)],
  );

  return { due: next.due };
}
