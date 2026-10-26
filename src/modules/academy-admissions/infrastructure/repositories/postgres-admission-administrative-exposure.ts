/** Records a fixed read extent in the original authorized transaction, never its private result. @module postgres-admission-administrative-exposure */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionAdministrativeExposure } from "../../domain/entities/admission-administrative-exposure";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/** @param database - Existing native read transaction after mapping and own DTO validation. @param scope - Actual account/session/tribe. @param exposure - Returned resource/version and selected count only. @returns After SQL confirms current authority and the fixed audit fact; failures roll back with the read. */
export async function recordAdmissionAdministrativeExposure(database: RequestDatabase, scope: Pick<AdmissionCommandScope, "userId" | "sessionId" | "tribeId">, exposure: AdmissionAdministrativeExposure): Promise<void> {
  const result = (await database.execute<{ recorded: boolean }>(sql`select public.record_academy_admission_administrative_exposure(${scope.tribeId},${scope.sessionId},${exposure.surface},${exposure.resourceId},${exposure.resourceVersion},${exposure.itemCount}) as recorded where public.current_app_user_id()=${scope.userId}`)).rows[0];
  if (!result?.recorded) {
    const currentSession = (await database.execute(sql`select id from public.session where id=${scope.sessionId} and "userId"=${scope.userId} and "userId"=public.current_app_user_id() and "expiresAt">clock_timestamp()`)).rows[0];
    if (!currentSession) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  }
}
