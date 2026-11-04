/** Validates wizard runtime input and own SSR metadata without session/provider DTO serialization. @module messaging-connections-page */
import "server-only";
import type { GetMessagingConnectionsPageUseCase } from "../../application/use-cases/get-messaging-connections-page-use-case";
import { messagingConnectionsPageStateSchema, type MessagingConnectionsPageState } from "../../application/results/messaging-connections-page-state";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { createMessagingPageDiagnostics, loadMessagingPageRead, messagingPageUnavailable, readMessagingPageSlug } from "./messaging-page-input";

/** Fixed diagnostics of the connection wizard loader. */
const MESSAGING_CONNECTIONS_PAGE_DIAGNOSTIC = { operation: "load_messaging_connections_page", readFailed: "Connection wizard read failed", contractRejected: "Connection wizard returned an unusable own state", loadFailed: "Connection wizard metadata could not load" } as const;

/**
 * @param input - Untrusted resolved runtime values. @param open - Native single metadata entrypoint.
 * @param requestHeaders - Incoming request headers, for native correlation.
 * @returns Safe Spanish own state with no partial private result or implicit initialization.
 */
export async function loadMessagingConnectionsPageState(input: unknown, open: () => Promise<Pick<GetMessagingConnectionsPageUseCase, "execute">>, requestHeaders?: Pick<Headers, "get">): Promise<MessagingConnectionsPageState> {
  const slug = readMessagingPageSlug(input);
  if (slug === null) return messagingPageUnavailable(MESSAGING_ERROR_CODE.invalidInput);
  const diagnostics = createMessagingPageDiagnostics(MESSAGING_CONNECTIONS_PAGE_DIAGNOSTIC.operation, requestHeaders);
  return loadMessagingPageRead({
    diagnostics, stateSchema: messagingConnectionsPageStateSchema, messages: MESSAGING_CONNECTIONS_PAGE_DIAGNOSTIC,
    read: async () => (await open()).execute({ slug, requestId: diagnostics.context.requestId }),
  });
}
