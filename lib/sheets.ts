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
  isActive: boolean;
  groups: string[]; // ID-evi grupa koje smeju da je vide; prazno = sve grupe
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

/**
 * Sirovo čitanje CardsV2: front | back | lesson | isActive | <grupa1> | <grupa2> | ...
 * - lesson prazan -> nasledi od prethodnog reda.
 * - isActive (D): FALSE = sakrivena svima; inače aktivna.
 * - kolone E+ : svaka je jedna Moodle grupa (zaglavlje `Ime (ID)`); TRUE/kvačica = vidljiva toj grupi.
 *   Nijedan TRUE = vidljiva SVIMA.
 */
export async function fetchCardsFromSheet(): Promise<SheetCard[]> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CARDS_TAB}!A1:Z`,
  });

  const rows = res.data.values ?? [];
  if (rows.length === 0) return [];

  const header = rows[0];
  const groupCols: { idx: number; key: string }[] = [];
  for (let i = 4; i < header.length; i++) {
    const name = (header[i] ?? '').toString().trim();
    if (name) groupCols.push({ idx: i, key: groupKeyFromHeader(name) });
  }

  const cards: SheetCard[] = [];
  let lastLesson = '';

  for (const row of rows.slice(1)) {
    const front = (row[0] ?? '').toString().trim();
    const back = (row[1] ?? '').toString().trim();
    const rawLesson = (row[2] ?? '').toString().trim();
    const isActive = (row[3] ?? '').toString().trim().toUpperCase() !== 'FALSE';
    const groups = groupCols
      .filter(({ idx }) => TRUE_RE.test((row[idx] ?? '').toString().trim()))
      .map(({ key }) => key);

    if (!front || !back) continue;

    const lesson = rawLesson || lastLesson;
    if (rawLesson) lastLesson = rawLesson;
    if (!lesson) continue;

    cards.push({ key: cardKey(front, back), front, back, lesson, isActive, groups });
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
 * Vidljive kartice za studenta.
 *  - groupIds === null -> grupno filtriranje ISKLJUČENO: svi vide sve aktivne kartice.
 *  - inače -> kartica je vidljiva ako nema restrikciju (groups prazno) ILI se neka njena
 *    grupa poklapa sa studentovim Moodle grupama.
 */
export function filterVisible(cards: SheetCard[], groupIds: string[] | null): SheetCard[] {
  return cards.filter((c) => {
    if (!c.isActive) return false;
    if (groupIds === null) return true;
    if (c.groups.length === 0) return true;
    return c.groups.some((g) => groupIds.includes(g));
  });
}
