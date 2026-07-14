import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  State,
  type Grade,
  type Card as FsrsCard,
} from 'ts-fsrs';

const scheduler = fsrs(generatorParameters());

/** Red iz anki_reviews -> ts-fsrs Card. */
export type ReviewState = {
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number; // trenutna pozicija u koracima učenja (MORA se čuvati da kartica diplomira)
  reps: number;
  lapses: number;
  state: number;
  last_review: Date | null;
};

export function reviewToFsrsCard(r: ReviewState | null, now: Date): FsrsCard {
  if (!r) return createEmptyCard(now);
  return {
    due: r.due,
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days,
    learning_steps: r.learning_steps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state as State,
    last_review: r.last_review ?? undefined,
  } as FsrsCard;
}

/** Mapiranje UI ocene -> ts-fsrs Grade. */
export const RATING: Record<'again' | 'hard' | 'good' | 'easy', Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/** Izracunaj sledece stanje kartice za datu ocenu. */
export function schedule(
  current: ReviewState | null,
  rating: Grade,
  now = new Date(),
): ReviewState {
  const card = reviewToFsrsCard(current, now);
  const next = scheduler.next(card, now, rating).card;
  return {
    due: next.due,
    stability: next.stability,
    difficulty: next.difficulty,
    elapsed_days: next.elapsed_days,
    scheduled_days: next.scheduled_days,
    learning_steps: next.learning_steps,
    reps: next.reps,
    lapses: next.lapses,
    state: next.state,
    last_review: next.last_review ?? now,
  };
}
