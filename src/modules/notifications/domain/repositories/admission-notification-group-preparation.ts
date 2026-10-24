/** Defines private atomic group preparation without provider calls or a public job contract. @module admission-notification-group-preparation */
import type { AdmissionNotificationSuppressionReason } from "../entities/admission-notification";

/** Separates durable preparation from current deferral and terminal optional-email disposition. */
export type AdmissionNotificationPreparationStatus = "queued" | "not_due" | "unavailable" | "suppressed" | "expired";
/** Selects one existing group and its original observed version; it supplies no recipient, role or message content. */
export type AdmissionNotificationGroupPreparationCommand = { readonly tribeId: string; readonly groupId: string; readonly expectedVersion: number };
/** Exposes only the original private disposition, never contact, complete intent or provider material. */
export type AdmissionNotificationGroupPreparationResult = {
  readonly groupId: string;
  readonly groupVersion: number;
  readonly status: AdmissionNotificationPreparationStatus;
  readonly deliveryId: string | null;
  readonly reason: AdmissionNotificationSuppressionReason | null;
  readonly replayed: boolean;
};
/** Commits every member disposition, the frozen complete intent and the original outbox together. */
export interface AdmissionNotificationGroupPreparation {
  /** @param command - Existing server-selected group and original CAS. @returns Only after the original executor confirms commit; an uncertain commit must be queried/replayed through the same group. */
  prepare(command: AdmissionNotificationGroupPreparationCommand): Promise<AdmissionNotificationGroupPreparationResult>;
}
