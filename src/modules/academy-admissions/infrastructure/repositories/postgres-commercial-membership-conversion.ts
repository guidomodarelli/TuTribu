/** Converts commercial memberships into free active members inside the first admission activation. @module postgres-commercial-membership-conversion */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";

/**
 * Calls the tribes-owned SQL function that converts and audits every eligible commercial membership.
 * It must run before the activation marker is set: the membership-source guard still sees an unprotected tribe.
 * @param database - Original activation transaction holding the leader and policy locks.
 * @param context - Current leader scope of the activation.
 * @param ledgerId - Activation ledger operation; every audit row is keyed by it.
 * @returns How many memberships became free active members.
 */
export async function convertCommercialMembershipsOnActivation(database: RequestDatabase, context: AuthorizedAdmissionContext, ledgerId: string): Promise<number> {
  const row = (await database.execute<{ converted: number }>(sql`select public.convert_commercial_memberships_on_admission_activation(${context.tribeId},${context.sessionId},${ledgerId}) as converted`)).rows[0];
  return row.converted;
}
