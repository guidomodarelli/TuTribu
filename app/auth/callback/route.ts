import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createRedirectResponse } from "@/src/modules/shared/infrastructure/observability/route-response";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

const AUTH_CALLBACK_PREFIX = {
  doubleSlash: "//",
  slash: "/",
} as const;

const AUTH_CALLBACK_LOG = {
  codeExchangeFailureMessage: "Auth callback code exchange failed",
  feature: "auth",
  missingCodeMessage: "Auth callback request missing code",
  operation: "auth-callback",
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
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: AUTH_CALLBACK_LOG.feature,
    operation: AUTH_CALLBACK_LOG.operation,
    requestId,
  });
  const code = requestUrl.searchParams.get(QUERY_PARAMS.auth.code);
  const nextPath = resolveSafeNextPath(
    requestUrl.searchParams.get(QUERY_PARAMS.auth.next)
  );

  if (!code) {
    logger.error({
      message: AUTH_CALLBACK_LOG.missingCodeMessage,
      metadata: {
        nextPath,
      },
    });

    return createRedirectResponse(new URL(ROUTES.auth.error, requestUrl.origin), requestId);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.error({
      message: AUTH_CALLBACK_LOG.codeExchangeFailureMessage,
      error,
      metadata: {
        hasCode: true,
        nextPath,
      },
    });

    return createRedirectResponse(new URL(ROUTES.auth.error, requestUrl.origin), requestId);
  }

  return createRedirectResponse(new URL(nextPath, requestUrl.origin), requestId);
}
