import { Provider as lti } from 'ltijs';
import Database from 'ltijs-sequelize';
import { signSession } from './session';
import { fetchUserCourseGroups, courseIdFromToken } from './moodle';

export { lti };

const GROUPS_ENABLED = process.env.GROUPS_ENABLED === 'true';
const GROUPS_DEBUG = process.env.GROUPS_DEBUG === 'true';
// Resolve-uj grupe i kad je filter upaljen i kad je samo dijagnostika.
const RESOLVE_GROUPS = GROUPS_ENABLED || GROUPS_DEBUG;

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Grupe studenta iz LTI **custom parametra** (ne NRPS — core Moodle ne šalje grupe preko NRPS-a).
 * U Moodle External Tool config-u podesi custom parametar:
 *     groupids=$Moodle.Person.userGroupIds
 * Moodle pri launch-u zameni to listom ID-eva grupa korisnika (npr. "7,8").
 * Vraća { ids, raw } — ids = parsirani ID-evi (string), raw = original (za dijagnostiku).
 */
function getGroupsFromCustom(token: any): { ids: string[]; raw: string } {
  const custom: any = token?.platformContext?.custom ?? {};
  const raw = String(custom.groupids ?? custom.groupIds ?? custom.group_ids ?? '');
  const ids = raw
    .split(/[;,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (GROUPS_DEBUG) {
    console.log('[GROUPS_DEBUG] custom claim:', custom, '| groupids raw:', JSON.stringify(raw), '| ids:', ids);
  }
  return { ids, raw };
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

      // Admin = instruktor/administrator/menadžer u Moodle-u (LTI role claim).
      const roles: string[] = token.platformContext?.roles ?? token.roles ?? [];
      const isAdmin = roles.some((r) =>
        /instructor|administrator|manager|contentdeveloper/i.test(String(r)),
      );

      let groups: string[] = []; // grupe studenta: ID-evi I IMENA (matchujemo po oba)
      let groupsRaw: string | undefined; // dijagnostika (izvor + vrednost)
      let customDebug: string | undefined; // ceo custom claim (dijagnostika)
      if (RESOLVE_GROUPS) {
        // 1) Web Services (pouzdano, daje IMENA) — ako je MOODLE_WS_TOKEN podešen.
        const courseId = courseIdFromToken(token);
        if (process.env.MOODLE_WS_TOKEN && courseId && sub) {
          const mg = await fetchUserCourseGroups(courseId, sub);
          if (mg.length) {
            // Student.groups sadrži i ID-eve i imena -> zaglavlje u Sheet-u
            // može biti "Ime" ILI "Ime (ID)" — oba se poklapaju.
            groups = [...mg.map((g) => String(g.id)), ...mg.map((g) => g.name)];
            groupsRaw = `ws(course ${courseId}): ${mg.map((g) => `${g.name}(${g.id})`).join(', ')}`;
          } else {
            groupsRaw = `ws(course ${courseId}): (nijedna grupa)`;
          }
        }
        // 2) Fallback: custom param groupids (ako WS nije podešen ili nije dao ništa).
        if (groups.length === 0) {
          const g = getGroupsFromCustom(token);
          groups = g.ids;
          groupsRaw = groupsRaw ? `${groupsRaw} | custom: ${JSON.stringify(g.raw)}` : g.raw;
        }
      }
      if (GROUPS_DEBUG) {
        // Ispiši TAČNO šta je stiglo: ceo custom objekat + koji ključevi postoje u
        // platformContext-u (da vidimo šalje li Moodle custom uopšte i pod kojim imenom).
        const pc: any = token?.platformContext ?? {};
        customDebug = JSON.stringify({
          custom: pc.custom ?? null,
          customKeys: Object.keys(pc.custom ?? {}),
          platformContextKeys: Object.keys(pc),
        });
        console.log('[GROUPS_DEBUG] customDebug:', customDebug);
      }

      const session = signSession({ sub, name, groups, isAdmin, groupsRaw, customDebug });
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
