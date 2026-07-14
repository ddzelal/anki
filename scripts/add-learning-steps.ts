/**
 * Migracija: dodaj `learning_steps` u anki_reviews.
 * ts-fsrs Card ima polje `learning_steps` (pozicija u koracima učenja) koje se MORA čuvati
 * da bi kartica diplomirala iz Learning u Review. Bez njega kartica ostaje zaglavljena na 10 min.
 *
 * Pokretanje:  ./node_modules/.bin/tsx --env-file=.env.local scripts/add-learning-steps.ts
 * Idempotentno (IF NOT EXISTS). Postojeći redovi dobijaju 0 (ispravno za Review kartice).
 */
import { pool } from '../lib/db';

async function main() {
  await pool.query(
    `alter table public.anki_reviews
       add column if not exists learning_steps integer not null default 0`,
  );
  const { rows } = await pool.query(
    `select count(*)::int n from information_schema.columns
     where table_schema='public' and table_name='anki_reviews' and column_name='learning_steps'`,
  );
  console.log(rows[0].n === 1 ? 'OK — learning_steps kolona postoji.' : 'GREŠKA — kolona nije dodata.');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
