/** Defines finite private source sweeps without granting collection or dispatch authority. @module admission-notification-source-reader */
import type { AdmissionNotificationAudience } from "../entities/admission-notification";
import type { AdmissionNotificationRecipientEmailScope } from "../entities/admission-notification-recipient-email";

/** Retains every tie-breaker from the original native ordering, without a contact or provider payload. */
export type AdmissionNotificationSourcePosition = {
  readonly createdAtMicroseconds: number;
  readonly obligationId: string;
  readonly recipientUserId: string;
  readonly audience: AdmissionNotificationAudience;
};

/** Belongs only to the backend traversal owner; persisting it never authorizes a later email. */
export type AdmissionNotificationSourceCursor = {
  readonly tribeId: string;
  readonly throughMicroseconds: number;
  readonly after: AdmissionNotificationSourcePosition;
};

/** Advances over examined references independently of a collector's existing, suppressed or successful result. */
export type AdmissionNotificationSourcePage = {
  readonly sources: readonly AdmissionNotificationRecipientEmailScope[];
  readonly continuation: AdmissionNotificationSourceCursor | null;
};

/** Selects references for the existing collector; trust, preferences, capability and event currency remain its current native responsibilities. */
export interface AdmissionNotificationSourceReader {
  /** @param tribeId - Exact server-authorized tribe. @param cursor - Original backend continuation, or null to start a fresh finite sweep. @returns One bounded page and its next original position; null continuation ends this sweep, including when every examined source is suppressed. */
  readPage(tribeId: string, cursor: AdmissionNotificationSourceCursor | null): Promise<AdmissionNotificationSourcePage>;
}
