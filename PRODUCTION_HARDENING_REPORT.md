# SparkClaw AI Arena Production Hardening Report

Date: 2026-06-30

## Architecture map

- Delivery: Netlify static site from `public/`, with `/arena/` serving the browser app and Netlify Functions behind `/api/arena`, `/api/arena-auth`, and `/api/b2b-match`.
- Auth: the browser fetches public Supabase login config from `/api/arena-auth`, signs in with Supabase using the publishable anon key, then sends the access token to Netlify Functions. The server validates the token through Supabase `/auth/v1/user`.
- Main API: `/api/arena` loads Arena events from Netlify Blobs, product submissions from Supabase REST, and competition events from Netlify Blobs. It builds a full server snapshot, then filters it for the authenticated viewer.
- Submissions: `netlify/lib/arena-submissions.mjs` normalizes, validates, and sanitizes member product submissions. Supabase `arena_submissions` stores indexed columns plus the full JSON payload.
- Competition scoring: `netlify/lib/competition/` keeps hidden solution data server-side, validates CSV submissions, computes public/private scores, and ranks submissions with benchmark score plus Bradley-Terry confidence.
- B2B matchability: the browser calls `/api/b2b-match`; Anthropic is called only from the server via `ANTHROPIC_API_KEY`, with deterministic fallback when the key or provider is unavailable.
- Rendering: the browser uses escaped HTML/text rendering for user-authored fields. A shared `public/arena/sanitize.js` helper now makes that escaping directly testable.

## P0 changes completed

- Hardened privileged role derivation so staff, B2B partner, and human-validator privileges come only from server allowlists or Supabase `app_metadata`, not user-editable `user_metadata`.
- Added per-user rate limiting for `/api/b2b-match`, backed by Netlify Blobs with an in-memory fallback for local/test execution.
- Strengthened upload validation for inline images:
  - validates content type from magic bytes, not just MIME headers
  - enforces actual/declared size limits
  - reads dimensions and caps them at 4096px
  - strips common JPEG EXIF/XMP/comment metadata, PNG text/eXIf chunks, and WebP EXIF/XMP chunks before persistence
  - rejects disguised non-images and unsafe inline web formats
- Centralized client HTML escaping and added direct XSS regression coverage.
- Expanded adversarial tests for:
  - ordinary member direct API calls to privileged `/api/arena` actions
  - member isolation for drafts
  - hidden solution/private score leakage across full ordinary-member competition snapshots
  - no client-side Anthropic/provider key exposure
  - B2B auth and rate-limit enforcement
  - upload byte validation, oversize rejection, and EXIF stripping

## Already correct and verified

- Competition scoring and hidden-answer joins were already server-side.
- Ordinary competition snapshots already hid `privateScore` before explicit reveal.
- Participant validation reports already redacted hidden missing IDs.
- Client source did not contain Anthropic keys or direct Anthropic API calls.
- Most user-authored render paths already escaped values before inserting HTML.
- Pre-login `/api/arena` masking was already enforced and remains covered by tests.

## Remaining work

- Separate-origin CDN/object storage for uploaded assets is not implemented in this repo. Current uploads are still persisted as sanitized data URLs in Supabase JSON. Netlify/Supabase storage or another CDN needs product/environment setup.
- There is no lint, type-check, production build, or e2e script in `package.json`; the available automated gate is `pnpm test`.
- The `.github/workflows/netlify-deploy.yml` deploy workflow does not run install/test before deploy. Netlify build runs `pnpm test`, but CI should add explicit install/test gates before production deploy.
- P1-P3 items from the task remain: idempotency keys, broader deterministic scoring fixtures, async UX states, observability, staging/prod separation proof, performance, accessibility, mobile polish, i18n, and autosave conflict handling.

## Verification

- Baseline before changes: `pnpm test` passed, 34 tests.
- After P0 changes: `pnpm test` passed, 45 tests.
- No lint/type-check/build/e2e verification was run because no such scripts are defined in this workspace.
- This folder is not a git repository, so branches, commits, and PRs could not be created locally.

## External setup needed

- Confirm B2B/staff/human-validator privileged roles are assigned through Supabase `app_metadata` or Netlify allowlist environment variables.
- Configure `SPARKCLAW_B2B_MATCH_LIMIT_PER_HOUR` and `SPARKCLAW_B2B_MATCH_WINDOW_MS` in Netlify if the defaults are not desired.
- Choose and configure a separate-origin asset storage/CDN path for uploaded images.
- Add CI gates and optional Sentry/observability credentials before continuing P2.
