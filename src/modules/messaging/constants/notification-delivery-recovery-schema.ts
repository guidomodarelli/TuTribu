/** Owns the static public recovery DTO guard; database and provider rows are not validated here. @module notification-delivery-recovery-schema */
import { z } from "zod";
import type { NotificationDeliveryRecoveryResult } from "../application/results/notification-delivery-recovery-result";

/** Accepts only committed lineage metadata, excluding recipient, payload and credential fields. */
export const notificationDeliveryRecoveryResultSchema: z.ZodType<NotificationDeliveryRecoveryResult> = z.object({
  originalDeliveryId: z.uuid(),
  recoveryDeliveryId: z.uuid(),
  originalVersion: z.number().int().positive(),
  targetConnectionId: z.uuid(),
  targetConnectionVersion: z.number().int().positive(),
}).strict();
