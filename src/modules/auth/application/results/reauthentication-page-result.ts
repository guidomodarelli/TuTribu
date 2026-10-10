/** Defines the exact safe server-to-client snapshot for the global confirmation page. */
import { z } from "zod";
import { REAUTHENTICATION_ERROR_CODE, REAUTHENTICATION_INTENT_OUTCOME } from "@/src/modules/auth/constants/reauthentication-intents";
import { GLOBAL_REAUTHENTICATION_INTENT_STATE } from "@/src/modules/auth/constants/recent-authentication";
import { reauthenticationIntentResultSchema } from "./reauthentication-intent-result";

/** Requires enough own metadata to retire a confirmed display without a hydration-time clock read. */
export const reauthenticationPageIntentSchema = reauthenticationIntentResultSchema.refine((intent) => intent.outcome !== REAUTHENTICATION_INTENT_OUTCOME.verified || (intent.state === GLOBAL_REAUTHENTICATION_INTENT_STATE.consumed && intent.validUntil !== undefined));

export const reauthenticationPageStateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ready"), intent: reauthenticationPageIntentSchema, oauthFailed: z.boolean() }),
  z.strictObject({ kind: z.literal("unavailable"), code: z.enum(REAUTHENTICATION_ERROR_CODE), message: z.string().min(1) }),
]);
export type ReauthenticationPageState = z.infer<typeof reauthenticationPageStateSchema>;
