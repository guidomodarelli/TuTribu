import { buildGoogleAuthRedirectUrl } from "@/src/modules/auth/infrastructure/oauth/build-google-auth-redirect-url";
import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

const GOOGLE_PROFILE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
].join(" ");

function resolveSafeNextPath(rawNext: string | null): string {
  if (!rawNext) {
    return "/";
  }

  const trimmedNext = rawNext.trim();

  if (!trimmedNext.startsWith("/") || trimmedNext.startsWith("//")) {
    return "/";
  }

  return trimmedNext;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextPath = resolveSafeNextPath(requestUrl.searchParams.get("next"));
  const supabase = await createServerSupabaseClient();
  const redirectTo = buildGoogleAuthRedirectUrl(nextPath, requestUrl.origin);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      queryParams: {
        prompt: "select_account",
      },
      redirectTo,
      scopes: GOOGLE_PROFILE_SCOPES,
    },
  });

  if (error || !data.url) {
    return Response.redirect(new URL("/auth/error", requestUrl.origin));
  }

  return Response.redirect(data.url);
}
