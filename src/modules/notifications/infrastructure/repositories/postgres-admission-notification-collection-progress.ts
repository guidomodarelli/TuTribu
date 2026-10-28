/** Commits one bounded incremental source page, its retries and its checkpoint together, without provider RPC or automatic retries. @module postgres-admission-notification-collection-progress */
import "server-only";
import { sql } from "drizzle-orm";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_NOTIFICATION_COLLECTED, ADMISSION_NOTIFICATION_COLLECTION_EXISTING, ADMISSION_NOTIFICATION_COLLECTION_UNAVAILABLE, ADMISSION_NOTIFICATION_COLLECTION_BUCKET_CLOSED } from "../../constants/admission-notification-collection";
import { ADMISSION_NOTIFICATION_GROUP_REASON, ADMISSION_NOTIFICATION_SUPPRESSED_STATUS, ADMISSION_NOTIFICATION_TIMING } from "../../constants/admission-notification-groups";
import type { AdmissionNotificationCollectionProgress, AdmissionNotificationCollectionPageCommand, AdmissionNotificationCollectionPageResult, AdmissionNotificationCollectionProgressSnapshot } from "../../domain/repositories/admission-notification-collection-progress";
import { ADMISSION_NOTIFICATION_COLLECTION_CHUNK_SIZE } from "../../constants/admission-notification-source-selection";
import type { AdmissionNotificationCollectionResult } from "../../domain/repositories/admission-notification-repository";
import { admissionNotificationTimestamp } from "../database/admission-notification-timestamp";
import { PostgresAdmissionNotificationRepository } from "./postgres-admission-notification-repository";
import { PostgresAdmissionNotificationSourceReader } from "./postgres-admission-notification-source-reader";
import { collectionProgressCursor, collectionProgressFrontier, collectionProgressPageResult, collectionProgressSnapshot, type AdmissionNotificationCollectionProgressRow } from "./admission-notification-collection-progress-mapper";
import type { AdmissionNotificationRecipientEmailScope } from "../../domain/entities/admission-notification-recipient-email";

/** Returns only after the original guarded owner confirms commit; a lost confirmation rejects without retry. */
export type AdmissionNotificationCollectionExecutor = <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Uses current DB-only private purpose authority, repeated after waits and before commit. */
export type AdmissionNotificationCollectionAuthorizer = (database: RequestDatabase, tribeId: string) => Promise<boolean>;

/**
 * @param collected - Results of the examined sources, in page order.
 * @param page - Read page; its first `retryCount` sources are retries.
 * @returns Page counters, whether any source was unavailable, and the retries that resolved or must stay pending.
 */
function tallyCollectedPage(collected: readonly AdmissionNotificationCollectionResult[], page: { sources: readonly AdmissionNotificationRecipientEmailScope[]; retryCount: number }) {
  const counts = { examined: collected.length, collected: 0, existing: 0, suppressed: 0, unavailable: 0, bucketClosed: 0 };
  let pageHadUnavailable = false;
  const resolvedRetries: AdmissionNotificationRecipientEmailScope[] = [], pendingRetries: AdmissionNotificationRecipientEmailScope[] = [];
  collected.forEach((result, index) => {
    const unavailable = result.status === ADMISSION_NOTIFICATION_COLLECTION_UNAVAILABLE || result.status === ADMISSION_NOTIFICATION_SUPPRESSED_STATUS && (result.reason === ADMISSION_NOTIFICATION_GROUP_REASON.capabilityUnavailable || result.reason === ADMISSION_NOTIFICATION_GROUP_REASON.windowUnavailable);
    if (unavailable) { pageHadUnavailable = true; pendingRetries.push(page.sources[index]); }
    else if (index < page.retryCount) resolvedRetries.push(page.sources[index]);
    switch (result.status) {
      case ADMISSION_NOTIFICATION_COLLECTED: counts.collected++; break;
      case ADMISSION_NOTIFICATION_COLLECTION_EXISTING: counts.existing++; break;
      case ADMISSION_NOTIFICATION_SUPPRESSED_STATUS: counts.suppressed++; break;
      case ADMISSION_NOTIFICATION_COLLECTION_UNAVAILABLE: counts.unavailable++; break;
      case ADMISSION_NOTIFICATION_COLLECTION_BUCKET_CLOSED: counts.bucketClosed++; break;
    }
  });
  return { counts, pageHadUnavailable, resolvedRetries, pendingRetries };
}

