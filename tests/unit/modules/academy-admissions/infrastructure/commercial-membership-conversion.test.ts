/** @vitest-environment node */
/** Exercises how the first activation classifies the guards of the commercial membership conversion. @module commercial-membership-conversion-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { convertCommercialMembershipsOnActivation } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-commercial-membership-conversion";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import { POSTGRES_ERROR_CODE } from "@/src/modules/shared/infrastructure/database/postgres-error";

/** Driver-shaped failure: the SQLSTATE travels on the error the query client wraps. */
class SyntheticDriverError extends Error { constructor(readonly code: string) { super("Synthetic conversion guard"); } }

/** @param failure - What the conversion statement throws, or null when it converts one membership. @returns The activation transaction edge the conversion uses. */
function database(failure: Error | null): RequestDatabase {
  const execute = async () => { if (failure) throw new Error("Failed query", { cause: failure }); return { rows: [{ converted: 1 }] }; };
  return { execute } as unknown as RequestDatabase;
}

const context = { userId: randomUUID(), sessionId: randomUUID(), tribeId: randomUUID() } as AuthorizedAdmissionContext;

describe("commercial membership conversion on the first activation", () => {
  it("should report the converted memberships", async () => {
    await expect(convertCommercialMembershipsOnActivation(database(null), context, randomUUID())).resolves.toBe(1);
  });

  it.each([
    { sqlState: POSTGRES_ERROR_CODE.insufficientPrivilege, code: "permission_denied" },
    { sqlState: POSTGRES_ERROR_CODE.checkViolation, code: "policy_conflict" },
  ])("should turn the $sqlState guard into a definitive $code that keeps the SQL error as cause", async ({ sqlState, code }) => {
    const rejection = convertCommercialMembershipsOnActivation(database(new SyntheticDriverError(sqlState)), context, randomUUID());
    await expect(rejection).rejects.toMatchObject({ name: "AdmissionOperationError", code, cause: { cause: { code: sqlState } } });
  });

  it("should leave any other failure unchanged for the ledger to report as unresolved", async () => {
    const failure = new SyntheticDriverError("40P01");
    await expect(convertCommercialMembershipsOnActivation(database(failure), context, randomUUID())).rejects.toMatchObject({ message: "Failed query", cause: failure });
  });
});
