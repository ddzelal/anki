/**
 * Registruje Moodle kao LTI platformu u našoj bazi (tabela platforms).
 * Pokreni JEDNOM, posle kreiranja alatke u Moodle-u (kad dobiješ Client ID):
 *   pnpm tsx --env-file=.env.local scripts/register-platform.ts
 *
 * Potrebno u .env.local:
 *   MOODLE_CLIENT_ID=...            (Moodle ga generiše)
 *   MOODLE_PLATFORM_URL=...         (issuer; default https://learn.ulum.rs)
 *   MOODLE_DEPLOYMENT_ID=...        (Moodle ga generiše; opciono ali preporučeno)
 * Endpointi imaju default-e za standardni Moodle, pregazi ih ako treba.
 */
import { getLtiApp, lti } from '../lib/lti';

async function main() {
  const url = process.env.MOODLE_PLATFORM_URL ?? 'https://learn.ulum.rs';
  const clientId = process.env.MOODLE_CLIENT_ID;
  if (!clientId) throw new Error('Fali MOODLE_CLIENT_ID u .env.local');

  await getLtiApp(); // setup + deploy + DB

  const platform = await lti.registerPlatform({
    url,
    name: 'Moodle Ulum',
    clientId,
    authenticationEndpoint: process.env.MOODLE_AUTH_ENDPOINT ?? `${url}/mod/lti/auth.php`,
    accesstokenEndpoint: process.env.MOODLE_TOKEN_ENDPOINT ?? `${url}/mod/lti/token.php`,
    authConfig: {
      method: 'JWK_SET',
      key: process.env.MOODLE_KEYSET_URL ?? `${url}/mod/lti/certs.php`,
    },
  });

  console.log('Platforma registrovana:');
  console.log('  url      :', url);
  console.log('  clientId :', clientId);
  console.log('  kid      :', await platform.platformKid?.());
  console.log('Proveri /api/lti/keys — sad treba da vrati javni ključ.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Registracija greška:', e);
  process.exit(1);
});
