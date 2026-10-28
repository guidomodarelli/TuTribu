/** Reconciles the admission owner inside the actual membership transaction using current stored facts. @module postgres-admission-membership-lifecycle-writer */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionMembershipLifecycleEvent, AdmissionMembershipLifecycleWriter } from "../../domain/repositories/admission-membership-lifecycle-writer";
import { ADMISSION_DECISION_RULE } from "../../constants/admission-decision";
import { TRIBE_MEMBERSHIP_STATUS, TRIBE_MEMBERSHIP_STATUS_REASON } from "@/src/modules/tribes/constants/tribe-page-access";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_MEMBERSHIP_LIFECYCLE_EVENT } from "../../constants/admission-membership-lifecycle";

/** Never opens another transaction or sends an external message. */
export class PostgresAdmissionMembershipLifecycleWriter implements AdmissionMembershipLifecycleWriter {
  /** @param database - Original guarded membership transaction with owner-only lifecycle privileges. */
  constructor(private readonly database: RequestDatabase) {}
  /** @param event - Actual locked member identity and mutation. @returns After closure or a harmless no-op when the existing SQL trigger already closed it. */
  async reconcile(event: AdmissionMembershipLifecycleEvent): Promise<void> {
    const member = (await this.database.execute<{id: string;status: string;status_reason: string}>(sql`select id,status,status_reason from public.tribe_members where tribe_id=${event.tribeId} and user_id=${event.userId} for update`)).rows[0];
    const deleted = event.kind === ADMISSION_MEMBERSHIP_LIFECYCLE_EVENT.left;
    if (deleted ? member !== undefined : member?.id !== event.memberId || event.kind === ADMISSION_MEMBERSHIP_LIFECYCLE_EVENT.conductBlocked && (member.status !== TRIBE_MEMBERSHIP_STATUS.blocked || member.status_reason !== TRIBE_MEMBERSHIP_STATUS_REASON.conductBlocked) || event.kind === ADMISSION_MEMBERSHIP_LIFECYCLE_EVENT.removed && (member.status !== TRIBE_MEMBERSHIP_STATUS.removed || member.status_reason !== TRIBE_MEMBERSHIP_STATUS_REASON.none)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
    const reason = deleted ? ADMISSION_DECISION_RULE.membershipDeleted : ADMISSION_DECISION_RULE.nonrecoverableMembership;
    await this.database.execute(sql`select public.close_unavailable_admission_request(${event.tribeId},${event.userId},${reason})`);
  }
}
