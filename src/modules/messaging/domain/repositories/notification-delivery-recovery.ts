/** Defines original-notification recovery authority without credentials or provider claims. @module notification-delivery-recovery-repository */
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { MessagingUsageContext } from "./messaging-usage-operations";

/** Binds the explicit recovery to the original delivery, independently of a replacement connection. */
export type NotificationDeliveryRecoveryContext = MessagingUsageContext & {
  deliveryId: string;
  resourceId: string;
  operation: "recover_notification_delivery";
  accountId: string;
  subject: string;
};

/** Carries only explicit original CAS/UUID and a requested replacement; the writer resolves all facts. */
export type NotificationDeliveryRecoveryInput = {
  operationId: string;
  expectedVersion: number;
  targetConnectionId: string;
  expectedTargetVersion: number;
  confirmed: true;
};

/** Owns cancellation, new lineage, audit and original result atomically; never redirects OTP or retries RPC. */
export interface NotificationDeliveryRecoveryRepository<Result> {
  /**
   * @param context - Current exact human/session/original-delivery scope, repeated under writer locks.
   * @param input - Boundary-normalized explicit recovery intent; no trusted readiness or provider flags.
   * @returns Original committed recovery metadata or genuinely registered unresolved progress.
   */
  recover(context: NotificationDeliveryRecoveryContext, input: NotificationDeliveryRecoveryInput): Promise<AdmissionOperationResult<Result>>;
}
