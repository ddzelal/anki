import { Provider as lti } from 'ltijs';
import Database from 'ltijs-sequelize';

export { lti };

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
    return lti.app;
  })();

  return appPromise;
}
