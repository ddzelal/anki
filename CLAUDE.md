# CLAUDE.md

Project conventions for the Anki project. Read this before working with Google Sheets or Supabase.

## Design system (match ulum.rs)

UI follows the Ulum Academy look: **light theme**, **Roboto** font, rounded cards, soft shadows, generous spacing. Palette is defined as Tailwind 4 `@theme` colors in `app/globals.css` — use these utilities, don't hardcode hex:

- `ulum-blue` `#284b70` (primary / headings / front of card) · `ulum-blue-dark` for hover
- `ulum-green` `#77a290` (success / answers / progress bar) · `ulum-green-dark` for hover
- `ulum-pink` `#cc3366` (accent / "Again" / errors)
- `ulum-yellow` `#fdd05a` (accent / "Hard", use dark text on it)
- `ulum-cream` `#f4efe6`, `ulum-paper` `#faf7f2` (backgrounds), `ulum-ink` `#33373d` (text)

Pages: `/` landing, `/study` (flashcards + name + progress card with stats: Ukupno/Naučeno/Za danas/Nove), `/admin` (sync). The logged-in user's name + avatar initial show in the `/study` header.

## Google Sheets

- **Spreadsheet:** `AnkiCard` — ID `1fXEufaOEC7qb9X1iWaBh2zU9h2au9FQepkL0njuQHXk`
- **Active sheet (use this one for all work):** `CardsV2` — `sheetId: 1761201601`
  - Do **not** use the old `Cards` sheet (sheetId 0) — it is legacy. All reads/writes go to `CardsV2`.
  - Columns: `front` | `back` | `lesson` | `isActive` | `groups`
    - `lesson` = content label ("Lekcija 1"); empty cell inherits the previous row's lesson.
    - `isActive` = TRUE/FALSE; FALSE hides the card from everyone (global on/off).
    - `groups` = comma/`;`-separated Moodle group names that may see the card; **empty = visible to all groups** (no restriction). This is **per-word** access control.
- **`Settings` tab** = app config as `key | value` rows. Currently: `new_per_day` (daily NEW-card limit per student; default 10). Synced into `anki_settings`.
- Access via the `gsheets` MCP server (already configured, local scope).

## Supabase

- **Project:** `apwwevsyealtsnywwzak` (shared — we hit the Supabase project limit; also hosts a courts/booking app).
- **Our app tables:** in `public`, prefixed `anki_` (visible in Table Editor). Created & RLS-locked:
  - `anki_cards` (front, back, lesson, is_active) — `lesson` is a content label only (not access)
  - `anki_card_groups` (card_id, group_name) — **per-word** access: which Moodle groups may see a card. A card with **no rows here = visible to all groups**.
  - `anki_users` (moodle_sub, display_name)
  - `anki_reviews` (FSRS state per user/card; `introduced_at` = when a card was first seen, used for the daily new-card limit)
  - `anki_review_log` (one row per rating event; powers the day-streak)
  - `anki_settings` (key/value app config from the Sheet `Settings` tab, e.g. `new_per_day`)
  - All have **RLS enabled with no policies** → not reachable via the public PostgREST API. The server talks to them via direct Postgres connection (`DATABASE_URL` pooler), which bypasses RLS.
- **ltijs system tables:** live in `public` (unprefixed: `platforms`, `idtokens`, `contexttokens`, `platformStatuses`, `publickeys`, `privatekeys`, `accesstokens`, `nonces`, `states`, `SequelizeMeta`). Schema isolation was attempted (`anki_lti`) but is **not feasible**: ltijs-sequelize migrations use unqualified table names and the transaction pooler (required for serverless) ignores the `search_path` startup option. Names don't collide with the courts app. All are **RLS-locked** (they hold private keys/tokens; ltijs connects as `postgres` which bypasses RLS).
- For OUR app tables, never create bare-named tables in `public` — always `anki_` prefix. (ltijs tables are the documented exception, managed by the library.)
- **Card data source of truth = the Google Sheet.** Load via `pnpm sync` (reads CardsV2 directly). Do NOT hand-write card INSERTs — manual transcription of Arabic corrupts rows.
- Access via the `supabase` MCP server.

## Moodle

- Instance: `https://learn.ulum.rs` (`NEXT_PUBLIC_MOODLE_URL`). LTI 1.3 platform, registered (client `HwtO0SEjOBUdFAO`, deployment `1`). Launch flow: `/api/lti/login` (OIDC) → `/api/lti/launch` → 303 redirect to `/study?ltik=...`.
- **Identity via a signed session cookie** (NOT ltik). At launch, `onConnect` builds `{sub, name, groups}`, signs it with `LTI_KEY` (jsonwebtoken, 30d) and sets the httpOnly cookie `anki_session` (`lib/session.ts`), then 303-redirects to `/study` (no ltik in the URL). The App Router routes `GET /api/cards/due` + `POST /api/review` read that cookie via `resolveUser` (`lib/identity.ts`): valid cookie → real student (`token.user` = Moodle `sub` → `anki_users`, own FSRS progress, name shown in `/study`); no/invalid cookie → dev fallback (`dev-local`, sees all). This makes refresh work and decouples from ltik expiry. Groups are resolved once at launch (NRPS) and cached in the cookie.
- **Access model = per-word groups (not per-lesson).** A card is shown to a student iff `is_active = true` AND (the card has no `anki_card_groups` rows → visible to all, OR one of its groups matches the student's Moodle group). `lesson` is display metadata only.
- **Groups behind a flag** `GROUPS_ENABLED` (default false). False = no group filtering at all (every active card visible to everyone) — `getDueCards(userId, null)`. True = filter by the student's NRPS groups — `getDueCards(userId, groups[])`. Flip to true (env var) once students are assigned to groups and NRPS is verified on this Moodle. Real group name so far: `arapski_jezik_decembar_2025`. NRPS group resolution (`getUserGroups` in lib/lti.ts) is written but UNVERIFIED — test when enabling.
- **Admin = LTI role.** At launch, `onConnect` checks the roles claim; Instructor/Administrator/Manager → `isAdmin` in the session cookie. `/api/sync` accepts an **admin cookie OR** the `SYNC_SECRET` header (CLI fallback). `/api/me` exposes `{name, isAdmin}`. In `/study` the header menu (≡) shows admin actions (Sync cards, Admin panel) only for admins; everyone gets Refresh/Home. Dev fallback (no cookie) is admin only in development (`NODE_ENV !== 'production'`), never in prod.
- **`runSync` is bulk** (one `unnest` upsert + `delete` of `anki_card_groups`, not per-row loops or `TRUNCATE`). Per-row loops took ~60s (network round-trips) and `TRUNCATE` took an ACCESS EXCLUSIVE lock that blocked studying users — both would time out on Vercel. Keep sync set-based.
- The Next.js↔ltijs bridge (`pages/api/lti/[...path].ts`) must `delete req.cookies` (Next pre-populates it, which makes cookie-parser skip and never set `req.secret` → signed-cookie failure).
