import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import { buildGoogleAuthRedirectUrl } from "@/src/modules/auth/infrastructure/oauth/build-google-auth-redirect-url";
import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

const AUTH_GOOGLE_START_PREFIX = {
  doubleSlash: "//",
  scopeJoinSeparator: " ",
  slash: "/",
} as const;

const GOOGLE_OAUTH_OPTION = {
  prompt: "select_account",
  provider: "google",
} as const;

const GOOGLE_PROFILE_SCOPE_VALUES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
] as const;

const GOOGLE_PROFILE_SCOPES = GOOGLE_PROFILE_SCOPE_VALUES.join(
  AUTH_GOOGLE_START_PREFIX.scopeJoinSeparator
);

function resolveSafeNextPath(rawNext: string | null): string {
  if (!rawNext) {
    return ROUTES.home;
  }

  const trimmedNext = rawNext.trim();

  if (
    !trimmedNext.startsWith(AUTH_GOOGLE_START_PREFIX.slash) ||
    trimmedNext.startsWith(AUTH_GOOGLE_START_PREFIX.doubleSlash)
  ) {
    return ROUTES.home;
  }

  return trimmedNext;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextPath = resolveSafeNextPath(
    requestUrl.searchParams.get(QUERY_PARAMS.auth.next)
  );
  const supabase = await createServerSupabaseClient();
  const redirectTo = buildGoogleAuthRedirectUrl(nextPath, requestUrl.origin);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: GOOGLE_OAUTH_OPTION.provider,
    options: {
      queryParams: {
        prompt: GOOGLE_OAUTH_OPTION.prompt,
      },
      redirectTo,
      scopes: GOOGLE_PROFILE_SCOPES,
    },
  });

  if (error || !data.url) {
    return Response.redirect(new URL(ROUTES.auth.error, requestUrl.origin));
  }

  return Response.redirect(data.url);
}