/** Stores one checkpoint/latest receipt per live tribe, without a growing page ledger or public job framework. */
export class PostgresAdmissionNotificationCollectionProgress implements AdmissionNotificationCollectionProgress {
  /** @param execute - Original commit-confirming guarded transaction owner. @param authorize - Current protected backend scope, never browser flags. @param readSecurityConfig - Live local external epoch/recovery guard; no provider call under locks. */
  constructor(private readonly execute: AdmissionNotificationCollectionExecutor, private readonly authorize: AdmissionNotificationCollectionAuthorizer, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>, private readonly now: () => number = Date.now) {}

  /** @param database - Original owner transaction. @param tribeId - Exact native tenant. @returns After current private purpose authority is confirmed. @throws AdmissionOperationError on current permission denial. */
  private async assertAuthorized(database: RequestDatabase, tribeId: string): Promise<void> {
    if (!await this.authorize(database, tribeId)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  }

  /** @param database - Original owner transaction. @param tribeId - Exact private scope. @param original - Original local external epoch. @returns After fresh authority and recovery/epoch checks. @throws AdmissionOperationError when progress must roll back. */
  private async assertCurrent(database: RequestDatabase, tribeId: string, original: MessagingSecurityConfig): Promise<void> {
    await this.assertAuthorized(database, tribeId);
    const current = await this.readSecurityConfig();
    if (current.recoveryLocked || current.environment !== original.environment || current.securityEpoch !== original.securityEpoch) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
  }

  /** @param database - Original owner transaction. @param tribeId - Exact tenant whose checkpoint this transaction ensured. @returns Its checkpoint. @throws AdmissionOperationError when it is missing. */
  private async requiredRow(database: RequestDatabase, tribeId: string): Promise<AdmissionNotificationCollectionProgressRow> {
    const row = await this.readRow(database, tribeId);
    if (!row) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.dependencyUnavailable);
    return row;
  }

  /** @param database - Existing transaction. @param tribeId - Exact tenant, already authorized. @returns Selected native checkpoint columns, or genuine absence; no provider/row schema validation occurs. */
  private async readRow(database: RequestDatabase, tribeId: string): Promise<AdmissionNotificationCollectionProgressRow | null> {
    return (await database.execute<AdmissionNotificationCollectionProgressRow>(sql`select tribe_id,version,
      (extract(epoch from through_at)*${MICROSECONDS_PER_SECOND})::bigint::text as through_microseconds,
      (extract(epoch from after_created_at)*${MICROSECONDS_PER_SECOND})::bigint::text as after_created_microseconds,
      after_obligation_id,after_recipient_user_id,after_audience,last_operation_id,
      (extract(epoch from last_completed_at)*${MICROSECONDS_PER_SECOND})::bigint::text as last_completed_microseconds,
      (extract(epoch from last_sweep_completed_at)*${MICROSECONDS_PER_SECOND})::bigint::text as last_sweep_completed_microseconds,
      (extract(epoch from last_page_through_at)*${MICROSECONDS_PER_SECOND})::bigint::text as last_page_through_microseconds,
      (extract(epoch from last_certified_through_at)*${MICROSECONDS_PER_SECOND})::bigint::text as last_certified_through_microseconds,sweep_had_unavailable,
      examined,collected,existing,suppressed,unavailable,bucket_closed,sweep_complete
      from public.admission_notification_collection_progress where tribe_id=${tribeId}`)).rows[0] ?? null;
  }

