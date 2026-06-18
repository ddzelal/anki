# CLAUDE.md

Project conventions for the Anki project. Read this before working with Google Sheets or Supabase.

## Google Sheets

- **Spreadsheet:** `AnkiCard` — ID `1fXEufaOEC7qb9X1iWaBh2zU9h2au9FQepkL0njuQHXk`
- **Active sheet (use this one for all work):** `CardsV2` — `sheetId: 1761201601`
  - Do **not** use the old `Cards` sheet (sheetId 0) — it is legacy. All reads/writes go to `CardsV2`.
  - Columns: `front` | `back` | `group` | `isActive`
- Access via the `gsheets` MCP server (already configured, local scope).

## Supabase

- **Project:** `apwwevsyealtsnywwzak` (shared — we hit the Supabase project limit; also hosts a courts/booking app).
- **Our app tables:** in `public`, prefixed `anki_` (visible in Table Editor). Created & RLS-locked:
  - `anki_cards` (front, back, lesson, is_active) — `lesson` comes from the sheet's `group` column
  - `anki_group_access` (group_name = Moodle group, lesson)
  - `anki_users` (moodle_sub, display_name)
  - `anki_reviews` (FSRS state per user/card)
  - All have **RLS enabled with no policies** → not reachable via the public PostgREST API. The server talks to them via direct Postgres connection (`DATABASE_URL` pooler), which bypasses RLS.
- **ltijs system tables:** live in `public` (unprefixed: `platforms`, `idtokens`, `contexttokens`, `platformStatuses`, `publickeys`, `privatekeys`, `accesstokens`, `nonces`, `states`, `SequelizeMeta`). Schema isolation was attempted (`anki_lti`) but is **not feasible**: ltijs-sequelize migrations use unqualified table names and the transaction pooler (required for serverless) ignores the `search_path` startup option. Names don't collide with the courts app. All are **RLS-locked** (they hold private keys/tokens; ltijs connects as `postgres` which bypasses RLS).
- For OUR app tables, never create bare-named tables in `public` — always `anki_` prefix. (ltijs tables are the documented exception, managed by the library.)
- **Card data source of truth = the Google Sheet.** Load via `pnpm sync` (reads CardsV2 directly). Do NOT hand-write card INSERTs — manual transcription of Arabic corrupts rows.
- Access via the `supabase` MCP server.

## Moodle

- Instance: `https://learn.ulum.rs` (`NEXT_PUBLIC_MOODLE_URL`). LTI 1.3 platform, registered (client `HwtO0SEjOBUdFAO`, deployment `1`). Launch flow: `/api/lti/login` (OIDC) → `/api/lti/launch` → 303 redirect to `/study?ltik=...`.
- **Identity:** real per-student from the ltijs token (`token.user` = Moodle `sub`) → `anki_users` (own FSRS progress). The ltik-protected API routes `GET /api/lti/cards/due` and `POST /api/lti/review` (registered inside the ltijs Express app, after `lti.deploy`, so they sit behind ltijs sessionValidator) use it. `/study` sends the ltik (`?ltik=`); without a ltik it falls back to the dev routes `/api/cards/due` + `/api/review` for local testing.
- **Groups behind a flag** `GROUPS_ENABLED` (default false). False = everyone sees all lessons (groups ignored). True = NRPS → Moodle group → lessons via `anki_group_access`. Flip to true (env var) once students are assigned to groups and NRPS is verified to return group info on this Moodle. Real group name: `arapski_jezik_decembar_2025`.
- The Next.js↔ltijs bridge (`pages/api/lti/[...path].ts`) must `delete req.cookies` (Next pre-populates it, which makes cookie-parser skip and never set `req.secret` → signed-cookie failure).
