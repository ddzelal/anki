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
const ACCESS_TAB = process.env.GOOGLE_SHEETS_ACCESS_TAB ?? 'Access';

export interface SheetCard {
  front: string;
  back: string;
  lesson: string;
  isActive: boolean;
}

export interface AccessRow {
  groupName: string;
  lesson: string;
}

/**
 * Cita CardsV2 (front | back | group | isActive).
 * VAZNO: sheet kolona "group" je zapravo LEKCIJA -> mapira se na lesson.
 * Obrnute kartice (npr. "Brat -> أَخٌ") imaju prazan group; naslede lekciju
 * od prethodnog reda (forward-fill), jer dolaze odmah iza svog parnjaka.
 */
export async function getCardsFromSheet(): Promise<SheetCard[]> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CARDS_TAB}!A2:D`,
  });

  const rows = res.data.values ?? [];
  const cards: SheetCard[] = [];
  let lastLesson = '';

  for (const row of rows) {
    const front = (row[0] ?? '').toString().trim();
    const back = (row[1] ?? '').toString().trim();
    const rawLesson = (row[2] ?? '').toString().trim();
    const isActive = (row[3] ?? '').toString().trim().toUpperCase() !== 'FALSE';

    if (!front || !back) continue; // preskoci prazne redove

    const lesson = rawLesson || lastLesson; // forward-fill za obrnute kartice
    if (rawLesson) lastLesson = rawLesson;
    if (!lesson) continue; // nema lekcije ni za naslediti -> preskoci

    cards.push({ front, back, lesson, isActive });
  }

  return cards;
}

/** Cita Access (group | lesson) -> mapa Moodle grupa -> lekcija. */
export async function getAccessFromSheet(): Promise<AccessRow[]> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ACCESS_TAB}!A2:B`,
  });

  const rows = res.data.values ?? [];
  const out: AccessRow[] = [];
  for (const row of rows) {
    const groupName = (row[0] ?? '').toString().trim();
    const lesson = (row[1] ?? '').toString().trim();
    if (!groupName || !lesson) continue;
    out.push({ groupName, lesson });
  }
  return out;
}
