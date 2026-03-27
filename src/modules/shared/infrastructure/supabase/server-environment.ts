import "server-only";

const SUPABASE_URL_ENV = "SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY_ENV = "SUPABASE_PUBLISHABLE_KEY";
const SUPABASE_ENVIRONMENT_ERROR_MESSAGE =
  "Supabase environment is incomplete. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.";

export function getServerSupabaseEnvironment() {
  const url = process.env[SUPABASE_URL_ENV];
  const publishableKey = process.env[SUPABASE_PUBLISHABLE_KEY_ENV];

  if (!url || !publishableKey) {
    throw new Error(SUPABASE_ENVIRONMENT_ERROR_MESSAGE);
  }

  return {
    publishableKey,
    url,
  };
}
