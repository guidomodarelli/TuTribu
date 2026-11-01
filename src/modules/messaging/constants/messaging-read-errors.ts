/** Maps the closed failures of a messaging page read to read copy instead of the write catalogue. @module messaging-read-errors */
import { PAGE_READ_COPY } from "@/src/constants/page-read";
import type { MessagingErrorCode } from "../domain/errors/messaging-error-code";
import { MESSAGING_ERROR_CODE, MESSAGING_ERROR_MESSAGE } from "./messaging-errors";

/** Read copy of the failures a messaging page read can end with; the session copy of the catalogue already fits a read. */
const MESSAGING_READ_ERROR_MESSAGE = {
  [MESSAGING_ERROR_CODE.invalidInput]: PAGE_READ_COPY.invalidAddress,
  [MESSAGING_ERROR_CODE.permissionDenied]: PAGE_READ_COPY.permissionDenied,
  [MESSAGING_ERROR_CODE.resourceUnavailable]: PAGE_READ_COPY.notFound,
  [MESSAGING_ERROR_CODE.dependencyUnavailable]: PAGE_READ_COPY.unavailable,
  [MESSAGING_ERROR_CODE.transportTimeout]: PAGE_READ_COPY.unavailable,
  [MESSAGING_ERROR_CODE.upstreamPayloadUnusable]: PAGE_READ_COPY.unavailable,
  [MESSAGING_ERROR_CODE.publicContractUnusable]: PAGE_READ_COPY.unavailable,
  [MESSAGING_ERROR_CODE.unexpectedFailure]: PAGE_READ_COPY.unavailable,
} as const satisfies Partial<Record<MessagingErrorCode, string>>;

/** @param code - Closed failure of the page read. @returns Its read copy, or the catalogue copy for a code with no read-specific meaning. */
export function messagingReadErrorMessage(code: MessagingErrorCode): string {
  return (MESSAGING_READ_ERROR_MESSAGE as Partial<Record<MessagingErrorCode, string>>)[code] ?? MESSAGING_ERROR_MESSAGE[code];
}