  /**
   * @param database - Original owner transaction holding the tribe fence. @param tribeId - Exact tenant.
   * @param retries - `throughMicroseconds`: horizon of the current sweep; a retry examined in it waits for the next sweep.
   * `resolved`: retried sources that are no longer unavailable. `pending`: sources that stayed or became unavailable.
   * @returns After the retries table reflects this page's examined sources.
   */
  private async recordRetries(database: RequestDatabase, tribeId: string, { throughMicroseconds, resolved, pending }: { throughMicroseconds: number; resolved: readonly AdmissionNotificationRecipientEmailScope[]; pending: readonly AdmissionNotificationRecipientEmailScope[] }): Promise<void> {
    if (resolved.length) await database.execute(sql`delete from public.admission_notification_collection_retries retry using public.notifications notice, jsonb_to_recordset(${JSON.stringify(resolved)}::jsonb) as source("obligationId" uuid,"recipientUserId" text)
      where retry.tribe_id=${tribeId} and notice.id=retry.notification_id and notice.tribe_id=${tribeId} and notice.admission_obligation_id=source."obligationId" and notice.recipient_user_id=source."recipientUserId"`);
    if (pending.length) await database.execute(sql`insert into public.admission_notification_collection_retries(notification_id,tribe_id,source_created_at,retried_through_at)
      select notice.id,${tribeId},obligation.created_at,${admissionNotificationTimestamp(throughMicroseconds)} from jsonb_to_recordset(${JSON.stringify(pending)}::jsonb) as source("obligationId" uuid,"recipientUserId" text)
      join public.notifications notice on notice.tribe_id=${tribeId} and notice.admission_obligation_id=source."obligationId" and notice.recipient_user_id=source."recipientUserId"
      join public.academy_admission_notification_obligations obligation on obligation.id=notice.admission_obligation_id and obligation.tribe_id=notice.tribe_id
      on conflict (notification_id) do update set retried_through_at=excluded.retried_through_at`);
  }

  /** @param tribeId - Current server-authorized tenant. @returns Existing latest metadata without initializing storage or granting a future send. @throws AdmissionOperationError with private cause on an unavailable metadata read. */
  async readProgress(tribeId: string): Promise<AdmissionNotificationCollectionProgressSnapshot> {
    try {
      return await this.execute(async (database) => {
        await this.assertAuthorized(database, tribeId);
        if (!(await database.execute(sql`select id from public.tribes where id=${tribeId}`)).rows[0]) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
        const row = await this.readRow(database, tribeId);
        await this.assertAuthorized(database, tribeId);
        return collectionProgressSnapshot(tribeId, row);
      });
    } catch (error) {
      if (error instanceof AdmissionOperationError) throw error;
      throw new AdmissionOperationError(ADMISSION_ERROR_CODE.dependencyUnavailable, { cause: error });
    }
  }

  /** @param collector - Same-transaction collector. @param command - Original page command and its soft deadline. @param sources - Page sources in order. @returns Collected results for every chunk started before the soft deadline; the first chunk always runs. */
  private async collectPageSources(collector: PostgresAdmissionNotificationRepository, command: AdmissionNotificationCollectionPageCommand, sources: Parameters<PostgresAdmissionNotificationRepository["collectMany"]>[1]): Promise<AdmissionNotificationCollectionResult[]> {
    const collected: AdmissionNotificationCollectionResult[] = [];
    for (let start = 0; start < sources.length; start += ADMISSION_NOTIFICATION_COLLECTION_CHUNK_SIZE) {
      if (start > 0 && command.softDeadlineAtMilliseconds !== undefined && this.now() >= command.softDeadlineAtMilliseconds) break;
      collected.push(...await collector.collectMany(command.tribeId, sources.slice(start, start + ADMISSION_NOTIFICATION_COLLECTION_CHUNK_SIZE)));
    }
    return collected;
  }

