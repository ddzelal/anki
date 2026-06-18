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

/**
 * Cita CardsV2: front | back | lesson | isActive | groups
 * - kolona `lesson` (istorijski naziv "group") = sadržajna oznaka; prazan -> nasledi od parnjaka.
 * - kolona `groups` = lista Moodle grupa (zarezom/; razdvojeno) koje smeju da vide reč;
 *   prazno = vidljivo svim grupama.
 */
export async function getCardsFromSheet(): Promise<SheetCard[]> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CARDS_TAB}!A2:E`,
  });

  const rows = res.data.values ?? [];
  const cards: SheetCard[] = [];
  let lastLesson = '';

  for (const row of rows) {
    const front = (row[0] ?? '').toString().trim();
    const back = (row[1] ?? '').toString().trim();
    const rawLesson = (row[2] ?? '').toString().trim();
    const isActive = (row[3] ?? '').toString().trim().toUpperCase() !== 'FALSE';
    const groups = (row[4] ?? '')
      .toString()
      .split(/[,;]/)
      .map((g: string) => g.trim())
      .filter(Boolean);

    if (!front || !back) continue;

    const lesson = rawLesson || lastLesson;
    if (rawLesson) lastLesson = rawLesson;
    if (!lesson) continue;

    cards.push({ front, back, lesson, isActive, groups });
  }

  return cards;
}
