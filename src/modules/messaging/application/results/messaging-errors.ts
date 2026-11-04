/** Represents messaging failure facts without provider payloads in the public contract. */
import type {MessagingErrorCode} from "../../domain/errors/messaging-error-code";
import {MESSAGING_ERROR_CODE} from "../../constants/messaging-errors";
import type { TribePageFailures } from "@/src/modules/shared/application/live-account-tribe-page-read";

export type {MessagingErrorCode} from "../../domain/errors/messaging-error-code";
export type MessagingFailure = {
  code: MessagingErrorCode; cause?: unknown; upstreamStatus?: number; retryAt?: string;
  operation?: { operationId: string; state: "started" | "completed" };
  /**
   * Private: the request failed before it could register or change anything (a tenant routing read, a provider read
   * before the commit). Its HTTP status stays below 5xx so the browser does not keep a write as uncertain.
   */
  definitive?: boolean;
};
export type MessagingPublicError = Omit<MessagingFailure, "cause" | "upstreamStatus" | "definitive"> & { message: string; requestId: string };

/**
 * Constructs a private expected failure; raw cause is never its public projection.
 * @param code - Closed own semantic outcome.
 * @param details - Real private diagnostics and confirmed own operation metadata.
 * @returns A failure for the caller's response or durable attempt finalization.
 */
export function messagingFailure(code: MessagingErrorCode, details: Omit<MessagingFailure, "code"> = {}): MessagingFailure {
  return { code, ...details };
}

/**
 * @param failure - Canonical tenant routing failure of a messaging page.
 * @returns The same failure when its code is a messaging code, otherwise an unexpected failure; the original stays as cause.
 */
export function messagingRoutingFailure(failure: { code: string }) {
  return { ok: false as const, failure: messagingFailure(Object.values(MESSAGING_ERROR_CODE).find((code) => code === failure.code) ?? MESSAGING_ERROR_CODE.unexpectedFailure, { cause: failure }) };
}

/**
 * @param failure - Tenant routing failure of a messaging route, resolved before any read or write of that route.
 * @returns Its messaging code when it has one, otherwise an unexpected failure; the original failure stays as cause and
 * the failure is definitive, since nothing was registered yet.
 */
export function messagingTribeRoutingFailure(failure: { code: string; cause?: unknown }): MessagingFailure {
  // The routing failure is a plain result: its own cause (the thrown error) is what the diagnostics can summarize.
  return messagingFailure(Object.values(MESSAGING_ERROR_CODE).find((code) => code === failure.code) ?? MESSAGING_ERROR_CODE.unexpectedFailure, { cause: failure.cause ?? failure, definitive: true });
}

/** Own messaging operation error carrying its closed code. */
type MessagingOperationErrorClass = new (code: MessagingErrorCode) => Error & { code: MessagingErrorCode };

/**
 * @param OperationError - The page's own operation error class.
 * @returns Closed failures of a messaging leader page: that error for authentication, the routing failure, and any throw as its own code or an unexpected failure.
 */
export function messagingPageFailures(OperationError: MessagingOperationErrorClass): TribePageFailures<{ code: string }, ReturnType<typeof messagingRoutingFailure>, { ok: false; failure: MessagingFailure }> {
  return {
    authenticationRequired: () => new OperationError(MESSAGING_ERROR_CODE.authenticationRequired),
    rejectTribe: messagingRoutingFailure,
    closeFailure: (error) => ({ ok: false, failure: messagingFailure(error instanceof OperationError ? error.code : MESSAGING_ERROR_CODE.unexpectedFailure, { cause: error }) }),
  };
}
