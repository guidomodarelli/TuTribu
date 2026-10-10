/** Represents messaging failure facts without provider payloads in the public contract. */
import type { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

export type MessagingErrorCode = (typeof MESSAGING_ERROR_CODE)[keyof typeof MESSAGING_ERROR_CODE];
export type MessagingFailure = {
  code: MessagingErrorCode; cause?: unknown; upstreamStatus?: number; retryAt?: string;
  operation?: { operationId: string; state: "started" | "completed" };
};
export type MessagingPublicError = Omit<MessagingFailure, "cause" | "upstreamStatus"> & { message: string; requestId: string };

/**
 * Constructs a private expected failure; raw cause is never its public projection.
 * @param code - Closed own semantic outcome.
 * @param details - Real private diagnostics and confirmed own operation metadata.
 * @returns A failure for the caller's response or durable attempt finalization.
 */
export function messagingFailure(code: MessagingErrorCode, details: Omit<MessagingFailure, "code"> = {}): MessagingFailure {
  return { code, ...details };
}
