/** Binds policy authorization to the shared native leader/session/recency guard. @module postgres-admission-policy-authorizer */
import "server-only";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import type { ReauthenticationOperation } from "@/src/modules/auth/constants/reauthentication-resources";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { authorizeAdmissionLeader, admissionDatabaseNow } from "./postgres-admission-leader-authorizer";

/** Keeps the policy clock API while sampling the original database transaction after waits. */
export const admissionPolicyDatabaseNow = admissionDatabaseNow;

/** @param database - Original guarded transaction. @param context - Private current policy scope. @param operation - Exact server-selected policy mutation purpose or read-only absence. @returns Nothing while canonical leadership, session and policy recency remain valid. */
export async function authorizeAdmissionPolicy(database: RequestDatabase, context: AuthorizedAdmissionContext, operation?: ReauthenticationOperation): Promise<void> {
  await authorizeAdmissionLeader(database, context, { action: operation ? ADMISSION_ACTION.configurePolicy : ADMISSION_ACTION.readPolicy, resourceId: context.tribeId, operation });
}
