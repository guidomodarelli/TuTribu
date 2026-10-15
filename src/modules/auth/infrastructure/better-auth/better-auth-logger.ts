/** Adapts real Better Auth diagnostics to safe, request-local structured logs. @module better-auth-logger */
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Logger } from "better-auth";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { resolveRequestContext, type RequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { BETTER_AUTH_LOG_CONTEXT, BETTER_AUTH_LOG_LEVEL, BETTER_AUTH_LOG_SOURCE_INTERNAL_ERROR, BETTER_AUTH_LOG_CODE, BETTER_AUTH_LOG_MESSAGE } from "../../constants/better-auth-logging";

/** Holds only safe opaque IDs for the asynchronous lifetime of one auth operation. */
const loggingContext = new AsyncLocalStorage<RequestContext>();

/**
 * Binds provider diagnostics to the current native request without sharing auth/session material.
 * @param context - Already selected own request and trace identifiers.
 * @param run - Native auth handler or readonly server-session lookup.
 * @returns The unchanged result, preserving async lifetime and the original thrown error.
 */
export function runWithBetterAuthLoggingContext<Result>(context: RequestContext, run: () => Result): Result {
  return loggingContext.run({ requestId: context.requestId, traceId: context.traceId },run);
}

/** @returns Current safe correlation, or a fresh standalone diagnostic identity outside a request. */
export function resolveBetterAuthLoggingContext(): RequestContext {
  const context=loggingContext.getStore()??resolveRequestContext();
  return {requestId:context.requestId,traceId:context.traceId};
}

/**
 * Replaces the SDK console sink while preserving its normal level filtering.
 * @returns SDK logger options that emit only fixed codes, safe copy and native correlation.
 * @remarks The SDK's message is used only for its fixed internal-error discriminator.
 * Additional arguments are deliberately never read, inspected or serialized.
 */
export function createBetterAuthLogger(): Logger {
  return {
    level: BETTER_AUTH_LOG_LEVEL,
    /** @param level - Native SDK level. @param message - Only the closed internal-error discriminator is consumed. @returns Nothing after safe structured emission. */
    log(level,message) {
      const internal = message === BETTER_AUTH_LOG_SOURCE_INTERNAL_ERROR;
      const context = resolveBetterAuthLoggingContext();
      const logger = createServerLogger({ feature: BETTER_AUTH_LOG_CONTEXT.feature, operation: BETTER_AUTH_LOG_CONTEXT.operation, ...context });
      const entry = { message: internal ? BETTER_AUTH_LOG_MESSAGE.internalError : BETTER_AUTH_LOG_MESSAGE.diagnostic,
        metadata: { dependency: BETTER_AUTH_LOG_CONTEXT.dependency, code: internal ? BETTER_AUTH_LOG_CODE.internalError : BETTER_AUTH_LOG_CODE.diagnostic } };
      if (level === "error") logger.error(entry);
      else if (level === "warn") logger.warn(entry);
      else logger.info(entry);
    },
  };
}
