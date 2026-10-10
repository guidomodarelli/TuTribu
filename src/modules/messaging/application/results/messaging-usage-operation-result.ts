/** Guards own original usage snapshots independently of today's configuration and consumption. @module messaging-usage-operation-result */
import { z } from "zod";
import { MESSAGING_USAGE_RECOVERABLE_OPERATION } from "../../constants/messaging-usage";
import { messagingUsagePolicySchema } from "./messaging-public-result-schemas";
import { OPERATION_STATE } from "@/src/constants/operation-state";
export const messagingUsageOperationRecoverySchema = z.discriminatedUnion("state", [
  z.object({ type: z.enum(MESSAGING_USAGE_RECOVERABLE_OPERATION), state: z.literal(OPERATION_STATE.started), operationId: z.uuid() }),
  z.object({ type: z.enum(MESSAGING_USAGE_RECOVERABLE_OPERATION), state: z.literal(OPERATION_STATE.completed), operationId: z.uuid(), replayed: z.literal(true), result: messagingUsagePolicySchema }),
]);
export type MessagingUsageOperationRecoveryDto = z.infer<typeof messagingUsageOperationRecoverySchema>;
