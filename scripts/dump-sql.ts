/**
 * Cita Google Sheet i generise SQL (bez DB konekcije) -> scripts/seed.generated.sql.
 * Koristi se kad nemamo DATABASE_URL: SQL se izvrsi preko Supabase MCP-a.
 *   pnpm dump-sql
 */
import { writeFileSync } from 'node:fs';
import { getCardsFromSheet, getAccessFromSheet } from '../lib/sheets';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  const cards = await getCardsFromSheet();
  const access = await getAccessFromSheet();

  // dedup identicnih (front, back, lesson) trojki (izvor ih ponekad ponovi)
  const seen = new Set<string>();
  const uniqueCards = cards.filter((c) => {
    const k = `${c.front}|${c.back}|${c.lesson}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const lines: string[] = [];
  lines.push('-- AUTOGENERISANO iz Google Sheet-a (scripts/dump-sql.ts)');

  // anki_cards: upsert po (front, back, lesson)
  if (uniqueCards.length) {
    const values = uniqueCards
      .map((c) => `(${q(c.front)}, ${q(c.back)}, ${q(c.lesson)}, ${c.isActive})`)
      .join(',\n');
    lines.push(
      `insert into public.anki_cards (front, back, lesson, is_active) values\n${values}\n` +
        `on conflict (front, back, lesson) do update set is_active = excluded.is_active;`,
    );
  }

  // anki_group_access: replace-all
  lines.push('truncate public.anki_group_access;');
  if (access.length) {
    const values = access
      .map((a) => `(${q(a.groupName)}, ${q(a.lesson)})`)
      .join(',\n');
    lines.push(
      `insert into public.anki_group_access (group_name, lesson) values\n${values}\n` +
        `on conflict (group_name, lesson) do nothing;`,
    );
  }

  const sql = lines.join('\n\n') + '\n';
  writeFileSync('scripts/seed.generated.sql', sql);
  console.log(
    `Generisano: ${cards.length} kartica, ${access.length} access redova -> scripts/seed.generated.sql`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
