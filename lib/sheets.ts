import { google } from 'googleapis';
import { cardKey } from './cardkey';

/**
 * Google Sheet je JEDINI izvor istine za kartice — čita se UŽIVO (uz keš), bez
 * sinhronizacije u bazu. Admin uređuje samo Sheet: reči, koje grupe ih vide, i Settings.
 *
 * PRIVATE_KEY u env-u ima escapovane \n -> vraćamo prave newline-ove.
 */
function sheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    key: (process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
const CARDS_TAB = process.env.GOOGLE_SHEETS_ACTIVE_TAB ?? 'CardsV2';
const SETTINGS_TAB = process.env.GOOGLE_SHEETS_SETTINGS_TAB ?? 'Settings';

export interface SheetCard {
  key: string; // stabilni ključ = hash(front+back); veže napredak u bazi
  front: string;
  back: string;
  lesson: string;
  groups: string[]; // grupe (ID i/ili ime) kojima je reč vidljiva; PRAZNO = niko je ne vidi (Model B)
}

const TRUE_RE = /^(true|1|x|✓|da|yes)$/i;

/**
 * Ključ grupe iz zaglavlja kolone. Format `Ime (ID)` -> ključ je ID (to Moodle šalje
 * kroz `$Moodle.Person.userGroupIds`). Ako nema `(ID)`, ključ je celo zaglavlje (fallback).
 *   "arapski_jezik_decembar_2025 (7)" -> "7"
 */
function groupKeyFromHeader(header: string): string {
  const m = header.match(/\(([^()]+)\)\s*$/);
  return (m ? m[1] : header).trim();
}

// Kolone se prepoznaju po IMENU zaglavlja (ne po poziciji) — pa kod radi bez obzira
// da li `isActive` kolona postoji ili je obrisana, i bez obzira gde su grupne kolone.
const RESERVED = new Set(['front', 'back', 'lesson', 'isactive']);

/**
 * Sirovo čitanje CardsV2. Zaglavlja: `front | back | lesson | <grupa1> | <grupa2> | ...`
 * (kolona `isActive`, ako postoji, se IGNORIŠE — više se ne koristi).
 * - lesson prazan -> nasledi od prethodnog reda.
 * - svaka NErezervisana kolona sa nepraznim zaglavljem = jedna Moodle grupa; TRUE/kvačica = vidljiva toj grupi.
 * - Model B: reč bez ijedne čekirane grupe NIJE vidljiva nikome.
 */
export async function fetchCardsFromSheet(): Promise<SheetCard[]> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CARDS_TAB}!A1:Z`,
  });

  const rows = res.data.values ?? [];
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => (h ?? '').toString().trim());
  const findCol = (name: string, fallback: number) => {
    const i = header.findIndex((h) => h.toLowerCase() === name);
    return i >= 0 ? i : fallback;
  };
  const frontIdx = findCol('front', 0);
  const backIdx = findCol('back', 1);
  const lessonIdx = findCol('lesson', 2);

  const groupCols: { idx: number; key: string }[] = [];
  header.forEach((name, i) => {
    if (name && !RESERVED.has(name.toLowerCase())) {
      groupCols.push({ idx: i, key: groupKeyFromHeader(name) });
    }
  });

  const cards: SheetCard[] = [];
  let lastLesson = '';

  for (const row of rows.slice(1)) {
    const front = (row[frontIdx] ?? '').toString().trim();
    const back = (row[backIdx] ?? '').toString().trim();
    const rawLesson = (row[lessonIdx] ?? '').toString().trim();
    const groups = groupCols
      .filter(({ idx }) => TRUE_RE.test((row[idx] ?? '').toString().trim()))
      .map(({ key }) => key);

    if (!front || !back) continue;

    const lesson = rawLesson || lastLesson;
    if (rawLesson) lastLesson = rawLesson;
    if (!lesson) continue;

    cards.push({ key: cardKey(front, back), front, back, lesson, groups });
  }

  return cards;
}

/** Sirovo čitanje `Settings` taba (key | value). */
export async function fetchSettingsFromSheet(): Promise<Record<string, string>> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SETTINGS_TAB}!A2:B`,
  });
  const out: Record<string, string> = {};
  for (const row of res.data.values ?? []) {
    const key = (row[0] ?? '').toString().trim();
    const value = (row[1] ?? '').toString().trim();
    if (key) out[key] = value;
  }
  return out;
}

export interface Deck {
  cards: SheetCard[]; // dedup-ovano po key (prvo pojavljivanje)
  settings: Record<string, string>;
  fetchedAt: number;
}

// Keš u memoriji (per serverless instanca). Admin izmene se vide za ≤ TTL,
// ili odmah preko `getDeck(true)` (dugme "Osveži").
const TTL_MS = 5 * 60 * 1000;
let cache: Deck | null = null;

export async function getDeck(fresh = false): Promise<Deck> {
  const now = Date.now();
  if (!fresh && cache && now - cache.fetchedAt < TTL_MS) return cache;

  const [rawCards, settings] = await Promise.all([fetchCardsFromSheet(), fetchSettingsFromSheet()]);

  // dedup po ključu (isti front+back u dve lekcije -> jedna kartica; zadrži prvu)
  const seen = new Set<string>();
  const cards: SheetCard[] = [];
  for (const c of rawCards) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    cards.push(c);
  }

  cache = { cards, settings, fetchedAt: now };
  return cache;
}

/**
 * Vidljive kartice za studenta (Model B — vidiš samo ono što je čekirano za tvoju grupu).
 *  - groupIds === null -> filtriranje ISKLJUČENO (GROUPS_ENABLED=false, ili admin/dev): vidi SVE.
 *  - inače -> kartica je vidljiva SAMO ako je čekirana za neku grupu u kojoj je student.
 *    Reč bez ijedne čekirane grupe -> ne vidi je niko.
 */
export function filterVisible(cards: SheetCard[], groupIds: string[] | null): SheetCard[] {
  if (groupIds === null) return cards;
  return cards.filter((c) => c.groups.some((g) => groupIds.includes(g)));
}
