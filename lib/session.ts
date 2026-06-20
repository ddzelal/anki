import jwt from 'jsonwebtoken';

/**
 * Trajni session kolačić (potpisan LTI_KEY-om) koji se postavi pri LTI launch-u.
 * Nosi identitet -> app radi na refresh bez oslanjanja na ltik u URL-u.
 */
export const SESSION_COOKIE = 'anki_session';

export interface Session {
  sub: string; // Moodle user id (stabilan)
  name: string | null;
  groups: string[]; // Moodle grupe ovog korisnika (prazno ako grupe nisu uključene/poznate)
  isAdmin: boolean; // instruktor/admin u Moodle-u
  allGroups?: string[]; // SVE grupe u kursu (dijagnostika; popunjeno samo za admina kad je debug/grupe upaljeno)
}

const SECRET = () => process.env.LTI_KEY ?? '';

export function signSession(s: Session): string {
  return jwt.sign(s, SECRET(), { expiresIn: '30d' });
}

export function verifySession(token: string | undefined | null): Session | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, SECRET()) as Session;
    return {
      sub: p.sub,
      name: p.name ?? null,
      groups: Array.isArray(p.groups) ? p.groups : [],
      isAdmin: !!p.isAdmin,
      allGroups: Array.isArray(p.allGroups) ? p.allGroups : undefined,
    };
  } catch {
    return null;
  }
}
