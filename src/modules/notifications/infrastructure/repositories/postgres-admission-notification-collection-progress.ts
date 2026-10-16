/** Commits one bounded source page and its checkpoint together, without provider RPC or automatic retries. @module postgres-admission-notification-collection-progress */
import "server-only";
import { sql } from "drizzle-orm";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_NOTIFICATION_COLLECTED, ADMISSION_NOTIFICATION_COLLECTION_EXISTING, ADMISSION_NOTIFICATION_COLLECTION_UNAVAILABLE, ADMISSION_NOTIFICATION_COLLECTION_BUCKET_CLOSED } from "../../constants/admission-notification-collection";
import { ADMISSION_NOTIFICATION_GROUP_REASON, ADMISSION_NOTIFICATION_SUPPRESSED_STATUS } from "../../constants/admission-notification-groups";
import type { AdmissionNotificationCollectionProgress, AdmissionNotificationCollectionPageCommand, AdmissionNotificationCollectionPageResult, AdmissionNotificationCollectionProgressSnapshot } from "../../domain/repositories/admission-notification-collection-progress";
import { admissionNotificationTimestamp } from "../database/admission-notification-timestamp";
import { PostgresAdmissionNotificationRepository } from "./postgres-admission-notification-repository";
import { PostgresAdmissionNotificationSourceReader } from "./postgres-admission-notification-source-reader";
import { collectionProgressCursor, collectionProgressPageResult, collectionProgressSnapshot, type AdmissionNotificationCollectionProgressRow } from "./admission-notification-collection-progress-mapper";

/** Returns only after the original guarded owner confirms commit; a lost confirmation rejects without retry. */
export type AdmissionNotificationCollectionExecutor = <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Uses current DB-only private purpose authority, repeated after waits and before commit. */
export type AdmissionNotificationCollectionAuthorizer = (database: RequestDatabase, tribeId: string) => Promise<boolean>;

/** Stores one checkpoint/latest receipt per live tribe, without a growing page ledger or public job framework. */
export class PostgresAdmissionNotificationCollectionProgress implements AdmissionNotificationCollectionProgress {
  /** @param execute - Original commit-confirming guarded transaction owner. @param authorize - Current protected backend scope, never browser flags. @param readSecurityConfig - Live local external epoch/recovery guard; no provider call under locks. */
  constructor(private readonly execute: AdmissionNotificationCollectionExecutor, private readonly authorize: AdmissionNotificationCollectionAuthorizer, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

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
        const original = (await this.readRow(database, command.tribeId))!;
        const last = collectionProgressPageResult(original);
        if (last?.operationId === command.operationId) {
          if (last.previousVersion !== command.expectedVersion) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.idempotencyConflict);
          await this.assertCurrent(database, command.tribeId, originalConfig);
          return { ...last, replayed: true };
        }
        if (original.version !== command.expectedVersion) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
        const reader = new PostgresAdmissionNotificationSourceReader(database, this.authorize);
        const collector = new PostgresAdmissionNotificationRepository(database, this.authorize, this.readSecurityConfig);
        const page = await reader.readPage(command.tribeId, collectionProgressCursor(original));
        const counts = { examined: page.sources.length, collected: 0, existing: 0, suppressed: 0, unavailable: 0, bucketClosed: 0 };
        let pageHadUnavailable = false;
        for (const result of await collector.collectMany(command.tribeId, page.sources)) {
          if (result.status === ADMISSION_NOTIFICATION_COLLECTION_UNAVAILABLE || result.status === ADMISSION_NOTIFICATION_SUPPRESSED_STATUS && (result.reason === ADMISSION_NOTIFICATION_GROUP_REASON.capabilityUnavailable || result.reason === ADMISSION_NOTIFICATION_GROUP_REASON.windowUnavailable)) pageHadUnavailable = true;
          switch (result.status) {
            case ADMISSION_NOTIFICATION_COLLECTED: counts.collected++; break;
            case ADMISSION_NOTIFICATION_COLLECTION_EXISTING: counts.existing++; break;
            case ADMISSION_NOTIFICATION_SUPPRESSED_STATUS: counts.suppressed++; break;
            case ADMISSION_NOTIFICATION_COLLECTION_UNAVAILABLE: counts.unavailable++; break;
            case ADMISSION_NOTIFICATION_COLLECTION_BUCKET_CLOSED: counts.bucketClosed++; break;
          }
        }
        await this.assertCurrent(database, command.tribeId, originalConfig);
        const cursor = page.continuation;
        await database.execute(sql`update public.admission_notification_collection_progress set version=version+1,
          last_page_through_at=${admissionNotificationTimestamp(page.throughMicroseconds)},
          page_had_unavailable=${pageHadUnavailable},
          through_at=${cursor ? admissionNotificationTimestamp(cursor.throughMicroseconds) : null},
          after_created_at=${cursor ? admissionNotificationTimestamp(cursor.after.createdAtMicroseconds) : null},
          after_obligation_id=${cursor?.after.obligationId ?? null},after_recipient_user_id=${cursor?.after.recipientUserId ?? null},after_audience=${cursor?.after.audience ?? null},
          last_operation_id=${command.operationId},examined=${counts.examined},collected=${counts.collected},existing=${counts.existing},suppressed=${counts.suppressed},unavailable=${counts.unavailable},bucket_closed=${counts.bucketClosed},sweep_complete=${cursor === null}
          where tribe_id=${command.tribeId} and version=${command.expectedVersion}`);
        const saved = (await this.readRow(database, command.tribeId))!;
        const result = collectionProgressPageResult(saved);
        if (!result || result.operationId !== command.operationId || result.version !== command.expectedVersion + 1) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved);
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
