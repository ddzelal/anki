# Anki kartice za Moodle — Implementacioni plan (finalni)

Next.js app sa Anki/FSRS karticama, embedovana u Moodle kurs arapskog preko LTI 1.3,
SSO preko Moodle-a, podaci u Supabase (deljeni projekat) + Google Sheet kao izvor reči.

> Status: data-layer (Supabase šema + Google Sheet `Access` tab) je **već primenjen**. Vidi §10.

---

## 1. Tok

```
Moodle (LTI Platform)               Vercel: Next.js (LTI Tool)        Supabase Postgres
 ┌──────────────────┐  launch JWT   ┌────────────────────────┐  state  ┌────────────────────┐
 │ Kurs "Arapski"   │ ────────────▶ │ ltijs (serverless)     │ ──────▶ │ anki_lti.* (ltijs) │
 │ External Tool    │  id_token     │  - OIDC login init     │         │ anki_cards         │
 │ + grupe (NRPS)   │ ◀──────────── │  - launch verifikacija │         │ anki_group_access  │
 └──────────────────┘  NRPS poziv   │  - kartice + FSRS API  │         │ anki_users         │
                                    └────────────────────────┘         │ anki_reviews       │
                  Google Sheet (AnkiCard) ──sync──┘                     └────────────────────┘
```

Klik na aktivnost → Moodle šalje potpisani `id_token` → ltijs verifikuje → app zna korisnika,
kurs i Moodle grupu → servira due kartice iz lekcija dozvoljenih toj grupi → korisnik ocenjuje
(Again/Hard/Good/Easy) → FSRS upisuje sledeći termin. **Bez zasebnog logina.**

---

## 2. Stack
- **Next.js** (App Router, TS) na **Vercel**
- **ltijs** + **ltijs-sequelize** (LTI 1.3, sve stanje u Postgresu)
- **Supabase Postgres** (preko POOLER URL-a, Transaction mode)
- **ts-fsrs** (scheduling)
- **googleapis** (čitanje Google Sheet-a, Service Account — već konfigurisan)

---

## 3. KLJUČNI KONCEPT: Lekcija ≠ Grupa (+ imenovanje u sheet-u)

- **Lekcija** — sadržajna oznaka reči ("Lekcija 1"). U sheet-u je u koloni koja se **zove `group`**
  (istorijski naziv) → mapira se na `anki_cards.lesson`. NE mešati sa Moodle grupom.
- **Moodle grupa** — grupa unutar kursa ("Arapski 1"), čita se preko **NRPS-a**. Ne postoji u sheet-u
  (osim u `Access` tabu kao maperski ključ).
- Pristup = mapa **Moodle grupa → lekcije** (`anki_group_access`). Reč nosi samo lekciju.

Runtime: NRPS vrati Moodle grupu → nađu se dozvoljene lekcije → serviraju kartice iz njih.

---

## 4. Šema baze (PRIMENJENO ✓)

Naše tabele u `public` sa `anki_` prefiksom; ltijs sistemske tabele u schema `anki_lti`.

```sql
-- ltijs sistemske tabele -> izolovani schema (sequelize: schema: 'anki_lti')
create schema if not exists anki_lti;

create table public.anki_cards (
  id bigserial primary key,
  front text not null, back text not null,
  lesson text not null,            -- iz sheet kolone "group"
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create table public.anki_group_access (
  id bigserial primary key,
  group_name text not null,        -- Moodle grupa "Arapski 1"
  lesson text not null,            -- "Lekcija 1"
  unique (group_name, lesson)
);

create table public.anki_users (
  id bigserial primary key,
  moodle_sub text not null unique,
  display_name text,
  created_at timestamptz default now()
);

create table public.anki_reviews (
  id bigserial primary key,
  user_id bigint not null references public.anki_users(id) on delete cascade,
  card_id bigint not null references public.anki_cards(id) on delete cascade,
  due timestamptz not null,
  stability double precision not null, difficulty double precision not null,
  elapsed_days int not null default 0, scheduled_days int not null default 0,
  reps int not null default 0, lapses int not null default 0,
  state int not null default 0, last_review timestamptz,
  unique (user_id, card_id)
);
create index on public.anki_reviews (user_id, due);
create index on public.anki_cards (lesson);
```

Sve 4 tabele imaju **RLS enabled bez politika** → nedostupne preko javnog PostgREST API-ja.
Server im pristupa preko direktne Postgres konekcije (`DATABASE_URL`), koja zaobilazi RLS.

---

## 5. Google Sheet (AnkiCard — `1fXEufaOEC7qb9X1iWaBh2zU9h2au9FQepkL0njuQHXk`)

