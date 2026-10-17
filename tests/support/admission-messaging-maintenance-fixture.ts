/** Supplies coherent own workflow and delivery contracts without a provider credential or platform mock. @module admission-messaging-maintenance-fixture */
import { randomUUID } from "node:crypto";
import type { AdmissionMessagingMaintenanceResult } from "@/src/modules/messaging/domain/repositories/admission-messaging-maintenance";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { createUnstartedAdmissionMaintenancePhases } from "@/src/modules/messaging/application/use-cases/admission-messaging-maintenance-state";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import { NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "@/src/modules/messaging/constants/notification-delivery-recovery";

/** @returns A complete safe own API result with an actual success observation and no contacts, keys or provider payloads. */
export function createAdmissionMaintenanceResultFixture(): AdmissionMessagingMaintenanceResult {
  const now = Date.now();
  return { runId: randomUUID(), status: "completed", newRunStarted: true, deadlineReached: false, observation: "recorded", phases: createUnstartedAdmissionMaintenancePhases().map((phase) => ({ ...phase, status: "completed", metrics: [], startedAtMilliseconds: now, durationMilliseconds: 0, observation: "recorded" })), health: { available: true, observedAtMilliseconds: now, lastSuccessfulRunAtMilliseconds: now, oldestQueuedAtMilliseconds: null, queueAgeMilliseconds: null } };
}

/** @returns A complete private marker-shaped own port input; it is not evidence of a real marker or authority. */
export function createAdmissionMaintenanceDeliveryContextFixture(): AuthorizedDeliveryMessagingContext {
  return { tribeId: randomUUID(), connectionId: randomUUID(), connectionVersion: 1, environment: randomUUID(), securityEpoch: randomUUID(), requestId: randomUUID(), secretRef: randomUUID(), authorizationPurpose: MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery, contributingLeaderUserId: randomUUID(), deliveryId: randomUUID(), attemptId: randomUUID(), attemptVersion: 1, leaseToken: randomUUID(), sendAuthorizedAt: new Date(), authorizedUsagePolicyVersion: 1, operation: "dispatch_delivery", deliveryPurpose: NOTIFICATION_DELIVERY_RECOVERY_PURPOSE, notificationGroupId: randomUUID() };
}
