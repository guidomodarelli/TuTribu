/** Models private notification sources, grouping candidates and immutable manifests. @module admission-notification */
import type { AdmissionNotificationPreferenceMode } from "./admission-notification-preference";

/** Includes a time-driven reminder without introducing another admission request transition. */
export type AdmissionNotificationEvent = "pending_created" | "approved" | "rejected" | "cancelled" | "expired" | "reminder";
/** Keeps account-owned preadmission separate from current administrative work. */
export type AdmissionNotificationAudience = "applicant" | "reviewer";
/** Uses original native event identities and carries no external message payload. */
export type AdmissionNotificationObligation = { id: string; tribeId: string; admissionRequestId: string; applicantUserId: string; event: AdmissionNotificationEvent; operationId?: string | null };
/** Preserves native microseconds as safe integers, never round-tripped through Date. */
export type AdmissionNotificationSource = AdmissionNotificationObligation & { readonly createdAtMicroseconds: number };
/** Contains current request facts read under the producer's original locks. */
export type AdmissionNotificationRequest = { readonly id: string; readonly tribeId: string; readonly applicantUserId: string; readonly status: string; readonly submittedAtMicroseconds: number; readonly expiresAtMicroseconds: number };
/** Holds a native calendar window; daily boundaries come from the owning calendar port. */
export type AdmissionNotificationWindow = { readonly startsAtMicroseconds: number; readonly closesAtMicroseconds: number; readonly timeZone: string };
/** Preserves one recipient's current explicit choice and exact native delivery cut. */
export type AdmissionNotificationPreferenceEpoch = { readonly tribeId: string; readonly recipientUserId: string; readonly mode: AdmissionNotificationPreferenceMode; readonly version: number; readonly effectiveFromMicroseconds: number };
/** Contains only fresh recipient and membership facts, never browser permission flags. */
export type AdmissionNotificationRecipient = { readonly userId: string; readonly audience: AdmissionNotificationAudience; readonly currentRole: string | null; readonly membershipStatus: string | null; readonly preference: AdmissionNotificationPreferenceEpoch | null };
/** Separates email enablement and its original cut from OTP and provider configuration. */
export type AdmissionNotificationEmailSettings = { readonly tribeId: string; readonly enabled: boolean; readonly version: number; readonly enabledAtMicroseconds: number | null; readonly timeZone: string };
/** Adapts current trust/capability owner results without addresses or provider DTOs; it grants no dispatch authority. */
export type AdmissionNotificationEmailAvailability = { readonly tribeId: string; readonly recipientUserId: string; readonly trustedAccountEmailAvailable: boolean; readonly preparedEmailConnectionAvailable: boolean };
/** Collects private facts that the application must resolve and recheck in one native transaction. */
export type AdmissionNotificationEmailFacts = { readonly source: AdmissionNotificationSource; readonly request: AdmissionNotificationRequest; readonly recipient: AdmissionNotificationRecipient; readonly emailSettings: AdmissionNotificationEmailSettings; readonly availability: AdmissionNotificationEmailAvailability; readonly nowMicroseconds: number; readonly dailyWindow: AdmissionNotificationWindow | null };
/** Identifies exactly one independent recipient/window/choice, before any provider intent is frozen. */
export type AdmissionNotificationGroupIdentity = { readonly tribeId: string; readonly recipientUserId: string; readonly audience: AdmissionNotificationAudience; readonly mode: Exclude<AdmissionNotificationPreferenceMode, "omitted">; readonly preferenceVersion: number; readonly emailSettingsVersion: number; readonly window: AdmissionNotificationWindow; readonly individualObligationId: string | null };
/** Records a prospective group member, not a send token; all delivery authority must be revalidated at dispatch. */
export type AdmissionNotificationEmailCandidate = { readonly identity: AdmissionNotificationGroupIdentity; readonly obligationId: string; readonly admissionRequestId: string; readonly event: AdmissionNotificationEvent; readonly createdAtMicroseconds: number; readonly deadlineAtMicroseconds: number };
/** Distinguishes optional-email suppression from an internal notice's independent durable state. */
export type AdmissionNotificationSuppressionReason = "notification_scope_mismatch" | "recipient_not_authorized" | "event_not_current" | "email_disabled" | "account_email_untrusted" | "email_capability_unavailable" | "event_predates_email_enablement" | "event_predates_preference" | "preference_omitted" | "notification_deadline_expired" | "deadline_before_preferred_window" | "notification_window_unavailable";
/** Returns a minimal prospective member or one closed reason without changing admission or inbox state. */
export type AdmissionNotificationCandidatePlan = { readonly status: "candidate"; readonly candidate: AdmissionNotificationEmailCandidate } | { readonly status: "suppressed"; readonly reason: AdmissionNotificationSuppressionReason };
/** Freezes only reference metadata; the later outbox owner separately seals its complete provider intent. */
export type AdmissionNotificationGroupManifest = { readonly format: 1; readonly identity: AdmissionNotificationGroupIdentity; readonly items: readonly { readonly obligationId: string; readonly admissionRequestId: string; readonly event: AdmissionNotificationEvent; readonly createdAtMicroseconds: number; readonly deadlineAtMicroseconds: number }[] };
/** Preserves expired units explicitly instead of silently adding them to a longer-lived group. */
export type AdmissionNotificationGroupFreezePlan =
  | { readonly status: "not_due" | "empty" }
  | { readonly status: "rejected"; readonly reason: "notification_scope_mismatch" | "duplicate_notification_obligation" }
  | { readonly status: "expired"; readonly expiredObligationIds: readonly string[] }
  | { readonly status: "frozen"; readonly manifest: AdmissionNotificationGroupManifest; readonly deadlineAtMicroseconds: number; readonly expiredObligationIds: readonly string[] };
