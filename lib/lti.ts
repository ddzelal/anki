import { Provider as lti } from 'ltijs';
import Database from 'ltijs-sequelize';
import { getDueCards, submitReview } from './cards';
import { upsertUserFromToken } from './identity';
import { RATING } from './fsrs';

export { lti };

const GROUPS_ENABLED = process.env.GROUPS_ENABLED === 'true';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Moodle grupe korisnika preko NRPS-a. AKTIVNO tek kad GROUPS_ENABLED=true.
 * Još neprovereno na ovom Moodle-u — verifikujemo kad uključimo grupe.
 */
async function getUserGroups(token: any): Promise<string[]> {
  try {
    const result: any = await lti.NamesAndRoles.getMembers(token);
    const members: any[] = result?.members ?? [];
    const me = members.find((m) => m.user_id === token.user);
    const groups: any[] = me?.groups ?? me?.group_enrollments ?? [];
    return groups
      .map((g) => (typeof g === 'string' ? g : g.name ?? g.title))
      .filter(Boolean);
  } catch (e) {
    console.error('NRPS getMembers nije uspeo:', e);
    return [];
  }
}

/**
 * Filter grupa za getDueCards.
 *  - flag off -> null (bez filtracije; sve aktivne kartice vidljive svima)
 *  - flag on  -> grupe korisnika (per-reč filtracija). [] = nije ni u jednoj grupi
 *               (vidi samo reči bez grupa-restrikcije).
 */
async function groupFilterForToken(token: any): Promise<string[] | null> {
  if (!GROUPS_ENABLED) return null;
  return getUserGroups(token);
}

/**
 * ltijs (LTI 1.3) u serverless modu, sa Postgres backendom (Supabase pooler).
 * Sve ltijs sistemske tabele idu u schema `anki_lti` (izolacija u deljenom projektu).
 *
 * NAPOMENA: nije još pokrenuto/validirano — čeka ispravan DATABASE_URL.
 * Platforma (Moodle client_id/auth/token/keyset) se registruje kasnije preko
 * lti.registerPlatform({...}) kad dobijemo podatke iz Moodle-a (Faza 6).
 */

function parseDbUrl(url: string) {
  // postgresql://user:pass@host:port/db
  const m = url.match(/^\w+:\/\/([^:]+):(.*)@([^:/]+):(\d+)\/(.+)$/);
  if (!m) throw new Error('DATABASE_URL nije u očekivanom formatu');
  const [, user, pass, host, port, database] = m;
  return { user, pass, host, port: Number(port), database };
}

let appPromise: Promise<typeof lti.app> | null = null;

export function getLtiApp() {
  if (appPromise) return appPromise;

  appPromise = (async () => {
    const { user, pass, host, port, database } = parseDbUrl(process.env.DATABASE_URL!);

    // ltijs tabele žive u `public` (platforms, idtokens, nonces, ...).
    // Schema izolacija nije moguća: ltijs-sequelize migracije koriste nekvalifikovana
    // imena, a transaction pooler (obavezan za serverless) ignoriše search_path startup
    // parametar. Imena se ne sudaraju sa ostalim app-ovima u projektu.
    const db = new Database(database, user, pass, {
      host,
      port,
      dialect: 'postgres',
      logging: false,
      dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    });

    lti.setup(
      process.env.LTI_KEY!,
      { plugin: db },
      {
        appRoute: '/api/lti/launch',
        loginRoute: '/api/lti/login',
        keysetRoute: '/api/lti/keys',
        cookies: { secure: true, sameSite: 'None' }, // za iframe embed
        devMode: false,
        serverless: true,
      },
    );

    // Glavni launch: korisnik je verifikovan -> redirect na /study.
    // Moodle radi POST launch; mora 303 (See Other) da browser uradi GET na /study
    // (App Router stranica prima samo GET; 302 je u serverless bridge-u zadržavao POST -> 405).
    // ltik ide u URL za kasniju NRPS autentikaciju API poziva (Faza 6).
    lti.onConnect(async (_token: unknown, _req: unknown, res: { locals?: { ltik?: string }; redirect: (s: number, u: string) => unknown }) => {
      const ltik = res.locals?.ltik ?? '';
      return res.redirect(303, `/study?ltik=${encodeURIComponent(ltik)}`);
    });

    await lti.deploy({ serverless: true });

    // ltik-zaštićene API rute (POSLE deploy-a -> iza ltijs sessionValidator-a,
    // pa je res.locals.token validiran launch token). /study ih zove sa ?ltik=.
    lti.app.get('/api/lti/cards/due', async (_req: any, res: any) => {
      try {
        const token = res.locals.token;
        const userId = await upsertUserFromToken(token);
        const groupFilter = await groupFilterForToken(token);
        const cards = await getDueCards(userId, groupFilter);
        res.json({ cards });
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : 'Greška' });
      }
    });

    lti.app.post('/api/lti/review', async (req: any, res: any) => {
      try {
        const token = res.locals.token;
        const { cardId, rating } = req.body ?? {};
        if (!cardId || !rating || !(rating in RATING)) {
          return res.status(400).json({ error: 'Neispravan zahtev' });
        }
        const userId = await upsertUserFromToken(token);
        const r = await submitReview(userId, Number(cardId), RATING[rating as keyof typeof RATING]);
        res.json({ ok: true, ...r });
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : 'Greška' });
      }
    });

    return lti.app;
  })();

  return appPromise;
}
