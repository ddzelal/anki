import { Provider as lti } from 'ltijs';
import Database from 'ltijs-sequelize';
import { signSession } from './session';

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

    // ltijs tabele žive u `public`; schema izolacija nije moguća (vidi CLAUDE.md).
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
        cookies: { secure: true, sameSite: 'None' },
        devMode: false,
        serverless: true,
      },
    );

    // Launch: identitet (sub, ime, grupe) -> potpisan session kolačić (30 dana).
    // Dalje app čita kolačić, pa radi na refresh bez ltik-a u URL-u.
    // 303 da posle Moodle POST launch-a browser uradi GET na /study.
    lti.onConnect(async (token: any, _req: unknown, res: any) => {
      const sub: string = token.user;
      const name: string | null = token.userInfo?.name ?? token.userInfo?.given_name ?? null;
      let groups: string[] = [];
      if (GROUPS_ENABLED) groups = await getUserGroups(token);

      // Admin = instruktor/administrator/menadžer u Moodle-u (LTI role claim).
      const roles: string[] = token.platformContext?.roles ?? token.roles ?? [];
      const isAdmin = roles.some((r) =>
        /instructor|administrator|manager|contentdeveloper/i.test(String(r)),
      );

      const session = signSession({ sub, name, groups, isAdmin });
      res.cookie('anki_session', session, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        maxAge: 365 * 24 * 60 * 60 * 1000, // ~godinu dana; progres u bazi je doživotan po `sub`
      });
      return res.redirect(303, '/study');
    });

    await lti.deploy({ serverless: true });
    return lti.app;
  })();

  return appPromise;
}
