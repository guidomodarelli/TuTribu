/** Reads current policy impact and explicitly composed preparation under leader query authority. @module postgres-admission-policy-view-facts-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import type { AdmissionPolicy } from "../../domain/entities/admission-policy";
import type { AdmissionPolicyViewFactsReader, AdmissionPolicyViewFacts, AdmissionPolicyPreparationReader } from "../../domain/repositories/admission-policy-management";
import { authorizeAdmissionPolicy } from "./postgres-admission-policy-authorizer";
import { readAdmissionPolicy } from "./postgres-admission-policy-storage";
import { ADMISSION_REQUEST_STATUS } from "../../constants/admission-request";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";

/** Basic configuration reads do not require secrets or an unimplemented preparation owner. */
export class PostgresAdmissionPolicyViewFactsReader implements AdmissionPolicyViewFactsReader {
  /**
   * @param execute - Actual native actor transaction.
   * @param composePreparation - Explicit evaluator or null; null is publicly represented as not evaluated.
   * @param readPlatformSecurity - Runs, inside the authorized read transaction, the same hosting security checks the admission ledger runs
   * before signing (import and enrolled proofs), without exposing keys; null when writes can be protected.
   */
  constructor(private readonly execute: <Result>(context: AuthorizedAdmissionContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>, private readonly composePreparation: ((database: RequestDatabase, context: AuthorizedAdmissionContext) => AdmissionPolicyPreparationReader) | null, private readonly readPlatformSecurity: (database: RequestDatabase) => Promise<PlatformSecurityRequirement | null>) {}

  /** @param context - Current leader query scope. @param policy - Policy snapshot whose version must remain current. @returns Minimal current impact and actual preparation, with no initialization or provider call. */
  async read(context: AuthorizedAdmissionContext, policy: AdmissionPolicy | null): Promise<AdmissionPolicyViewFacts> {
    return this.execute(context, async (database) => {
      await authorizeAdmissionPolicy(database, context);
      const platformSecurity = await this.readPlatformSecurity(database);
      const current = await readAdmissionPolicy(database, context.tribeId, false);
      if (current?.version !== policy?.version) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
      const pendingRequestCount = (await database.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${context.tribeId} and status=${ADMISSION_REQUEST_STATUS.pending}`)).rows[0].count;
      // The same SQL predicate the activation writer uses; it is only counted while the first activation is pending.
      const conversion = (await database.execute<{ count: number | null }>(sql`select case when tribe.admissions_control_activated_at is null then (select count(*)::int from public.tribe_members member where member.tribe_id=tribe.id and public.commercial_membership_converts_on_activation(member)) end as count from public.tribes tribe where tribe.id=${context.tribeId}`)).rows[0];
      // The preparation reads that same security; without it nothing can be evaluated, and the read reports the platform requirement instead.
      const preparation = current && this.composePreparation && !platformSecurity ? await this.composePreparation(database, context).read(current) : null;
      await authorizeAdmissionPolicy(database, context);
      return { pendingRequestCount, preparation, platformSecurity, ...(typeof conversion?.count === "number" ? { freeConversionMemberCount: conversion.count } : {}) };
    });
  }
}
