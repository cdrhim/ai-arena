// Netlify CLI injects production site variables before running the build command.
// Tests must opt in to every backend and credential they exercise so mocks never
// fall through to a live Supabase, provider, or Blob account.
const productionEnvironmentKeys = [
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SPARKCLAW_PROGRAM_SUPABASE_URL",
  "SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY",
  "SPARKLABS_ARENA_GOOGLE_ADMIN_LOGIN_ENABLED",
  "SPARKLABS_ARENA_ADMIN_DOMAINS",
  "SPARKLABS_ARENA_ADMIN_EMAILS",
  "SPARKLABS_ARENA_MEMBER_DOMAINS",
  "SPARKLABS_ARENA_MEMBER_EMAILS",
  "SPARKLABS_ARENA_HUMAN_VALIDATOR_EMAILS",
  "SPARKCLAW_STRICT_ACCOUNT_ALLOWLIST",
  "SPARKCLAW_ENABLE_FORUM",
  "SPARKCLAW_ENABLE_BOUNTIES",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "NETLIFY",
  "NETLIFY_DEV",
  "NETLIFY_BLOBS_CONTEXT",
  "CONTEXT"
];

for (const key of productionEnvironmentKeys) delete process.env[key];

// Most endpoint tests predate the production account allowlist and focus on
// their own authorization boundary. The allowlist decision itself has focused
// unit/integration coverage; production defaults to enabled.
process.env.SPARKCLAW_STRICT_ACCOUNT_ALLOWLIST = "false";
