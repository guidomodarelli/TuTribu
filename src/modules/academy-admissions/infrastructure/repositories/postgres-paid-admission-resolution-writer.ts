/** Executes the protected paid-source resolution inside the caller's existing transaction. @module postgres-paid-admission-resolution-writer */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionExternalResolutionWriter, PaidAdmissionResolutionScope } from "../../domain/repositories/admission-external-resolution-writer";

/** Keeps SQL privilege and source/clock revalidation in the owning protected writer. */
export class PostgresPaidAdmissionResolutionWriter implements AdmissionExternalResolutionWriter {
  /** @param database - Original guarded subscription transaction; never a second checkout. */
  constructor(private readonly database: RequestDatabase) {}

  /** @param scope - Actual consumed paid receipt and exact stored tenant/account. @returns After system decision, request, audit and notice are staged; SQL failure rolls back the owner transaction. */
  async resolvePaidMembership(scope: PaidAdmissionResolutionScope): Promise<void> {
    await this.database.execute(sql`select public.resolve_paid_admission_request(${scope.membershipEffectId},${scope.tribeId},${scope.userId})`);
  }
}
