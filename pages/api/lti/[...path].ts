import type { NextApiRequest, NextApiResponse } from 'next';
import { getLtiApp } from '@/lib/lti';

/**
 * Bridge: montira ltijs (Express) u Next.js Pages API rutu.
 * Pages Router daje native Node req/res koje Express očekuje.
 * ltijs sam upravlja telom zahteva -> isključujemo Next bodyParser.
 *
 * NIJE još testirano — čeka ispravan DATABASE_URL (DB konekcija u getLtiApp()).
 */
export const config = {
  api: { bodyParser: false, externalResolver: true },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const app = await getLtiApp();
  // Next.js pre-popunjava req.cookies, zbog čega ltijs-ov cookie-parser radi
  // `if (req.cookies) return next()` i NIKAD ne postavi req.secret -> potpisani
  // kolačići pucaju ("cookieParser secret required"). Brišemo da cookie-parser
  // odradi pun parse (req.secret + signedCookies).
  delete (req as { cookies?: unknown }).cookies;
  // Express app je (req, res) handler
  return (app as unknown as (req: NextApiRequest, res: NextApiResponse) => void)(req, res);
}
