/** Locks the administrative reader of one tribe and checks its current live permission inside the reading transaction. @module authorize-admission-administrative-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { canPerformAdmissionAction, type AdmissionAction } from "../../domain/policies/admission-eligibility";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { PostgresAdmissionAuthorizationReader } from "./postgres-admission-authorization-reader";

/**
 * @param database - Current guarded transaction.
 * @param scope - Actual account/session/tribe.
 * @param action - Administrative read the actor must still be allowed to perform.
 * @returns After the native lock and the live permission check.
 * @throws AdmissionOperationError when the lock or the actor is missing, or the action is no longer allowed.
 */
export async function authorizeAdmissionAdministrativeReader(database: RequestDatabase, scope: AdmissionCommandScope, action: AdmissionAction): Promise<void> {
  const locked = (await database.execute<{ locked: boolean }>(sql`select public.lock_academy_admission_administrative_reader(${scope.tribeId},${scope.sessionId}) as locked where public.current_app_user_id()=${scope.userId}`)).rows[0]?.locked;
  if (!locked) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  const actor = await new PostgresAdmissionAuthorizationReader(database, scope.sessionId, action).getCurrentActor(scope.tribeId, scope.userId);
  if (!actor) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  if (!canPerformAdmissionAction(actor, action, { tribeId: scope.tribeId })) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
}
