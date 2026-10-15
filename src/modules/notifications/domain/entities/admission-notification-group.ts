/** Models persisted group lifecycle separately from optional-email eligibility and transport. @module admission-notification-group */
import type { AdmissionNotificationAudience, AdmissionNotificationGroupIdentity, AdmissionNotificationGroupManifest, AdmissionNotificationSuppressionReason } from "./admission-notification";

/** Closes a bucket without asserting acceptance or delivery by an external provider. */
export type AdmissionNotificationGroupState = "open" | "frozen" | "suppressed" | "expired";
/** Retains every original member's disposition independently of the frozen live subset. */
export type AdmissionNotificationGroupMemberState = "pending" | "included" | "suppressed" | "expired";
/** Preserves the original identity, immutable reference manifest and exact deadline after closure. */
export type AdmissionNotificationStoredGroup = { readonly id: string; readonly identity: AdmissionNotificationGroupIdentity; readonly state: AdmissionNotificationGroupState; readonly version: number; readonly frozenManifest: AdmissionNotificationGroupManifest | null; readonly deadlineAtMicroseconds: number | null; readonly suppressionReason: AdmissionNotificationSuppressionReason | null; readonly closedAtMicroseconds: number | null; readonly createdAtMicroseconds: number };
/** Keeps logical source uniqueness and its native original deadline after group closure. */
export type AdmissionNotificationStoredGroupMember = { readonly groupId: string; readonly tribeId: string; readonly recipientUserId: string; readonly audience: AdmissionNotificationAudience; readonly obligationId: string; readonly state: AdmissionNotificationGroupMemberState; readonly deadlineAtMicroseconds: number; readonly suppressionReason: AdmissionNotificationSuppressionReason | null; readonly resolvedAtMicroseconds: number | null };
