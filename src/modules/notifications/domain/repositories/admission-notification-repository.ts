/** Collects existing private notices without granting dispatch authority or changing admission. @module admission-notification-repository */
import type { AdmissionNotificationRecipientEmailScope } from "../entities/admission-notification-recipient-email";
import type { AdmissionNotificationGroupMemberState } from "../entities/admission-notification-group";
import type { AdmissionNotificationSuppressionReason } from "../entities/admission-notification";

/** Distinguishes a new logical member, its historical lineage and a current closed eligibility result. */
export type AdmissionNotificationCollectionResult =
  | { readonly status: "collected"; readonly groupId: string }
  | { readonly status: "existing"; readonly groupId: string; readonly memberState: AdmissionNotificationGroupMemberState }
  | { readonly status: "suppressed"; readonly reason: AdmissionNotificationSuppressionReason }
  | { readonly status: "unavailable" | "bucket_closed" };

/** Leaves transaction ownership, bounded source selection, freezing and outbox preparation with their explicit owners. */
export interface AdmissionNotificationRepository {
  /** @param scope - Server-selected existing original notice, never browser capability or destination input. @returns One source's collection result after current native eligibility checks; this is not a send token. */
  collect(scope: AdmissionNotificationRecipientEmailScope): Promise<AdmissionNotificationCollectionResult>;
}
