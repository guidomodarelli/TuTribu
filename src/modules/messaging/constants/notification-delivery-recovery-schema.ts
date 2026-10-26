/** Owns the static public recovery DTO guard; database and provider rows are not validated here. @module notification-delivery-recovery-schema */
import { z } from "zod";
import type { NotificationDeliveryRecoveryResult } from "../application/results/notification-delivery-recovery-result";
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { OPERATION_STATE } from "@/src/constants/operation-state";

/** Accepts only committed lineage metadata, excluding recipient, payload and credential fields. */
export const notificationDeliveryRecoveryResultSchema: z.ZodType<NotificationDeliveryRecoveryResult> = z.object({
  originalDeliveryId: z.uuid(),
  recoveryDeliveryId: z.uuid(),
  originalVersion: z.number().int().positive(),
  targetConnectionId: z.uuid(),
  targetConnectionVersion: z.number().int().positive(),
}).strict();

/** Guards only this original recovery namespace, excluding every private ledger field. */
export const notificationRecoveryOperationSchema = z.discriminatedUnion("state", [
  z.strictObject({ type: z.literal(MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification), state: z.literal(OPERATION_STATE.started), operationId: z.uuid(), replayed: z.literal(true) }),
  z.strictObject({ type: z.literal(MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification), state: z.literal(OPERATION_STATE.completed), operationId: z.uuid(), replayed: z.literal(true), result: notificationDeliveryRecoveryResultSchema }),
]);
