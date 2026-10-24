/** Guards safe early usage SSR props independently of private session/provider state. @module messaging-usage-page-state */
import { z } from "zod";
import { messagingUsagePolicyStateSchema } from "./messaging-public-result-schemas";
import { MESSAGING_ERROR_CODE, MESSAGING_ERROR_MESSAGE } from "../../constants/messaging-errors";
import { MESSAGING_USAGE_COUNTRY_CODE_LENGTH } from "../../constants/messaging-usage";
/** Viewer/tribe ids scope local drafts only; country choices do not certify any channel capability. */
export const messagingUsagePageStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready"), slug: z.string().min(1), tribeId: z.uuid(), viewerId: z.string().min(1), renderedAt: z.iso.datetime({ offset: true }), usage: messagingUsagePolicyStateSchema, countryChoices: z.array(z.object({ value: z.string().length(MESSAGING_USAGE_COUNTRY_CODE_LENGTH), label: z.string().min(1) })) }),
  z.object({ kind: z.literal("unavailable"), code: z.enum(MESSAGING_ERROR_CODE), message: z.string() }).refine((state) => state.message === MESSAGING_ERROR_MESSAGE[state.code]),
]);
export type MessagingUsagePageState = z.infer<typeof messagingUsagePageStateSchema>;