  /** @param command - Immutable backend page identity and original expected version. @returns Its committed page or latest matching original result, without blind retry after uncertain commit. @throws AdmissionOperationError on stale commands, lost authority/epoch or unresolved persistence. */
  async collectPage(command: AdmissionNotificationCollectionPageCommand): Promise<AdmissionNotificationCollectionPageResult> {
    try {
      return await this.execute(async (database) => {
        await this.assertAuthorized(database, command.tribeId);
        if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
        if (!(await database.execute(sql`select id from public.tribes where id=${command.tribeId} for update`)).rows[0]) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
        await this.assertAuthorized(database, command.tribeId);
        const originalConfig = await this.readSecurityConfig();
        if (originalConfig.recoveryLocked) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
        await database.execute(sql`insert into public.admission_notification_collection_progress(tribe_id) values (${command.tribeId}) on conflict (tribe_id) do nothing`);
        await database.execute(sql`select tribe_id from public.admission_notification_collection_progress where tribe_id=${command.tribeId} for update`);
        const original = await this.requiredRow(database, command.tribeId);
        const last = collectionProgressPageResult(original);
        if (last?.operationId === command.operationId) {
          if (last.previousVersion !== command.expectedVersion) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.idempotencyConflict);
          await this.assertCurrent(database, command.tribeId, originalConfig);
          return { ...last, replayed: true };
        }
        if (original.version !== command.expectedVersion) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
        const reader = new PostgresAdmissionNotificationSourceReader(database, this.authorize);
        const collector = new PostgresAdmissionNotificationRepository(database, this.authorize, this.readSecurityConfig);
        // Retries older than the 24-hour retry limit can no longer collect, so they stop holding certification back.
        await database.execute(sql`delete from public.admission_notification_collection_retries where tribe_id=${command.tribeId} and source_created_at<=clock_timestamp()-${ADMISSION_NOTIFICATION_TIMING.retryLimitMicroseconds}::bigint*interval '1 microsecond'`);
        const frontierBefore = collectionProgressFrontier(original);
        const page = await reader.readPage(command.tribeId, collectionProgressCursor(original), frontierBefore);
        // Chunks keep one page inside its phase: after the soft deadline no further chunk starts, and the checkpoint resumes
        // right after the last collected source instead of discarding the whole page at the hard deadline.
        const collected = await this.collectPageSources(collector, command, page.sources);
        const { counts, pageHadUnavailable, resolvedRetries, pendingRetries } = tallyCollectedPage(collected, page);
        // Only examined new sources move the frontier; a page cut at the soft deadline resumes right after the last one.
        const frontier = collected.length > page.retryCount ? page.positions[collected.length - 1] : frontierBefore;
        const cursor = collected.length < page.sources.length || page.continuation ? { throughMicroseconds: page.throughMicroseconds } : null;
        // Retries are written before the checkpoint because its trigger certifies only up to the oldest pending one.
        await this.recordRetries(database, command.tribeId, { throughMicroseconds: page.throughMicroseconds, resolved: resolvedRetries, pending: pendingRetries });
        await this.assertCurrent(database, command.tribeId, originalConfig);
        await database.execute(sql`update public.admission_notification_collection_progress set version=version+1,
          last_page_through_at=${admissionNotificationTimestamp(page.throughMicroseconds)},
          page_had_unavailable=${pageHadUnavailable},
          through_at=${cursor ? admissionNotificationTimestamp(cursor.throughMicroseconds) : null},
          after_created_at=${frontier ? admissionNotificationTimestamp(frontier.createdAtMicroseconds) : null},
          after_obligation_id=${frontier?.obligationId ?? null},after_recipient_user_id=${frontier?.recipientUserId ?? null},after_audience=${frontier?.audience ?? null},
          last_operation_id=${command.operationId},examined=${counts.examined},collected=${counts.collected},existing=${counts.existing},suppressed=${counts.suppressed},unavailable=${counts.unavailable},bucket_closed=${counts.bucketClosed},sweep_complete=${cursor === null}
          where tribe_id=${command.tribeId} and version=${command.expectedVersion}`);
        const saved = await this.requiredRow(database, command.tribeId);
        const result = collectionProgressPageResult(saved);
        if (result?.operationId !== command.operationId || result.version !== command.expectedVersion + 1) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved);
        await this.assertCurrent(database, command.tribeId, originalConfig);
        return result;
      });
    } catch (error) {
      if (error instanceof AdmissionOperationError) throw error;
      if (error instanceof MessagingCryptographyError) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete, { cause: error });
      throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { cause: error });
    }
  }
}
