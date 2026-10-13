/** Stages admission obligations and minimal internal notices in the caller's original transaction. @module admission-notification-obligation-writer */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionNotificationObligationWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import { ADMISSION_NOTIFICATION_AUDIENCE } from "@/src/modules/notifications/constants/admission-notifications";
import { ADMISSION_REQUEST_EVENT } from "@/src/modules/academy-admissions/constants/admission-request";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";

/**
 * Composes only DB effects; the admission owner retains actor/request authorization and shared locks.
 * @param database - Existing guarded business transaction; never a nested checkout or outbound transport.
 * @returns A scoped obligation writer with current reviewer selection and protected SQL materialization.
 */
export function createPostgresAdmissionNotificationObligationWriter(database: RequestDatabase): AdmissionNotificationObligationWriter {
  return {
    /** @param obligation - Original admission event/tenant/account identities. @returns After all local notices are staged, before the caller commits. */
    async record(obligation) {
      await database.execute(sql`insert into public.academy_admission_notification_obligations(id,tribe_id,request_id,applicant_user_id,event_type) values (${obligation.id},${obligation.tribeId},${obligation.admissionRequestId},${obligation.applicantUserId},${obligation.event})`);
      if (obligation.event === ADMISSION_REQUEST_EVENT.pendingCreated) {
        const reviewers = (await database.execute<{ user_id: string }>(sql`select user_id from public.tribe_members where tribe_id=${obligation.tribeId} and role in (${TRIBE_MEMBER_ROLE.leader},${TRIBE_MEMBER_ROLE.guardian}) and status=${TRIBE_MEMBERSHIP_STATUS.active} order by user_id for share`)).rows;
        for (const reviewer of reviewers) await database.execute(sql`select public.enqueue_admission_notification(${obligation.id},${reviewer.user_id},${ADMISSION_NOTIFICATION_AUDIENCE.reviewer})`);
      } else await database.execute(sql`select public.enqueue_admission_notification(${obligation.id},${obligation.applicantUserId},${ADMISSION_NOTIFICATION_AUDIENCE.applicant})`);
    },
  };
}
