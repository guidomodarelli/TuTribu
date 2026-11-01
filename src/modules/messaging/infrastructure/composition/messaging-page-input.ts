/** Validates the runtime input of the messaging SSR pages and builds their safe unavailable state and diagnostics. @module messaging-page-input */
import "server-only";
import { z } from "zod";
import type { MessagingErrorCode } from "../../application/results/messaging-errors";
import { messagingTribeParamsSchema } from "../api/messaging-request-schemas";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { messagingReadErrorMessage } from "../../constants/messaging-read-errors";
import { MESSAGING_ERROR_HTTP_STATUS } from "../api/messaging-error-status";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { createServerPageDiagnostics, loadServerPageState, type ServerPageDiagnosticMessages, type ServerPageDiagnostics } from "@/src/modules/shared/infrastructure/observability/server-page-diagnostics";

/** Feature of every messaging page diagnostic. */
const MESSAGING_PAGE_DIAGNOSTIC_FEATURE = "messaging";

/** Browser role, actor, readiness and key inputs are forbidden on a read-only page; unknown query keys (tracking parameters) are dropped, never read. */
const messagingPageInputSchema = z.strictObject({ params: messagingTribeParamsSchema, query: z.object({}) });

/** Safe Spanish state of a messaging page that cannot show any private result. */
type MessagingPageUnavailable = { kind: "unavailable"; code: MessagingErrorCode; message: string };

/** @param code - Closed semantic failure. @returns The unavailable page state with read copy. */
export function messagingPageUnavailable(code: MessagingErrorCode): MessagingPageUnavailable {
  return { kind: "unavailable", code, message: messagingReadErrorMessage(code) };
}

/** @param input - Untrusted resolved runtime params/query. @returns The validated tribe slug, or null for any unusable input. */
export function readMessagingPageSlug(input: unknown): string | null {
  const parsed = messagingPageInputSchema.safeParse(input);
  return parsed.success ? parsed.data.params.slug : null;
}

/** @param operation - Fixed loader operation. @param requestHeaders - Incoming request headers, for native correlation. @returns Diagnostics that log server failures at error level, as the messaging HTTP boundary does. */
export function createMessagingPageDiagnostics(operation: string, requestHeaders?: Pick<Headers, "get">): ServerPageDiagnostics {
  return createServerPageDiagnostics({ feature: MESSAGING_PAGE_DIAGNOSTIC_FEATURE, operation, requestHeaders, isServerFailure: (code) => (MESSAGING_ERROR_HTTP_STATUS[code as MessagingErrorCode] ?? HTTP_STATUS.serverError) >= HTTP_STATUS.serverError });
}

/**
 * @param page - Diagnostics, the read, its page contract and the fixed log messages.
 * @returns The own ready state, or an unavailable state with read copy; every failure is logged with its cause chain.
 */
export function loadMessagingPageRead<State>(page: {
  diagnostics: ServerPageDiagnostics;
  read: () => Promise<{ ok: true; value: unknown } | { ok: false; failure: { code: MessagingErrorCode; cause?: unknown } }>;
  stateSchema: z.ZodType<State>;
  messages: ServerPageDiagnosticMessages;
}): Promise<State | MessagingPageUnavailable> {
  return loadServerPageState<MessagingErrorCode, State, MessagingPageUnavailable>({
    ...page, unavailable: messagingPageUnavailable,
    codes: { contractUnusable: MESSAGING_ERROR_CODE.publicContractUnusable, unexpectedFailure: MESSAGING_ERROR_CODE.unexpectedFailure },
  });
}
