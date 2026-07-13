import { createHash } from 'crypto';

/**
 * Stabilni ključ kartice = hash(front + back).
 *
 * Kartica se identifikuje SVOJIM SADRŽAJEM (front+back), ne bazičnim ID-em.
 * Tako reči žive samo u Google Sheet-u, a napredak (FSRS) u bazi se veže za ovaj ključ —
 * nema potrebe za sinhronizacijom kartica u bazu.
 *
 * Zašto front+back (a ne samo front): deck ima homografe (isti front, npr. "هُوَ") i
 * "obrnute" kartice (Brat→أَخٌ i أَخٌ→Brat) — tek par (front,back) ih jedinstveno razdvaja.
 *
 * Napomena: ako se front ILI back naknadno izmene u Sheet-u, kartica dobija nov ključ
 * (njen dotadašnji napredak se efektivno resetuje). Za rečnik je to retko i prihvatljivo.
 */
export function cardKey(front: string, back: string): string {
  // \x1f (unit separator) se ne pojavljuje u tekstu -> nema kolizije "ab"+"c" vs "a"+"bc".
  const norm = `${front.trim()}\x1f${back.trim()}`;
  return createHash('sha256').update(norm, 'utf8').digest('base64url').slice(0, 22);
}
