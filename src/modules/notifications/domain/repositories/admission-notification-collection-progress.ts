/** Defines atomic bounded collection with backend-owned progress and explicit stale-command rejection. @module admission-notification-collection-progress */

/** Keeps an immutable server-generated page identity and the original expected checkpoint version. */
export type AdmissionNotificationCollectionPageCommand = { readonly tribeId: string; readonly operationId: string; readonly expectedVersion: number };

/** Separates examined references from actual new members and deliberate omissions. */
export type AdmissionNotificationCollectionPageCounts = { readonly examined: number; readonly collected: number; readonly existing: number; readonly suppressed: number; readonly unavailable: number; readonly bucketClosed: number };

/** Describes one confirmed page, never external delivery or global queue exhaustion. */
export type AdmissionNotificationCollectionPageResult = AdmissionNotificationCollectionPageCounts & {
  readonly tribeId: string;
  readonly operationId: string;
  readonly previousVersion: number;
  readonly version: number;
  readonly sweepComplete: boolean;
  readonly completedAtMicroseconds: number;
  readonly sourceThroughMicroseconds: number | null;
  readonly sweepHadUnavailable: boolean;
  readonly replayed: boolean;
};

/** Contains bounded recovery metadata for the latest page; older commands must not advance a newer checkpoint. */
export type AdmissionNotificationCollectionProgressSnapshot = {
  readonly tribeId: string;
  readonly version: number;
  readonly hasContinuation: boolean;
  readonly lastPage: AdmissionNotificationCollectionPageResult | null;
  readonly lastSweepCompletedAtMicroseconds: number | null;
  readonly lastCertifiedThroughMicroseconds: number | null;
};

/** Confirms group/member effects and the next position in the same original transaction. */
export interface AdmissionNotificationCollectionProgress {
  /** @param tribeId - Current authorized private tenant. @returns Existing progress without initializing a row or granting send authority. */
  readProgress(tribeId: string): Promise<AdmissionNotificationCollectionProgressSnapshot>;
  /** @param command - Original server command and expected version. @returns A page only after its commit, or its latest matching original result; older/out-of-order commands fail closed. @throws On current authority/configuration failure, version conflict or an unresolved commit; no automatic retry occurs. */
  collectPage(command: AdmissionNotificationCollectionPageCommand): Promise<AdmissionNotificationCollectionPageResult>;
}
