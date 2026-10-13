/** @vitest-environment node */
/** Exercises request-local identity reuse with fresh real SQL projection and session revocation. @module request-account-provider-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { createRequestAccountProvider } from "@/src/modules/auth/infrastructure/composition/request-account-provider";

describe("request account identity isolation", () => {
  it("should coalesce concurrent identity reads and keep a failed lookup closed within its request", async () => {
    let identityReads = 0, databaseReads = 0;
    const identityFailure = new Error("Request identity lookup unavailable");
    const provider = createRequestAccountProvider(async () => { identityReads += 1; throw identityFailure; }, async () => {
      databaseReads += 1;
      throw new Error("Database projection must not run without request identity");
    });
    const outcomes = await Promise.allSettled([provider.getAuthenticatedAccount(), provider.getAuthenticatedAccount()]);
    expect(outcomes.every((outcome) => outcome.status === "rejected" && outcome.reason === identityFailure)).toBe(true);
    await expect(provider.getAuthenticatedAccount()).rejects.toBe(identityFailure);
    expect(identityReads).toBe(1);
    expect(databaseReads).toBe(0);
    const nextRequest = createRequestAccountProvider(async () => { identityReads += 1; return null; }, async () => {
      databaseReads += 1;
      throw new Error("Database projection must not run without request identity");
    });
    expect(await nextRequest.getAuthenticatedAccount()).toBeNull();
    expect(identityReads).toBe(2);
    expect(databaseReads).toBe(0);
  });
});

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native request account provider", () => {
  it("should read cookie identity once but recheck SQL and reject a revoked session in the same request", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      let cookieReads = 0, databaseReads = 0;
      const provider = createRequestAccountProvider(async () => { cookieReads += 1; return { userId: fixture.userId, sessionId: fixture.sessionId }; }, (identity, run) => {
        databaseReads += 1;
        return database.withContext({ userId: identity.userId, email: null }, run);
      });
      const first = await provider.getAuthenticatedAccount();
      expect(first?.userId === fixture.userId && first.session.id === fixture.sessionId).toBe(true);
      expect((await provider.getAuthenticatedAccount())?.userId === fixture.userId).toBe(true);
      expect(cookieReads).toBe(1);
      expect(databaseReads).toBe(2);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.session where id=${fixture.sessionId} and "userId"=${fixture.userId}`));
      expect(await provider.getAuthenticatedAccount()).toBeNull();
      expect(cookieReads).toBe(1);
      expect(databaseReads).toBe(3);
      const anotherRequest = createRequestAccountProvider(async () => { cookieReads += 1; return null; }, (identity, run) => database.withContext({ userId: identity.userId, email: null }, run));
      expect(await anotherRequest.getAuthenticatedAccount()).toBeNull();
      expect(cookieReads).toBe(2);
    });
  }, 1_200_000);
});
