/** Stages admission obligations and minimal internal notices in the caller's original transaction. @module admission-notification-obligation-writer */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionNotificationObligationWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import { ADMISSION_NOTIFICATION_AUDIENCE } from "@/src/modules/notifications/constants/admission-notifications";
import { resolveAdmissionNotificationAudience } from "../../domain/policies/admission-notification-audience";

/**
 * Composes only DB effects; the admission owner retains actor/request authorization and shared locks.
 * @param database - Existing guarded business transaction; never a nested checkout or outbound transport.
 * @returns A scoped obligation writer with current reviewer selection and protected SQL materialization.
 */
export function createPostgresAdmissionNotificationObligationWriter(database: RequestDatabase): AdmissionNotificationObligationWriter {
  const writer: AdmissionNotificationObligationWriter = {
    /** @param obligation - Original admission event/tenant/account identities, including a time-driven reminder. @returns After all current-audience notices are staged, before the caller commits. */
    async record(obligation) {
      const audience = resolveAdmissionNotificationAudience(obligation.event);
      await database.execute(sql`select public.stage_admission_notification_obligation(${obligation.id},${obligation.tribeId},${obligation.admissionRequestId},${obligation.applicantUserId},${obligation.event},${audience},${obligation.operationId ?? null})`);
    },
    /** @param obligations - Own facts staged by a single business transaction. @returns After current reviewer materialization and bulk applicant inserts are staged in this same transaction. */
    async recordMany(obligations) {
      for (const obligation of obligations) if (resolveAdmissionNotificationAudience(obligation.event) === ADMISSION_NOTIFICATION_AUDIENCE.reviewer) await writer.record(obligation);
      const applicants = obligations.filter((obligation) => resolveAdmissionNotificationAudience(obligation.event) === ADMISSION_NOTIFICATION_AUDIENCE.applicant).map((obligation) => ({ id: obligation.id, tribe_id: obligation.tribeId, request_id: obligation.admissionRequestId, applicant_user_id: obligation.applicantUserId, event_type: obligation.event, operation_id: obligation.operationId ?? null }));
      if (applicants.length === 0) return;
      const payload = JSON.stringify(applicants);
      await database.execute(sql`select public.create_admission_notification_obligation(obligation.id,obligation.tribe_id,obligation.request_id,obligation.applicant_user_id,obligation.event_type,obligation.operation_id) from jsonb_to_recordset(${payload}::jsonb) as obligation(id uuid,tribe_id uuid,request_id uuid,applicant_user_id text,event_type text,operation_id uuid) order by obligation.id`);
      await database.execute(sql`select public.enqueue_admission_notification(obligation.id,obligation.applicant_user_id,${ADMISSION_NOTIFICATION_AUDIENCE.applicant}) from jsonb_to_recordset(${payload}::jsonb) as obligation(id uuid,applicant_user_id text) order by obligation.id`);
    },
  };
  return writer;
}
