import { google } from 'googleapis';

/**
 * Google Sheets klijent (Service Account).
 * PRIVATE_KEY u env-u ima escapovane \n -> vracamo prave newline-ove.
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

export interface SheetCard {
  front: string;
  back: string;
  lesson: string;
  isActive: boolean;
  groups: string[]; // koje grupe smeju da je vide; prazno = sve grupe
}

const TRUE_RE = /^(true|1|x|✓|da|yes)$/i;

/**
 * Ključ grupe iz zaglavlja kolone. Format `Ime (ID)` -> ključ je ID (to Moodle šalje
 * kroz `$Moodle.Person.userGroupIds`). Ako nema `(ID)`, ključ je celo zaglavlje (fallback).
 *   "arapski_jezik_decembar_2025 (7)" -> "7"
 *   "arapski_jezik_decembar_2025"     -> "arapski_jezik_decembar_2025"
 */
function groupKeyFromHeader(header: string): string {
  const m = header.match(/\(([^()]+)\)\s*$/);
  return (m ? m[1] : header).trim();
}

/**
 * Cita CardsV2: front | back | lesson | isActive | <grupa1> | <grupa2> | ...
 * - kolona `lesson` = sadržajna oznaka; prazan -> nasledi od prethodnog reda.
 * - kolona `isActive` (D): TRUE/prazno = aktivna; FALSE = sakrivena svima.
 * - od kolone E nadalje: SVAKA kolona je jedna Moodle grupa. Zaglavlje je `Ime (ID)`;
 *   ID se poklapa sa onim što Moodle šalje (custom param userGroupIds). Checkbox/TRUE u
 *   koloni = reč je vidljiva toj grupi. Nijedan TRUE = reč je vidljiva SVIMA (bez restrikcije).
 */
export async function getCardsFromSheet(): Promise<SheetCard[]> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CARDS_TAB}!A1:Z`,
  });

  const rows = res.data.values ?? [];
  if (rows.length === 0) return [];

  // Zaglavlje: kolone od indeksa 4 (E) naviše čije ime nije prazno = grupne kolone.
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

    cards.push({ front, back, lesson, isActive, groups });
  }

  return cards;
}

const SETTINGS_TAB = process.env.GOOGLE_SHEETS_SETTINGS_TAB ?? 'Settings';

/** Cita `Settings` tab (key | value) -> mapa podešavanja. */
export async function getSettingsFromSheet(): Promise<Record<string, string>> {
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
