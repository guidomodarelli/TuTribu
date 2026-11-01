/** Validates early usage page runtime input before native composition and safe own SSR projection. @module messaging-usage-page */
import "server-only";
import type { GetMessagingUsagePageUseCase } from "../../application/use-cases/get-messaging-usage-page-use-case";
import { messagingUsagePageStateSchema, type MessagingUsagePageState } from "../../application/results/messaging-usage-page-state";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { createMessagingPageDiagnostics, loadMessagingPageRead, messagingPageUnavailable, readMessagingPageSlug } from "./messaging-page-input";

/** Fixed diagnostics of the usage page loader. */
const MESSAGING_USAGE_PAGE_DIAGNOSTIC = { operation: "load_messaging_usage_page", readFailed: "Early usage page read failed", contractRejected: "Early usage page returned an unusable own state", loadFailed: "Early messaging usage page could not load safe state" } as const;

/**
 * @param input - Untrusted resolved runtime params/query. @param open - Server-selected inward use case.
 * @param requestHeaders - Incoming request headers, for native correlation.
 * @returns A current safe leader snapshot or Spanish failure without partial private data.
 */
export async function loadMessagingUsagePageState(input: unknown, open: () => Promise<Pick<GetMessagingUsagePageUseCase, "execute">>, requestHeaders?: Pick<Headers, "get">): Promise<MessagingUsagePageState> {
  const slug = readMessagingPageSlug(input);
  if (slug === null) return messagingPageUnavailable(MESSAGING_ERROR_CODE.invalidInput);
  const diagnostics = createMessagingPageDiagnostics(MESSAGING_USAGE_PAGE_DIAGNOSTIC.operation, requestHeaders);
  return loadMessagingPageRead({
    diagnostics, stateSchema: messagingUsagePageStateSchema, messages: MESSAGING_USAGE_PAGE_DIAGNOSTIC,
    read: async () => (await open()).execute({ slug, requestId: diagnostics.context.requestId }),
  });
}
