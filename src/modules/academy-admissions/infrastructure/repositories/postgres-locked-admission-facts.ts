/** Reads ordered native facts without caching authority or moving eligibility into SQL. */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionPolicy } from "../../domain/entities/admission-policy";
import type { AdmissionMembershipFacts } from "../../domain/policies/admission-eligibility";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { mapStoredAdmissionPolicy, type StoredAdmissionPolicy } from "./postgres-admission-policy-storage";

/** Contains only fields already consumed by the authorized request writer. */
export type LockedAdmissionFacts = {
  tribe: { activatedAt: string | null; accessModel: string; admissionEnabled: boolean } | null;
  policy: AdmissionPolicy | null;
  membership: AdmissionMembershipFacts | null;
  account: { email: string } | null;
};

/** Native JSON timestamps remain input to the infrastructure mapper, never a PostgreSQL schema check. */
type LockedAdmissionFactsRow = Omit<LockedAdmissionFacts, "policy"> & {
  policy: StoredAdmissionPolicy | null;
};

/**
 * Retains settings → policy → membership → account locks in the caller's original transaction.
 * @param database - Existing actor-authorized transaction retaining its tribe/applicant fence.
 * @param tribeId - Exact server-authorized academy.
 * @param applicantId - Own or explicitly reviewed applicant, selected by the original writer.
 * @returns Current facts; security configuration and the subsequent clock stay with the caller.
 */
export async function readLockedAdmissionFacts(database: RequestDatabase, tribeId: string, applicantId: string): Promise<LockedAdmissionFacts> {
  const row = (await database.execute<LockedAdmissionFactsRow>(sql`select * from public.read_locked_admission_facts(${tribeId},${applicantId})`)).rows[0];
  if (!row) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  return { ...row, policy: row.policy ? mapStoredAdmissionPolicy(row.policy) : null };
}
