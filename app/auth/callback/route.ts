import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

const AUTH_CALLBACK_PREFIX = {
  doubleSlash: "//",
  slash: "/",
} as const;

function resolveSafeNextPath(rawNext: string | null): string {
  if (!rawNext) {
    return ROUTES.home;
  }

  const trimmedNext = rawNext.trim();

  if (
    !trimmedNext.startsWith(AUTH_CALLBACK_PREFIX.slash) ||
    trimmedNext.startsWith(AUTH_CALLBACK_PREFIX.doubleSlash)
  ) {
    return ROUTES.home;
  }

  return trimmedNext;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get(QUERY_PARAMS.auth.code);
  const nextPath = resolveSafeNextPath(
    requestUrl.searchParams.get(QUERY_PARAMS.auth.next)
  );

  if (!code) {
    return Response.redirect(new URL(ROUTES.auth.error, requestUrl.origin));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return Response.redirect(new URL(ROUTES.auth.error, requestUrl.origin));
  }

  return Response.redirect(new URL(nextPath, requestUrl.origin));
}
