/** Traverses a finite native source window without filtering on mutable email eligibility. @module postgres-admission-notification-source-reader */
import "server-only";
import { sql } from "drizzle-orm";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE } from "../../constants/admission-notification-source-selection";
import { ADMISSION_NOTIFICATION_TIMING } from "../../constants/admission-notification-groups";
import type { AdmissionNotificationAudience } from "../../domain/entities/admission-notification";
import type { AdmissionNotificationSourceReader, AdmissionNotificationSourceCursor, AdmissionNotificationSourcePage } from "../../domain/repositories/admission-notification-source-reader";
import { admissionNotificationTimestamp } from "../database/admission-notification-timestamp";

/** Consumes selected native columns without schema-validating provider/database rows. */
type SourceRow = { obligation_id: string; recipient_user_id: string; audience: AdmissionNotificationAudience; created_at_microseconds: string };
/** Requires current backend-purpose authority before and after private metadata reads. */
type SourceSelectionAuthorizer = (database: RequestDatabase, tribeId: string) => Promise<boolean>;

/** Selects at most one page plus a look-ahead row on the caller's original guarded transaction. */
export class PostgresAdmissionNotificationSourceReader implements AdmissionNotificationSourceReader {
  /** @param database - Existing short owner transaction; no checkout is opened here. @param authorize - Current protected backend scope, without browser capability flags. */
  constructor(private readonly database: RequestDatabase, private readonly authorize: SourceSelectionAuthorizer) {}

  /** @param tribeId - Exact current native scope. @returns After confirming private traversal authority. @throws AdmissionOperationError when current backend authority is unavailable. */
  private async assertAuthorized(tribeId: string): Promise<void> {
    if (!await this.authorize(this.database, tribeId)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  }

  /**
   * Traverses original notices rather than repeatedly selecting the first email-eligible result.
   * @param tribeId - Original authorized tenant.
   * @param cursor - Backend-owned original upper clock and exact last examined tuple, or null for a fresh sweep.
   * @returns References and a continuation independent of collection outcomes; new later events belong to the next sweep.
   * @throws AdmissionOperationError on lost authority, crossed cursor scope or an unusable backend clock/position.
   */
  async readPage(tribeId: string, cursor: AdmissionNotificationSourceCursor | null): Promise<AdmissionNotificationSourcePage> {
    await this.assertAuthorized(tribeId);
    if (cursor && cursor.tribeId !== tribeId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    const now = Number((await this.database.execute<{ now: string }>(sql`select (extract(epoch from clock_timestamp())*${MICROSECONDS_PER_SECOND})::bigint::text as now`)).rows[0].now);
    if (!Number.isSafeInteger(now)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    const throughMicroseconds = cursor?.throughMicroseconds ?? now;
    const earliestMicroseconds = throughMicroseconds - ADMISSION_NOTIFICATION_TIMING.retryLimitMicroseconds;
    if (cursor && (!Number.isSafeInteger(throughMicroseconds) || !Number.isSafeInteger(cursor.after.createdAtMicroseconds) || throughMicroseconds > now || cursor.after.createdAtMicroseconds > throughMicroseconds || cursor.after.createdAtMicroseconds <= earliestMicroseconds)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    const after = cursor ? sql`and (obligation.created_at,obligation.id,notice.recipient_user_id,notice.admission_audience)>
      (${admissionNotificationTimestamp(cursor.after.createdAtMicroseconds)},${cursor.after.obligationId}::uuid,${cursor.after.recipientUserId}::text,${cursor.after.audience}::text)` : sql``;
    const rows = (await this.database.execute<SourceRow>(sql`
      select obligation.id as obligation_id,notice.recipient_user_id,notice.admission_audience as audience,
        (extract(epoch from obligation.created_at)*${MICROSECONDS_PER_SECOND})::bigint::text as created_at_microseconds
      from public.academy_admission_notification_obligations obligation
      join public.notifications notice on notice.admission_obligation_id=obligation.id and notice.tribe_id=obligation.tribe_id
      where obligation.tribe_id=${tribeId} and obligation.created_at>${admissionNotificationTimestamp(earliestMicroseconds)}
        and obligation.created_at<=${admissionNotificationTimestamp(throughMicroseconds)} ${after}
      order by obligation.created_at,obligation.id,notice.recipient_user_id,notice.admission_audience
      limit ${ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE + 1}
    `)).rows;
    await this.assertAuthorized(tribeId);
    const selected = rows.slice(0, ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE);
    const positions = selected.map((source) => ({ createdAtMicroseconds: Number(source.created_at_microseconds), obligationId: source.obligation_id, recipientUserId: source.recipient_user_id, audience: source.audience }));
    const last = positions.at(-1);
    return {
      throughMicroseconds,
      sources: selected.map((source) => ({ tribeId, obligationId: source.obligation_id, recipientUserId: source.recipient_user_id, audience: source.audience })),
      positions,
      continuation: rows.length > ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE && last ? { tribeId, throughMicroseconds, after: last } : null,
    };
  }
}
