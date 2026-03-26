import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

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
  const code = requestUrl.searchParams.get("code");
  const nextPath = resolveSafeNextPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return Response.redirect(new URL("/auth/error", requestUrl.origin));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return Response.redirect(new URL("/auth/error", requestUrl.origin));
  }

  return Response.redirect(new URL(nextPath, requestUrl.origin));
}
