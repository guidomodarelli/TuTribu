/** Owns explicit notification recovery boundary vocabulary and original-result lookup. @module notification-delivery-recovery-http */
import { z } from "zod";
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { NOTIFICATION_DELIVERY_RECOVERY_AUDIT } from "./notification-delivery-recovery";
import { TRIBE_SLUG_PATTERN } from "@/src/modules/tribes/domain/value-objects/tribe-slug";

/** The only supported recovery cause is explicit replacement, never an uncertain automatic retry. */
export const NOTIFICATION_DELIVERY_RECOVERY_HTTP_OPERATION = {
  recover: MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification,
  readOperation: "read_notification_recovery_operation",
} as const;

/** Validates public input once; account, scope, readiness and provider facts belong to the server. */
export const notificationDeliveryRecoveryInputSchema = z.strictObject({
  operationId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  targetConnectionId: z.uuid(),
  expectedTargetVersion: z.number().int().positive(),
  confirmed: z.literal(true),
  reason: z.literal(NOTIFICATION_DELIVERY_RECOVERY_AUDIT.cause),
});

/** Recovery authority cannot be widened by query flags. */
export const notificationRecoveryEmptyQuerySchema = z.strictObject({});

/** Identifies only an owned original operation; browser input cannot choose a ledger namespace. */
export const notificationRecoveryOperationParamsSchema = z.strictObject({ slug: z.string().regex(TRIBE_SLUG_PATTERN), operationId: z.uuid() });