- **Aktivni tab: `CardsV2`** (`sheetId 1761201601`). NE `Cards` (legacy).

| A: front | B: back | C: group (= lesson) | D: isActive |
|----------|---------|---------------------|-------------|
| كتاب | knjiga | Lekcija 1 | TRUE |

- **Tab `Access`** (kreiran ✓) — mapa Moodle grupa → lekcija:

| A: group | B: lesson | C: _napomena |
|----------|-----------|--------------|
| Arapski 1 | Lekcija 1 | (primer — zameni stvarnim imenima Moodle grupa) |

- **Obrnute kartice** (Srpski→Arapski, prazan `group`): u syncu **naslediti lekciju od parnjaka**
  (po `front`/`back` paru), ne preskakati.

---

## 6. Env

```
DATABASE_URL=                 # Supabase POOLER URL (Transaction mode), projekat apwwevsyealtsnywwzak
DB_SCHEMA_LTI=anki_lti        # ltijs sequelize schema
LTI_KEY=                      # generisati nasumično
NEXT_PUBLIC_MOODLE_URL=https://learn.ulum.rs/my/
GOOGLE_SHEETS_CLIENT_EMAIL=anki-card-service@ankicard-483710.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY=    # ROTIRATI (bio izložen) -> novi key u GCP, obrisati stari
GOOGLE_SHEETS_SPREADSHEET_ID=1fXEufaOEC7qb9X1iWaBh2zU9h2au9FQepkL0njuQHXk
GOOGLE_SHEETS_ACTIVE_TAB=CardsV2
# LTI platform (Client ID, auth/token/keyset URL) — posle registracije u Moodle-u
```

---

## 7. Faze izrade

### Faza 1 — Scaffold + ltijs serverless
- `npx create-next-app@latest` (App Router, TS), pa `npm i ltijs ltijs-sequelize ts-fsrs googleapis pg`.
- ltijs u serverless modu sa Postgres backendom, **`schema: 'anki_lti'`** u sequelize opcijama,
  `cookies: { secure: true, sameSite: 'None' }` (iframe), `devMode: false`.
- Catch-all API ruta (`app/api/lti/[...slug]/route.ts`) delegira na deployovani ltijs Express app.
  Fallback ako zapne: `@hubroeducation/ltijs` fork (bolja serverless podrška).
- Sve stanje u Postgresu (Vercel gasi funkcije).

### Faza 2 — Šema baze ✓ (urađeno, vidi §4/§10)

### Faza 3 — Google Sheets sync
- `getCardsFromSheet`: čita `CardsV2`, mapira kolonu `group` → `lesson`, `isActive` → bool.
  Prazan `group` → nasledi lekciju od parnjaka.
- `getAccessFromSheet`: čita tab `Access` → `anki_group_access`.
- `POST /api/sync` (zaštićen tajnom) ili lokalna skripta: upsert u `anki_cards` i `anki_group_access`.

### Faza 4 — FSRS + review API
- `GET /api/cards/due`: lekcije dozvoljene grupi korisnika ∩ (kartice bez review reda ILI `due <= now`).
- `POST /api/review`: card_id + rating → `ts-fsrs` → upsert u `anki_reviews`.

### Faza 5 — Frontend (launch view)
- Anki UI: `front` → flip → `back` → 4 dugmeta. Identitet/grupa iz ltijs sesije (ne sa klijenta).

### Faza 6 — Registracija u Moodle + NRPS
- Deploy na Vercel → URL-ovi. Moodle: Site admin → Plugins → External tool → Add LTI Advantage.
- Unesi Tool/Login(OIDC)/Redirect/Keyset URL. **Uključi NRPS + Course Groups.**
- Moodle daje Client ID/Platform ID/keyset/auth/token → `lti.registerPlatform({...})`.
- Provera: da li NRPS na Moodle 5.1 vraća group membership; fallback = grupa kao LTI custom parametar.

### Faza 7 — Embed u kurs + test
- External Tool aktivnost u kursu. Test kao učenik. iframe vs novi prozor (ako kolačići padnu → New window).

---

## 8. Rizici
1. Vercel serverless — ltijs MORA koristiti Postgres (nema memorije).
2. Kolačići u iframe-u — `SameSite=None; Secure` + HTTPS; fallback novi prozor.
3. Supabase konekcije — POOLER URL, ne direktni.
4. NRPS grupe — potvrditi membership; fallback custom parametar.
5. ltijs u Next.js — Express-u-serverless montiranje je najveći integracioni rizik.
6. Deljeni Supabase — ltijs tabele u `anki_lti` schema; naše `anki_` + RLS lockdown (urađeno).
7. `group` vs `lesson` — sheet kolona "group" je lekcija; ne pomešati sa Moodle grupom.

