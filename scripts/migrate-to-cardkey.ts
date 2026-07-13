/**
 * JEDNOKRATNA migracija: napredak (anki_reviews / anki_review_log) prelazi sa
 * bazičnog `card_id` na stabilni `card_key = hash(front+back)`.
 *
 * Posle ovoga reči više NE žive u bazi — čitaju se uživo iz Google Sheet-a.
 * Zato na kraju brišemo legacy tabele: anki_cards, anki_card_groups, anki_settings.
 * Napredak (14 reviews + 16 logova) se ČUVA — backfill ide iz anki_cards po (front,back).
 *
 * Pokretanje:  pnpm tsx --env-file=.env.local scripts/migrate-to-cardkey.ts
 * Transakciono i idempotentno-ish (koristi IF EXISTS / IF NOT EXISTS gde može).
 */
import { pool } from '../lib/db';
import { cardKey } from '../lib/cardkey';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('begin');

    // 0) Legacy tabele još moraju da postoje da bismo backfill-ovali. Ako su već obrisane,
    //    znači da je migracija već odrađena — izlazimo.
    const has = await client.query(
      `select to_regclass('public.anki_cards') as t`,
    );
    if (!has.rows[0].t) {
      console.log('anki_cards ne postoji — migracija je već odrađena. Nema šta da se radi.');
      await client.query('rollback');
      return;
    }

    // 1) Nove kolone (nullable za sada).
    await client.query(`alter table public.anki_reviews add column if not exists card_key text`);
    await client.query(`alter table public.anki_review_log add column if not exists card_key text`);

    // 2) Mapa card_id -> (front, back) iz anki_cards, pa izračunaj card_key u JS-u
    //    (identičnom funkcijom kao app -> ključevi se garantovano poklapaju).
    const cards = await client.query(`select id, front, back from public.anki_cards`);
    const keyById = new Map<string, string>();
    for (const r of cards.rows) keyById.set(String(r.id), cardKey(r.front, r.back));

    // 3) Backfill reviews.
    const rev = await client.query(`select id, card_id from public.anki_reviews`);
    let revUpdated = 0;
    for (const r of rev.rows) {
      const k = keyById.get(String(r.card_id));
      if (!k) continue; // kartica obrisana? ostavi null pa će je 4b počistiti
      await client.query(`update public.anki_reviews set card_key = $1 where id = $2`, [k, r.id]);
      revUpdated++;
    }

    // 3b) Backfill review_log.
    const log = await client.query(`select id, card_id from public.anki_review_log`);
    let logUpdated = 0;
    for (const r of log.rows) {
      const k = keyById.get(String(r.card_id));
      if (!k) continue;
      await client.query(`update public.anki_review_log set card_key = $1 where id = $2`, [k, r.id]);
      logUpdated++;
    }

    // 4) Očisti redove bez ključa (kartica je nestala) da NOT NULL prođe.
    await client.query(`delete from public.anki_reviews where card_key is null`);
    await client.query(`delete from public.anki_review_log where card_key is null`);

    // 4b) Dedup reviews po (user_id, card_key) — zadrži najskoriji (max last_review),
    //     da unique constraint prođe (npr. dupla (front,back) kartica).
    const dedup = await client.query(`
      delete from public.anki_reviews a
      using public.anki_reviews b
      where a.user_id = b.user_id
        and a.card_key = b.card_key
        and a.id < b.id
    `);

    // 5) Skini stare constraint-e/kolone koje vise o card_id.
    await client.query(`alter table public.anki_reviews drop constraint if exists anki_reviews_user_id_card_id_key`);
    await client.query(`alter table public.anki_reviews drop constraint if exists anki_reviews_card_id_fkey`);
    await client.query(`alter table public.anki_review_log drop constraint if exists anki_review_log_card_id_fkey`);
    await client.query(`alter table public.anki_reviews drop column if exists card_id`);
    await client.query(`alter table public.anki_review_log drop column if exists card_id`);

    // 6) card_key NOT NULL + unique(user_id, card_key) na reviews (arbiter za ON CONFLICT upsert).
    await client.query(`alter table public.anki_reviews alter column card_key set not null`);
    await client.query(`alter table public.anki_review_log alter column card_key set not null`);
    await client.query(`alter table public.anki_reviews
      add constraint anki_reviews_user_card_key unique (user_id, card_key)`);

    // 7) Legacy tabele više nisu potrebne (reči = Sheet, settings = Sheet).
    await client.query(`drop table if exists public.anki_card_groups`);
    await client.query(`drop table if exists public.anki_cards`);
    await client.query(`drop table if exists public.anki_settings`);

    await client.query('commit');
    console.log(
      `OK — reviews backfilled: ${revUpdated}, log backfilled: ${logUpdated}, ` +
        `dedup reviews obrisano: ${dedup.rowCount}. Legacy tabele obrisane.`,
    );
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  await pool.end();
}

main().catch((e) => {
  console.error('Migracija greška:', e);
  process.exit(1);
});
