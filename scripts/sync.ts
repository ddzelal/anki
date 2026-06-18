/**
 * CLI sync (terminal): pnpm sync
 * Ista logika kao POST /api/sync — vidi lib/sync.ts.
 */
import { runSync } from '../lib/sync';
import { pool } from '../lib/db';

async function main() {
  const r = await runSync();
  console.log(`anki_cards: ${r.cards} | grupa-tagova: ${r.groupTags}`);
  await pool.end();
  console.log('Sync gotov.');
}

main().catch((e) => {
  console.error('Sync greska:', e);
  process.exit(1);
});