---

## 9. Verifikacija (pre produkcije)
- [ ] SSO launch radi, bez zasebnog logina.
- [ ] `token.user` (sub) stabilan, mapiran u `anki_users`.
- [ ] Moodle grupa se tačno čita (NRPS ili fallback).
- [ ] Due kartice = samo lekcije dozvoljene grupi.
- [ ] FSRS: ocena menja `due`, stanje se čuva.
- [ ] Sync puni `anki_cards` i `anki_group_access` (uklj. obrnute kartice).
- [ ] Radi u iframe-u i/ili novom prozoru.

---

## 10. Već urađeno
**Data-layer (Supabase):**
- ✓ Migracija `anki_initial_schema`: schema `anki_lti` + 4 `anki_` tabele.
- ✓ Migracija `anki_enable_rls_lockdown`: RLS na sve 4 tabele.
- ✓ Migracija `anki_cards_unique_front_back`: unique (front, back) za idempotentan sync.
- ✓ Google Sheet: kreiran tab `Access` (`group | lesson | _napomena`).

**App scaffold (Faza 1 delom + temelj za Faze 3/4):**
- ✓ Next.js 16.2.9 (App Router, TS, Tailwind 4, pnpm) u korenu repo-a.
- ✓ Deps: ltijs 5.9.9, ltijs-sequelize, ts-fsrs, googleapis, pg, tsx.
- ✓ `lib/db.ts` (pg pool), `lib/sheets.ts` (CardsV2 + Access, group→lesson, forward-fill),
  `lib/fsrs.ts` (ts-fsrs wrapper), `scripts/sync.ts` (`pnpm sync`).
- ✓ `.env.example`. Typecheck prolazi.

**Podaci učitani ✓:** `anki_cards` 727, `anki_group_access` 4 (preko MCP-a; vidi §11).

**Faza 1 — VALIDIRANO ✓ (DB konekcija radi):**
- ✓ Arhitektura: ltijs preko **Pages Router API rute** `pages/api/lti/[...path].ts`
  (ne App Router catch-all — ltijs/Express traži native Node req/res; Pages API to daje direktno).
- ✓ `lib/lti.ts` — ltijs serverless, Postgres backend. `types/ltijs.d.ts` (ltijs nema tipove).
- ✓ `pnpm dev` diže ltijs, migracije prolaze, **`GET /api/lti/keys` → 200 `{"keys":[]}`** (JWKS živ;
  ključevi se generišu po registraciji platforme).
- ⚠️ Odluka izmenjena: **ltijs tabele su u `public`** (ne `anki_lti`). Schema izolacija ne radi —
  ltijs-sequelize migracije koriste nekvalifikovana imena, a transaction pooler ignoriše search_path.
  Sve ltijs tabele su RLS-locked. Naše tabele i dalje `anki_` prefiks.
- ✓ Podaci očišćeni: `anki_cards` = 727 (truncate + `pnpm sync` iz sheet-a; ručni MCP unos je bio
  uveo ~138 pokvarenih redova — sheet je jedini izvor istine).

**Faze 3–5 — VALIDIRANO ✓:**
- ✓ Sync izdvojen u `lib/sync.ts` (deli ga CLI `pnpm sync` i `POST /api/sync`).
- ✓ `POST /api/sync` — zaštićen `SYNC_SECRET` headerom (`x-sync-secret`); pogrešna tajna → 401.
- ✓ Admin UI `/admin` — dugme „Pokreni Sync" (tajna u localStorage).
- ✓ `lib/cards.ts` (getDueCards + submitReview/FSRS), `lib/identity.ts` (dev korisnik vidi sve
  lekcije; TODO Faza 6: LTI sesija → moodle_sub + grupa).
- ✓ `GET /api/cards/due`, `POST /api/review` — testirani (FSRS zakazuje sledeći termin).
- ✓ Anki UI `/study` — flip kartica + Ponovo/Teško/Dobro/Lako; arapski render OK (hareketi).
- ✓ Landing `/` sa linkovima.

**Sledeće:**
1. **Faza 6: Moodle (od nule, zajedno)** — registracija LTI 1.3 alatke na learn.ulum.rs,
   NRPS + grupe, `lti.registerPlatform({...})`, embed u kurs.
2. Faza 6 dovršava `lib/identity.ts`: LTI sesija → moodle_sub + Moodle grupa → lekcije
   iz `anki_group_access` (zameniti dev fallback).
3. Kasnije: gate `/admin` iza LTI instructor role (sad samo SYNC_SECRET).
