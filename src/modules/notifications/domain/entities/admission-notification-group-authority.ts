/** Models current authority over a whole immutable notification group without transport or secret material. @module admission-notification-group-authority */
import type { AdmissionNotificationAudience, AdmissionNotificationCandidatePlan, AdmissionNotificationGroupManifest, AdmissionNotificationSuppressionReason } from "./admission-notification";

/** Selects only explicit original grouped provenance, never an obligation guessed from a matching UUID. */
export type AdmissionNotificationGroupAuthorityScope = { readonly tribeId: string; readonly groupId: string; readonly recipientUserId: string; readonly audience: AdmissionNotificationAudience };
/** Preserves current independent source decisions for every original member. */
export type AdmissionNotificationGroupAuthorityMember = { readonly obligationId: string; readonly plan: AdmissionNotificationCandidatePlan };
/** Keeps missing lineage and modified content distinct from a current optional-email policy denial. */
export type AdmissionNotificationGroupAuthorityReason = AdmissionNotificationSuppressionReason | "notification_group_unavailable" | "notification_group_not_frozen" | "notification_group_manifest_changed" | "notification_connection_changed" | "notification_payload_unusable";
/** Grants only a prospective native authority result; the attempt, resource and secret boundaries retain their own checks. */
export type AdmissionNotificationGroupAuthorityPlan = { readonly status: "current"; readonly manifest: AdmissionNotificationGroupManifest; readonly deadlineAtMicroseconds: number } | { readonly status: "denied"; readonly reason: AdmissionNotificationGroupAuthorityReason };
