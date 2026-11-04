/** Converts commercial memberships into free active members inside the first admission activation. @module postgres-commercial-membership-conversion */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { POSTGRES_ERROR_CODE, readPostgresErrorCode } from "@/src/modules/shared/infrastructure/database/postgres-error";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/**
 * Classifies the guards the conversion function raises, so the activation reports a definitive outcome instead of an unresolved one.
 * @param error - Failure of the conversion statement.
 * @returns The typed activation rejection carrying the SQL error as cause, or the same error when it is not one of the guards.
 */
function classifyConversionFailure(error: unknown): unknown {
  const code = readPostgresErrorCode(error);
  // The function refuses an actor that is no longer the canonical leader or session of the activation.
  if (code === POSTGRES_ERROR_CODE.insufficientPrivilege) return new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied, { cause: error });
  // The tribe was already activated, or stopped being an academy, while this activation waited: the current configuration changed.
  if (code === POSTGRES_ERROR_CODE.checkViolation) return new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict, { cause: error });
  return error;
}

/**
 * Calls the tribes-owned SQL function that converts and audits every eligible commercial membership.
 * It must run before the activation marker is set: the membership-source guard still sees an unprotected tribe.
 * @param database - Original activation transaction holding the leader and policy locks.
 * @param context - Current leader scope of the activation.
 * @param ledgerId - Activation ledger operation; every audit row is keyed by it.
 * @returns How many memberships became free active members.
 * @throws AdmissionOperationError permission_denied or policy_conflict, with the SQL error as cause, when a conversion guard rejects
 * the activation; any other failure unchanged.
 */
export async function convertCommercialMembershipsOnActivation(database: RequestDatabase, context: AuthorizedAdmissionContext, ledgerId: string): Promise<number> {
  try {
    const row = (await database.execute<{ converted: number }>(sql`select public.convert_commercial_memberships_on_admission_activation(${context.tribeId},${context.sessionId},${ledgerId}) as converted`)).rows[0];
    return row.converted;
  } catch (error) {
    throw classifyConversionFailure(error);
  }
}
