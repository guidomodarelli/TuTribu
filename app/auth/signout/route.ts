import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import {
  createJsonResponse,
} from "@/src/modules/shared/infrastructure/observability/route-response";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

const AUTH_SIGN_OUT_ERROR_MESSAGE = "No pudimos cerrar la sesion.";
const AUTH_SIGN_OUT_LOG = {
  failureMessage: "Sign out failed",
  feature: "auth",
  operation: "sign-out",
} as const;

export async function POST(request: Request) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: AUTH_SIGN_OUT_LOG.feature,
    operation: AUTH_SIGN_OUT_LOG.operation,
    requestId,
  });
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    logger.error({
      message: AUTH_SIGN_OUT_LOG.failureMessage,
      error,
      metadata: {},
    });

    return createJsonResponse(
      JSON.stringify({
        message: AUTH_SIGN_OUT_ERROR_MESSAGE,
      }),
      { status: 500 },
      requestId
    );
  }

  return createJsonResponse(
    JSON.stringify({
      ok: true,
    }),
    { status: 200 },
    requestId
  );
}
