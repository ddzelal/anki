/**
 * Jednokratni setup: ubacuje PRAVE checkbox-ove (data validation BOOLEAN) na
 * grupne kolone u CardsV2 — sve kolone od E nadalje čije zaglavlje (red 1) nije prazno.
 * Tako učiteljica samo klikne kvačicu da reč postane vidljiva nekoj grupi.
 *
 * Pokretanje:  pnpm checkboxes
 *   (= tsx --env-file=.env.local scripts/setup-group-checkboxes.ts)
 *
 * Idempotentno — može da se pokrene ponovo kad dodaš novu grupnu kolonu.
 */
import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
const SHEET_NAME = 'CardsV2';
const SHEET_ID = 1761201601; // CardsV2 (gid)

function client() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    key: (process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'], // read-write
  });
  return google.sheets({ version: 'v4', auth });
}

async function main() {
  const sheets = client();

  // Dimenzije + zaglavlje.
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const tab = meta.data.sheets?.find((s) => s.properties?.sheetId === SHEET_ID);
  const rowCount = tab?.properties?.gridProperties?.rowCount ?? 1000;

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:Z1`,
  });
  const header = headerRes.data.values?.[0] ?? [];

  // Grupne kolone = indeks >= 4 (kolona E) sa nepraznim imenom.
  const groupCols: { idx: number; name: string }[] = [];
  for (let i = 4; i < header.length; i++) {
    const name = (header[i] ?? '').toString().trim();
    if (name) groupCols.push({ idx: i, name });
  }

  if (groupCols.length === 0) {
    console.log('Nema grupnih kolona (E+). Dodaj ime grupe u zaglavlje pa pokreni ponovo.');
    return;
  }

  const requests = groupCols.map(({ idx }) => ({
    setDataValidation: {
      range: {
        sheetId: SHEET_ID,
        startRowIndex: 1, // od reda 2 (preskoči zaglavlje)
        endRowIndex: rowCount,
        startColumnIndex: idx,
        endColumnIndex: idx + 1,
      },
      rule: {
        condition: { type: 'BOOLEAN' }, // checkbox
        strict: true,
        showCustomUi: true,
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests },
  });

  console.log(
    `Checkbox-ovi ubačeni na ${groupCols.length} kolon(e): ${groupCols
      .map((g) => g.name)
      .join(', ')} (redovi 2–${rowCount}).`,
  );
}

main().catch((e) => {
  console.error('Greška:', e);
  process.exit(1);
});
