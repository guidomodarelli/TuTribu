/** Validates the runtime input of the messaging SSR pages and builds their safe unavailable state. @module messaging-page-input */
import "server-only";
import { z } from "zod";
import type { MessagingErrorCode } from "../../application/results/messaging-errors";
import { messagingTribeParamsSchema } from "../api/messaging-request-schemas";
import { MESSAGING_ERROR_MESSAGE } from "../../constants/messaging-errors";

/** Browser role, actor, readiness and key inputs are forbidden on a read-only page; unknown query keys (tracking parameters) are dropped, never read. */
const messagingPageInputSchema = z.strictObject({ params: messagingTribeParamsSchema, query: z.object({}) });

/** Safe Spanish state of a messaging page that cannot show any private result. */
type MessagingPageUnavailable = { kind: "unavailable"; code: MessagingErrorCode; message: string };

/** @param code - Closed semantic failure. @returns The unavailable page state with only catalogue copy. */
export function messagingPageUnavailable(code: MessagingErrorCode): MessagingPageUnavailable {
  return { kind: "unavailable", code, message: MESSAGING_ERROR_MESSAGE[code] };
}

/** @param input - Untrusted resolved runtime params/query. @returns The validated tribe slug, or null for any unusable input. */
export function readMessagingPageSlug(input: unknown): string | null {
  const parsed = messagingPageInputSchema.safeParse(input);
  return parsed.success ? parsed.data.params.slug : null;
}
