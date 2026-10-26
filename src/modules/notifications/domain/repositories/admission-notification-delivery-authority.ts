/** Defines private current grouped-delivery authority without turning stored provenance into a send token. @module admission-notification-delivery-authority */
import type { AdmissionNotificationEmailIntent } from "../entities/admission-notification-email-intent";
import type { AdmissionNotificationGroupAuthorityReason } from "../entities/admission-notification-group-authority";

/** Contains only server-selected original delivery coordinates. */
export type AdmissionNotificationDeliveryAuthorityScope = { readonly tribeId: string; readonly deliveryId: string };
/** Holds transient verified content and destination only inside the backend sending boundary. */
export type CurrentAdmissionNotificationDelivery = {
  readonly deliveryId: string;
  readonly tribeId: string;
  readonly connectionId: string;
  readonly connectionVersion: number;
  readonly contributingLeaderUserId: string;
  readonly environment: string;
  readonly securityEpoch: string;
  readonly recipientUserId: string;
  readonly normalizedEmail: string;
  readonly idempotencyKey: string;
  readonly deadlineAtMicroseconds: number;
  readonly intent: AdmissionNotificationEmailIntent;
};
/** Separates a current immutable intent from a definitive current scope/policy denial. */
export type AdmissionNotificationDeliveryAuthorityResult = { readonly status: "current"; readonly delivery: CurrentAdmissionNotificationDelivery } | { readonly status: "denied"; readonly reason: AdmissionNotificationGroupAuthorityReason };
/** Owns current authority over every frozen member; native marker, budget and secret checks remain independent. */
export interface AdmissionNotificationDeliveryAuthority {
  /** @param scope - Exact original grouped delivery. @returns Backend-only current data or denial; transient infrastructure/configuration failures propagate instead of suppressing work. */
  read(scope: AdmissionNotificationDeliveryAuthorityScope): Promise<AdmissionNotificationDeliveryAuthorityResult>;
}
