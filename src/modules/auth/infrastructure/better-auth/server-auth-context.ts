/** Resolves readonly native sessions and preserves safe correlation during bounded recovery. @module server-auth-context */
import "server-only";

import { headers } from "next/headers";

import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { resolvePrivateRequestContext } from "@/src/modules/shared/infrastructure/observability/private-request-context";
import { runWithBetterAuthLoggingContext } from "./better-auth-logger";
import { BETTER_AUTH_DEPENDENCY, BETTER_AUTH_SESSION_FAILURE, BETTER_AUTH_SESSION_LOG_CONTEXT, BETTER_AUTH_SESSION_LOG_MESSAGE, CONNECTION_TIMEOUT_ERROR_SIGNATURE, BETTER_AUTH_SESSION_ERROR_CAUSE_MAX_DEPTH, SERVER_RENDER_SESSION_QUERY } from "../../constants/better-auth-session";

import { auth } from "./auth";

export type BetterAuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;

/**
 * Detects whether an error, or any error in its `cause` chain, is a pooled
 * connection-acquisition timeout. The chain is walked with a bounded depth so a
 * self-referential cause cannot loop.
 *
 * @param error - Error thrown by Better Auth while resolving the session.
 * @returns Whether the failure was caused by a connection-acquisition timeout.
 */
function isConnectionAcquisitionTimeout(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < BETTER_AUTH_SESSION_ERROR_CAUSE_MAX_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) {
      return false;
    }

    const candidate = current as { message?: unknown; cause?: unknown };

    if (
      typeof candidate.message === "string" &&
      candidate.message.includes(CONNECTION_TIMEOUT_ERROR_SIGNATURE)
    ) {
      return true;
    }

    current = candidate.cause;
  }

  return false;
}

export type RequestAuthContext = {
  email: string | null;
  image: string | null;
  name: string | null;
  userId: string | null;
};

type BetterAuthSessionFailure = {
  body?: {
    code?: unknown;
    message?: unknown;
  };
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function getBetterAuthSessionFailureMetadata(error: unknown) {
  const sessionFailure =
    typeof error === "object" && error !== null
      ? (error as BetterAuthSessionFailure)
      : {};
  const errorStatus = sessionFailure.status;
  const errorStatusCode = sessionFailure.statusCode;
  const errorCode = sessionFailure.body?.code;
  const errorMessage = sessionFailure.body?.message ?? sessionFailure.message;

  return {
    dependency: BETTER_AUTH_DEPENDENCY,
    errorCode: typeof errorCode === "string" ? errorCode : undefined,
    errorMessage: typeof errorMessage === "string" ? errorMessage : undefined,
    errorStatus:
      typeof errorStatus === "string" || typeof errorStatus === "number"
        ? errorStatus
        : undefined,
    errorStatusCode:
      typeof errorStatusCode === "number" ? errorStatusCode : undefined,
    operation: BETTER_AUTH_SESSION_FAILURE.operation,
  };
}

/**
 * Detects the stable Better Auth wrapper error for a failed session read.
 *
 * The underlying Postgres error is not part of the public response shape, so the
 * retry stays limited to this get-session contract and still rethrows on repeat.
 *
 * @param error - Error thrown by Better Auth while resolving the server session.
 * @returns Whether the session lookup can be retried once safely.
 */
function isRetryableBetterAuthSessionFailure(error: unknown) {
  const metadata = getBetterAuthSessionFailureMetadata(error);
  const hasInternalServerErrorStatus =
    metadata.errorStatus === BETTER_AUTH_SESSION_FAILURE.stringStatus ||
    metadata.errorStatus === BETTER_AUTH_SESSION_FAILURE.numericStatus ||
    metadata.errorStatusCode === BETTER_AUTH_SESSION_FAILURE.numericStatus;

  return (
    hasInternalServerErrorStatus &&
    metadata.errorCode === BETTER_AUTH_SESSION_FAILURE.bodyCode &&
    metadata.errorMessage === BETTER_AUTH_SESSION_FAILURE.message
  );
}

/**
 * Resolves the Better Auth session for the current server request, retrying a
 * transient lookup failure once.
 *
 * @returns The session of the signed-in member, or `null` for visitors.
 */
export async function getServerBetterAuthSession(): Promise<BetterAuthSession> {
  const requestHeaders = await headers();
  const requestContext = resolvePrivateRequestContext(requestHeaders);
  const sessionLookup = {
    headers: requestHeaders,
    query: SERVER_RENDER_SESSION_QUERY,
  };

  return runWithBetterAuthLoggingContext(requestContext, async () => {
    try {
      return await auth.api.getSession(sessionLookup);
    } catch (error) {
      if (
        !isRetryableBetterAuthSessionFailure(error) ||
        isConnectionAcquisitionTimeout(error)
      ) {
        throw error;
      }

      const logger = createServerLogger({
        ...BETTER_AUTH_SESSION_LOG_CONTEXT,
        ...requestContext,
      });
      logger.warn({
        message: BETTER_AUTH_SESSION_LOG_MESSAGE.retry,
        metadata: getBetterAuthSessionFailureMetadata(error),
      });

      return auth.api.getSession(sessionLookup);
    }
  });
}

export async function getRequestAuthContext(): Promise<RequestAuthContext> {
  const session = await getServerBetterAuthSession();

  if (!session) {
    return {
      email: null,
      image: null,
      name: null,
      userId: null,
    };
  }

  return {
    email: session.user.email ?? null,
    image: session.user.image ?? null,
    name: session.user.name ?? null,
    userId: session.user.id,
  };
}
