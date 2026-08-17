# SparkClaw AI Arena database conventions

All new AI Arena tables use the `public.sc_arena_` prefix. Private helper functions use the `sc_arena_private` schema.

The current workspace has two different Supabase projects:

- Arena Auth and Arena-owned data: `SUPABASE_URL`
- Read-only SparkClaw Program DB: `SPARKCLAW_PROGRAM_SUPABASE_URL`

The activity ledger migration belongs in the Arena Auth project because its foreign keys reference `auth.users`. Do not run it against the Program DB.

## Activity model

- Domain tables hold current state.
- `sc_arena_activity_events` holds immutable history.
- `sc_arena_activity_event_entities` relates an event to companies, posts, comments, Bounties, and requests.
- `sc_arena_activity_viewers` adds explicit recipients such as the owner of a post receiving a comment.
- `sc_arena_activity_user_state` stores per-user read and archive state without mutating the event.

## Administrator and development logs

- `sc_arena_admin_audit_logs` is a seven-year, append-only audit projection of every authoritative `staff` and `admin` activity event. A database trigger writes it in the same transaction and the migration backfills existing staff history.
- `sc_arena_development_logs` stores sanitized server diagnostics for 180 days. It never accepts request bodies, authorization headers, cookies, tokens, secrets, query strings, or raw user content.
- Browser roles have no direct table access. `sc_arena_append_development_log` is `service_role`-only; the two read RPCs verify an active workspace staff membership before returning rows.
- Apply `20260817173000_sc_arena_admin_and_development_logs.sql` to the Arena Auth project, never the Program DB.

## SparkLabs Google login

1. Create a Google OAuth Web client and register the Arena origin. Use the Supabase project callback URL shown on its Google provider page as the Google authorized redirect URI.
2. Enable Google in the Arena Auth Supabase project and add `https://sparkclaw-arena.netlify.app/arena/` to Supabase Auth redirect URLs.
3. Set `SPARKLABS_ARENA_GOOGLE_ADMIN_LOGIN_ENABLED=true` in Netlify only after the provider is live.
4. Google authentication does not grant staff access by itself. Server-side `viewerFromUser` still requires the verified email to match `SPARKLABS_ARENA_ADMIN_DOMAINS` or the explicit administrator allowlist.

## Company logo assets

- `sc_arena_organization_assets` links each `sc_arena_organizations` row to its current logo object and records the source URL, source host, MIME type, byte size, SHA-256 checksum, display tone, and verification state.
- The image bytes live in the public Supabase Storage bucket `sc-arena-company-assets`; the database stores only the relationship and audit metadata.
- Existing files under `public/arena/assets/company-logos` remain the application fallback so a Storage outage does not remove logos from the deployed site.
- Re-run `pnpm run sync:company-logos:db` with `SUPABASE_URL` and a server-only `SUPABASE_SECRET_KEY` to idempotently upload the curated local set and refresh its metadata. Never expose the secret key in client code.

## Weekly Highlighted Companies

- `sc_arena_featured_snapshots` stores one stable curation cycle, while `sc_arena_featured_snapshot_items` relates its ranked companies to `sc_arena_organizations`.
- The `weekly-featured-refresh` Netlify scheduled function runs every Monday at 09:00 KST (`0 0 * * 1` in UTC).
- Ranking uses completed SparkClaw weekly-update signals such as customer validation, PMF progress, mentoring participation, and execution completion. Raw counts and detailed traction signals remain service-only.
- The client receives only the ranked company, safe achievement summary, hook, and keywords. If no weekly update is complete or the refresh fails, the previous snapshot remains active; the reviewed editorial list remains the final UI fallback.

Apply schema changes as reviewed, versioned migrations. Confirm the exact remote project ref before running `supabase db push`.
