import { Provider as lti } from 'ltijs';
import Database from 'ltijs-sequelize';
import { signSession } from './session';

export { lti };

const GROUPS_ENABLED = process.env.GROUPS_ENABLED === 'true';
const GROUPS_DEBUG = process.env.GROUPS_DEBUG === 'true';
// Resolve-uj grupe i kad je filter upaljen i kad je samo dijagnostika.
const RESOLVE_GROUPS = GROUPS_ENABLED || GROUPS_DEBUG;

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Grupe iz NRPS-a. Vraća { mine, all }:
 *   mine = grupe TRENUTNOG korisnika; all = sve grupe u kontekstu (za dijagnostiku).
 *
 * VAŽNO: Moodle uključuje grupe u NRPS odgovor SAMO ako se traži `?groups=true`.
 * Tada su definicije grupa u top-level `groups` nizu (id+name), a svaki član ima
 * `group_enrollments` sa `group_id` (referenca na te definicije) — NE ime direktno.
 */
async function getGroups(token: any): Promise<{ mine: string[]; all: string[] }> {
  try {
    const base: string | undefined = token?.platformContext?.namesRoles?.context_memberships_url;
    if (!base) {
      if (GROUPS_DEBUG) console.log('[GROUPS_DEBUG] nema namesRoles.context_memberships_url u tokenu');
      return { mine: [], all: [] };
    }
    // Eksplicitno traži grupe (Moodle ext). options.url -> ltijs gađa baš ovaj URL.
    const url = base + (base.includes('?') ? '&' : '?') + 'groups=true';
    const result: any = await lti.NamesAndRoles.getMembers(token, { url, pages: false });

    const members: any[] = result?.members ?? [];
    const groupDefs: any[] = result?.groups ?? []; // top-level definicije {id, name}
    const idToName = new Map<string, string>(
      groupDefs.map((g) => [String(g.id), g.name ?? g.title ?? String(g.id)]),
    );

    // Nazivi grupa jednog člana: preko group_enrollments (group_id) -> ime, uz fallback na inline.
    const namesOf = (m: any): string[] => {
      const enr: any[] = m?.group_enrollments ?? m?.groups ?? [];
      return enr
        .map((x) => {
          if (typeof x === 'string') return idToName.get(x) ?? x;
          const id = x.group_id ?? x.id;
          return idToName.get(String(id)) ?? x.name ?? x.title ?? (id != null ? String(id) : '');
        })
        .filter(Boolean);
    };

    const me = members.find((m) => m.user_id === token.user);
    const mine = me ? namesOf(me) : [];
    // "Sve grupe" = top-level definicije ako postoje, inače unija po članovima.
    const all = (
      groupDefs.length
        ? groupDefs.map((g) => g.name ?? g.title ?? String(g.id))
        : [...new Set(members.flatMap(namesOf))]
    )
      .filter(Boolean)
      .sort();

    if (GROUPS_DEBUG) {
      console.log(
        '[GROUPS_DEBUG] članova:',
        members.length,
        '| group defs:',
        groupDefs.length,
        '| moje grupe:',
        mine,
        '| sve grupe:',
        all,
      );
      if (members.length && !groupDefs.length) {
        console.log(
          '[GROUPS_DEBUG] članovi stigli ali bez grupa — primer ključeva člana:',
          Object.keys(members[0] ?? {}),
        );
      }
    }
    return { mine, all };
  } catch (e) {
    console.error('NRPS getMembers nije uspeo:', e);
    return { mine: [], all: [] };
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

      // Admin = instruktor/administrator/menadžer u Moodle-u (LTI role claim).
      const roles: string[] = token.platformContext?.roles ?? token.roles ?? [];
      const isAdmin = roles.some((r) =>
        /instructor|administrator|manager|contentdeveloper/i.test(String(r)),
      );

      let groups: string[] = [];
      let allGroups: string[] | undefined;
      if (RESOLVE_GROUPS) {
        const g = await getGroups(token);
        groups = g.mine;
        // listu svih grupa kursa nosimo samo adminu (za dijagnostiku u /admin)
        if (isAdmin) allGroups = g.all;
      }

      const session = signSession({ sub, name, groups, isAdmin, allGroups });
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
