/** Defines incremental private source sweeps without granting collection or dispatch authority. @module admission-notification-source-reader */
import type { AdmissionNotificationAudience } from "../entities/admission-notification";
import type { AdmissionNotificationRecipientEmailScope } from "../entities/admission-notification-recipient-email";

/** Retains every tie-breaker from the original native ordering, without a contact or provider payload. */
export type AdmissionNotificationSourcePosition = {
  readonly createdAtMicroseconds: number;
  readonly obligationId: string;
  readonly recipientUserId: string;
  readonly audience: AdmissionNotificationAudience;
};

/**
 * Continues one open sweep: its fixed horizon and the monotonic frontier of examined sources. Belongs only to the backend traversal
 * owner; persisting it never authorizes a later email. A null frontier means no source has been examined yet.
 */
export type AdmissionNotificationSourceCursor = {
  readonly tribeId: string;
  readonly throughMicroseconds: number;
  readonly after: AdmissionNotificationSourcePosition | null;
};

/** Advances over examined references independently of a collector's existing, suppressed or successful result. */
export type AdmissionNotificationSourcePage = {
  readonly throughMicroseconds: number;
  /** The first `retryCount` sources are pending retries of earlier unavailable sources; they never move the frontier. */
  readonly retryCount: number;
  readonly sources: readonly AdmissionNotificationRecipientEmailScope[];
  /** Exact native position of each source, aligned by index, so a page cut at a soft deadline resumes right after its last collected source. */
  readonly positions: readonly AdmissionNotificationSourcePosition[];
  readonly continuation: AdmissionNotificationSourceCursor | null;
};

/** Selects references for the existing collector; trust, preferences, capability and event currency remain its current native responsibilities. */
export interface AdmissionNotificationSourceReader {
  /**
   * @param tribeId - Exact server-authorized tribe. @param cursor - Original backend continuation, or null to start a new sweep.
   * @param frontier - Last source examined by earlier sweeps when a new sweep starts; ignored while a cursor continues one.
   * @returns One bounded page of retries first and then sources after the frontier; null continuation ends this sweep, including
   * when every examined source is suppressed.
   */
  readPage(tribeId: string, cursor: AdmissionNotificationSourceCursor | null, frontier?: AdmissionNotificationSourcePosition | null): Promise<AdmissionNotificationSourcePage>;
}
