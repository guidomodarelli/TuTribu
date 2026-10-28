/** Traverses native sources incrementally without filtering on mutable email eligibility. @module postgres-admission-notification-source-reader */
import "server-only";
import { sql } from "drizzle-orm";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE } from "../../constants/admission-notification-source-selection";
import { ADMISSION_NOTIFICATION_TIMING } from "../../constants/admission-notification-groups";
import type { AdmissionNotificationAudience } from "../../domain/entities/admission-notification";
import type { AdmissionNotificationSourceReader, AdmissionNotificationSourceCursor, AdmissionNotificationSourcePage, AdmissionNotificationSourcePosition } from "../../domain/repositories/admission-notification-source-reader";
import { admissionNotificationTimestamp } from "../database/admission-notification-timestamp";

/** Consumes selected native columns without schema-validating provider/database rows. */
type SourceRow = { obligation_id: string; recipient_user_id: string; audience: AdmissionNotificationAudience; created_at_microseconds: string };
/** Requires current backend-purpose authority before and after private metadata reads. */
type SourceSelectionAuthorizer = (database: RequestDatabase, tribeId: string) => Promise<boolean>;

/** Selects at most one page of retries and new sources plus a look-ahead row on the caller's original guarded transaction. */
export class PostgresAdmissionNotificationSourceReader implements AdmissionNotificationSourceReader {
  /** @param database - Existing short owner transaction; no checkout is opened here. @param authorize - Current protected backend scope, without browser capability flags. */
  constructor(private readonly database: RequestDatabase, private readonly authorize: SourceSelectionAuthorizer) {}

  /** @param tribeId - Exact current native scope. @returns After confirming private traversal authority. @throws AdmissionOperationError when current backend authority is unavailable. */
  private async assertAuthorized(tribeId: string): Promise<void> {
    if (!await this.authorize(this.database, tribeId)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  }

  /**
   * Traverses original notices incrementally rather than re-reading every 24-hour source on each sweep. The caller must hold the
   * tribe fence, so the horizon read here is never passed by a source that commits later.
   * @param tribeId - Original authorized tenant.
   * @param cursor - Backend-owned horizon and frontier of the open sweep, or null for a new sweep.
   * @param frontier - Last source examined by earlier sweeps when a new sweep starts.
   * @returns Pending retries first, then sources after the frontier, and a continuation independent of collection outcomes; sources
   * created after the horizon belong to the next sweep.
   * @throws AdmissionOperationError on lost authority, crossed cursor scope or an unusable backend clock/position.
   */
  async readPage(tribeId: string, cursor: AdmissionNotificationSourceCursor | null, frontier: AdmissionNotificationSourcePosition | null = null): Promise<AdmissionNotificationSourcePage> {
    await this.assertAuthorized(tribeId);
    if (cursor && cursor.tribeId !== tribeId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    const now = Number((await this.database.execute<{ now: string }>(sql`select (extract(epoch from clock_timestamp())*${MICROSECONDS_PER_SECOND})::bigint::text as now`)).rows[0].now);
    if (!Number.isSafeInteger(now)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    const throughMicroseconds = cursor?.throughMicroseconds ?? now;
    const after = cursor ? cursor.after : frontier;
    const earliestMicroseconds = throughMicroseconds - ADMISSION_NOTIFICATION_TIMING.retryLimitMicroseconds;
    if (cursor && (!Number.isSafeInteger(throughMicroseconds) || throughMicroseconds > now)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    if (after && (!Number.isSafeInteger(after.createdAtMicroseconds) || after.createdAtMicroseconds > throughMicroseconds)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    const retryRows = (await this.database.execute<SourceRow>(sql`
      select obligation.id as obligation_id,notice.recipient_user_id,notice.admission_audience as audience,
        (extract(epoch from obligation.created_at)*${MICROSECONDS_PER_SECOND})::bigint::text as created_at_microseconds
      from public.admission_notification_collection_retries retry
      join public.notifications notice on notice.id=retry.notification_id and notice.tribe_id=retry.tribe_id
      join public.academy_admission_notification_obligations obligation on obligation.id=notice.admission_obligation_id and obligation.tribe_id=notice.tribe_id
      where retry.tribe_id=${tribeId} and retry.retried_through_at<${admissionNotificationTimestamp(throughMicroseconds)}
        and retry.source_created_at>${admissionNotificationTimestamp(earliestMicroseconds)}
      order by retry.source_created_at,obligation.id,notice.recipient_user_id,notice.admission_audience
      limit ${ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE + 1}
    `)).rows;
    const retries = retryRows.slice(0, ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE);
    const remaining = ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE - retries.length;
    const afterFrontier = after ? sql`and (obligation.created_at,obligation.id,notice.recipient_user_id,notice.admission_audience)>
      (${admissionNotificationTimestamp(after.createdAtMicroseconds)},${after.obligationId}::uuid,${after.recipientUserId}::text,${after.audience}::text)` : sql``;
    const sourceRows = remaining > 0 ? (await this.database.execute<SourceRow>(sql`
      select obligation.id as obligation_id,notice.recipient_user_id,notice.admission_audience as audience,
        (extract(epoch from obligation.created_at)*${MICROSECONDS_PER_SECOND})::bigint::text as created_at_microseconds
      from public.academy_admission_notification_obligations obligation
      join public.notifications notice on notice.admission_obligation_id=obligation.id and notice.tribe_id=obligation.tribe_id
      where obligation.tribe_id=${tribeId} and obligation.created_at>${admissionNotificationTimestamp(earliestMicroseconds)}
        and obligation.created_at<=${admissionNotificationTimestamp(throughMicroseconds)} ${afterFrontier}
        -- A notice with a pending retry is examined only through it, never twice in one page.
        and not exists(select 1 from public.admission_notification_collection_retries retry where retry.notification_id=notice.id)
      order by obligation.created_at,obligation.id,notice.recipient_user_id,notice.admission_audience
      limit ${remaining + 1}
    `)).rows : [];
    await this.assertAuthorized(tribeId);
    const selected = [...retries, ...sourceRows.slice(0, remaining)];
    const positions = selected.map((source) => ({ createdAtMicroseconds: Number(source.created_at_microseconds), obligationId: source.obligation_id, recipientUserId: source.recipient_user_id, audience: source.audience }));
    // A page filled by retries has not looked at later sources yet, so the sweep continues.
    const hasMore = retryRows.length > ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE || remaining === 0 || sourceRows.length > remaining;
    const lastPosition = positions.at(-1);
    const nextFrontier = positions.length > retries.length && lastPosition ? lastPosition : after;
    return {
      throughMicroseconds,
      retryCount: retries.length,
      sources: selected.map((source) => ({ tribeId, obligationId: source.obligation_id, recipientUserId: source.recipient_user_id, audience: source.audience })),
      positions,
      continuation: hasMore ? { tribeId, throughMicroseconds, after: nextFrontier } : null,
    };
  }
}
