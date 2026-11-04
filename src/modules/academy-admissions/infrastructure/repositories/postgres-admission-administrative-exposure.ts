/** Records a fixed read extent in the original authorized transaction, never its private result. @module postgres-admission-administrative-exposure */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionAdministrativeExposure } from "../../domain/entities/admission-administrative-exposure";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_ADMINISTRATIVE_SURFACE } from "../../constants/admission-administrative-exposure";

/** @param database - Current guarded transaction. @param scope - Actual account and session. @returns Whether that session is still live for the bound account. */
export async function readLiveAdmissionSession(database: RequestDatabase, scope: Pick<AdmissionCommandScope, "userId" | "sessionId">): Promise<boolean> {
  return (await database.execute(sql`select id from public.session where id=${scope.sessionId} and "userId"=${scope.userId} and "userId"=public.current_app_user_id() and "expiresAt">clock_timestamp()`)).rows.length > 0;
}

/**
 * The SQL refuses the exposure of one request when its version moved after the read (READ COMMITTED takes a new snapshot per
 * statement): a proof attached or an expiry committed in between. Reading the version again with the reviewer read itself tells
 * that race apart from a lost authority.
 * @param database - Current guarded transaction (the refusal returned false, so it is still usable).
 * @param scope - Actual account/session/tribe.
 * @param exposure - The refused exposure.
 * @returns Whether the request still exists for this reviewer with another version.
 */
async function requestVersionMoved(database: RequestDatabase, scope: Pick<AdmissionCommandScope, "sessionId" | "tribeId">, exposure: AdmissionAdministrativeExposure): Promise<boolean> {
  if (exposure.surface !== ADMISSION_ADMINISTRATIVE_SURFACE.reviews || exposure.resourceVersion === null || exposure.resourceId === scope.tribeId) return false;
  const row = (await database.execute<{ version: number | null }>(sql`select (record->'request'->>'version')::integer as version from public.read_admission_reviews(${scope.tribeId},${scope.sessionId},${exposure.resourceId},1)`)).rows[0];
  return typeof row?.version === "number" && row.version !== exposure.resourceVersion;
}

/**
 * @param database - Existing native read transaction after mapping and own DTO validation. @param scope - Actual account/session/tribe. @param exposure - Returned resource/version and selected count only.
 * @returns After SQL confirms current authority and the fixed audit fact; failures roll back with the read.
 * @throws AdmissionOperationError `authentication_required` when the session ended, `request_conflict` when the request changed during
 * the read (reading again shows it), and `permission_denied` otherwise.
 */
export async function recordAdmissionAdministrativeExposure(database: RequestDatabase, scope: Pick<AdmissionCommandScope, "userId" | "sessionId" | "tribeId">, exposure: AdmissionAdministrativeExposure): Promise<void> {
  const result = (await database.execute<{ recorded: boolean }>(sql`select public.record_academy_admission_administrative_exposure(${scope.tribeId},${scope.sessionId},${exposure.surface},${exposure.resourceId},${exposure.resourceVersion},${exposure.itemCount}) as recorded where public.current_app_user_id()=${scope.userId}`)).rows[0];
  if (result?.recorded) return;
  if (!await readLiveAdmissionSession(database, scope)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  if (await requestVersionMoved(database, scope, exposure)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
  throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
}
