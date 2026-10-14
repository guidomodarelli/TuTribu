/** Reads bounded current reviewer facts through a protected SQL projection, never a writer. @module postgres-admission-review-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionCommandScope } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import type { AdmissionReviewReader, AdmissionReviewFilters } from "@/src/modules/academy-admissions/domain/repositories/admission-review-reader";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_REVIEW_CURSOR_SEPARATOR } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { PostgresAdmissionAuthorizationReader } from "./postgres-admission-authorization-reader";
import { canPerformAdmissionAction } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { mapAdmissionReviewStorage, type AdmissionReviewStorageRecord } from "./admission-review-storage-mapper";
import { projectAdmissionReview } from "@/src/modules/academy-admissions/application/results/admission-review-projection";
import { ADMISSION_ADMINISTRATIVE_SURFACE } from "../../constants/admission-administrative-exposure";
import { recordAdmissionAdministrativeExposure } from "./postgres-admission-administrative-exposure";

/** The trusted composition root binds actor/session to its guarded database transaction. */
type ReviewExecutor = <Result>(scope: AdmissionCommandScope, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** Current reviewers receive private facts only for their exact tribe; ordinary request RLS stays closed. */
export class PostgresAdmissionReviewReader implements AdmissionReviewReader {
  /** @param execute - Native current-account guarded executor. @param readRecoveryLock - Live platform recovery state without loading any provider credential. */
  constructor(private readonly execute: ReviewExecutor, private readonly readRecoveryLock: () => Promise<boolean>) {}

  /** @param database - Existing protected transaction. @param scope - Actual native account/session. @returns The SQL clock after current tenant/session/member locks. */
  private async authorize(database: RequestDatabase, scope: AdmissionCommandScope): Promise<Date> {
    const locked = (await database.execute<{ locked: boolean }>(sql`select public.lock_academy_admission_administrative_reader(${scope.tribeId},${scope.sessionId}) as locked where public.current_app_user_id()=${scope.userId}`)).rows[0]?.locked;
    if (!locked) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    const actor = await new PostgresAdmissionAuthorizationReader(database, scope.sessionId, ADMISSION_ACTION.readInbox).getCurrentActor(scope.tribeId, scope.userId);
    if (!actor) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    if (!canPerformAdmissionAction(actor, ADMISSION_ACTION.readInbox, { tribeId: scope.tribeId })) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    const instant = (await database.execute<{ now: string }>(sql`select clock_timestamp() as now from public.session where id=${scope.sessionId} and "userId"=${scope.userId} and "expiresAt">clock_timestamp()`)).rows[0];
    if (!instant) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    return new Date(instant.now);
  }

  /** @param scope - Server-derived exact tribe/account/session. @param query - Boundary-validated bounded tenant-local filters. @returns Oldest-first records and their fixed access fact without leases or command effects. */
  async readList(scope: AdmissionCommandScope, query: AdmissionReviewFilters) {
    return this.execute(scope, async (database) => {
      await this.authorize(database, scope);
      const rows = (await database.execute<{ record: AdmissionReviewStorageRecord }>(sql`select record from public.read_admission_reviews(${scope.tribeId},${scope.sessionId},null,${query.limit + 1},${query.status ?? null},${query.source ?? null},${query.cursor?.submittedAt ?? null},${query.cursor?.id ?? null},${query.search ?? null},${query.submittedFrom ?? null},${query.submittedUntil ?? null})`)).rows;
      const recoveryLocked = await this.readRecoveryLock();
      const now = await this.authorize(database, scope);
      const selected = rows.slice(0, query.limit);
      const last = selected.at(-1)?.record.request;
      const records = selected.map((row) => mapAdmissionReviewStorage(row.record, now, recoveryLocked));
      // Derived filters use the same domain/application meaning as the emitted field.
      // A bounded scanned page may be empty; its cursor still advances past every examined record.
      const visible = records.filter((record) => { const projection = projectAdmissionReview(record); return query.needsVerification === undefined || projection.needsVerification === query.needsVerification; });
      await recordAdmissionAdministrativeExposure(database, scope, { surface: ADMISSION_ADMINISTRATIVE_SURFACE.reviews, resourceId: scope.tribeId, resourceVersion: null, itemCount: visible.length });
      await this.authorize(database, scope);
      return { records: visible, nextCursor: rows.length > query.limit && last ? `${last.submittedAt}${ADMISSION_REVIEW_CURSOR_SEPARATOR}${last.id}` : null };
    });
  }

  /** @param scope - Actual current reviewer authority. @param admissionRequestId - Exact request within that same tribe. @returns One current record or absence; an arbitrary id never selects another tribe. */
  async readDetail(scope: AdmissionCommandScope, admissionRequestId: string) {
    return this.execute(scope, async (database) => {
      await this.authorize(database, scope);
      const row = (await database.execute<{ record: AdmissionReviewStorageRecord }>(sql`select record from public.read_admission_reviews(${scope.tribeId},${scope.sessionId},${admissionRequestId},1)`)).rows[0];
      const recoveryLocked = await this.readRecoveryLock();
      const now = await this.authorize(database, scope);
      if (!row) return null;
      const record = mapAdmissionReviewStorage(row.record, now, recoveryLocked);
      projectAdmissionReview(record);
      await recordAdmissionAdministrativeExposure(database, scope, { surface: ADMISSION_ADMINISTRATIVE_SURFACE.reviews, resourceId: record.request.id, resourceVersion: record.request.version, itemCount: 1 });
      await this.authorize(database, scope);
      return record;
    });
  }
}
