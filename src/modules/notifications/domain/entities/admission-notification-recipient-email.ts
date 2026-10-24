/** Models private current-account destination evidence, never a public DTO or dispatch authority. @module admission-notification-recipient-email */
import type { AdmissionNotificationAudience, AdmissionNotificationEvent } from "./admission-notification";

/** Identifies one existing original notice selected by the server-side producer. */
export type AdmissionNotificationRecipientEmailScope = { readonly tribeId: string; readonly obligationId: string; readonly recipientUserId: string; readonly audience: AdmissionNotificationAudience };

/** Retains the current native account/capture relationships without OAuth tokens or provider payloads. */
export type AdmissionNotificationGlobalEmailEvidence = {
  readonly userId: string; readonly accountUserId: string; readonly accountId: string; readonly evidenceAccountId: string;
  readonly providerId: string; readonly accountSubject: string; readonly evidenceSubject: string; readonly normalizedEmail: string;
  readonly classification: string; readonly invalidated: boolean; readonly verifiedInPast: boolean;
};

/** Describes already applied contact control for its exact request; presentation freshness is not restarted. */
export type AdmissionNotificationLocalEmailProof = {
  readonly id: string; readonly userId: string; readonly tribeId: string; readonly appliedRequestId: string | null;
  readonly contactType: string; readonly normalizedContact: string; readonly purpose: string; readonly status: string;
  readonly invalidated: boolean; readonly verifiedInPast: boolean; readonly appliedInPast: boolean;
  readonly environment: string; readonly securityEpoch: string; readonly resourceSecurityEpoch: string;
};

/** Contains only original scoped notice and fresh native facts read after the owning locks. */
export type AdmissionNotificationRecipientEmailFacts = {
  readonly scope: AdmissionNotificationRecipientEmailScope;
  readonly source: {
    readonly tribeId: string; readonly obligationId: string; readonly admissionRequestId: string; readonly applicantUserId: string;
    readonly event: AdmissionNotificationEvent; readonly noticeRecipientUserId: string; readonly noticeAudience: AdmissionNotificationAudience;
    readonly evidenceKind: string; readonly proofId: string | null; readonly contactType: string | null; readonly normalizedContact: string | null;
  };
  readonly account: { readonly userId: string; readonly normalizedEmail: string; readonly currentRole: string | null; readonly membershipStatus: string | null };
  readonly globalEvidence: readonly AdmissionNotificationGlobalEmailEvidence[];
  readonly localProof: AdmissionNotificationLocalEmailProof | null;
  readonly runtime: { readonly environment: string; readonly securityEpoch: string };
};

/** Projects only a destination whose current trust is scoped to this original notice; it is not a send token. */
export type TrustedAdmissionNotificationEmail = AdmissionNotificationRecipientEmailScope & { readonly normalizedEmail: string };
