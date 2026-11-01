/** @vitest-environment node */
/** Exercises, on a real ledger, how every write is rejected when the platform cannot protect its original intent. @module admission-operation-platform-security-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { createAdmissionPlatformSecurityReader } from "@/src/modules/academy-admissions/infrastructure/composition/admission-platform-security";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { createUnenrolledSecurityConfig } from "@/tests/support/admission-unenrolled-security-config";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

const resultSchema = z.strictObject({ changed: z.literal(true) });
const SQL_SCENARIO_TIMEOUT_MS = 240_000;

/** @param database - This run's owned branch. @returns A leader in a tribe and a ledger factory for any hosting security snapshot. */
async function prepareLedger(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareContactVerificationDatabase(database), tribeId = randomUUID();
  await database.withContext(fixture.own, async (transaction) => {
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic platform security tribe',${`platform-${tribeId}`},${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},'leader','active')`);
  });
  let effects = 0;
  const ledger = (readSecurityConfig: () => Promise<MessagingSecurityConfig>) => new PostgresAdmissionOperationRepository((run) => database.withContext(fixture.own, run), async () => true, readSecurityConfig);
  // Messaging owners prove their authority with the hosting security inside the guard, before the ledger looks up the original.
  const securityGuardedLedger = (readSecurityConfig: () => Promise<MessagingSecurityConfig>) => new PostgresAdmissionOperationRepository((run) => database.withContext(fixture.own, run), async () => { await readSecurityConfig(); return true; }, readSecurityConfig);
  const command = (operationId = randomUUID()) => ({ actorUserId: fixture.userId, tribeId, operationType: "update_allowlist_entry", idempotencyKey: operationId, intent: { synthetic: true } });
  const mutate = async () => { effects += 1; return { changed: true as const }; };
  const rows = async () => (await database.withContext(fixture.own, (transaction) => transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_operations where tribe_id=${tribeId}`))).rows[0].count;
  return { fixture, ledger, securityGuardedLedger, command, mutate, rows, effectCount: () => effects };
}

describe.skipIf(process.env.ACADEMY_ADMISSION_SQL_TESTS !== "1")("admission ledger without usable platform security", () => {
  it("should reject a new original definitively before registering it, for missing, unenrolled and locked security", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await prepareLedger(database);
      const unenrolled = await createUnenrolledSecurityConfig(data.fixture.config), locked = { ...data.fixture.config, recoveryLocked: true };
      for (const readSecurityConfig of [() => readMessagingHostingSecurityConfig({}), async () => unenrolled, async () => locked]) {
        await expect(data.ledger(readSecurityConfig).run(data.command(), resultSchema, data.mutate)).rejects.toMatchObject({ code: "platform_security_unavailable", operationId: undefined, cause: { name: "MessagingCryptographyError" } });
      }
      expect(await data.rows()).toBe(0);
      expect(data.effectCount()).toBe(0);
    });
  }, SQL_SCENARIO_TIMEOUT_MS);

  it("should keep an already registered original unresolved, so the browser keeps it to recover once the security is back", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await prepareLedger(database), operationId = randomUUID();
      expect(await data.ledger(async () => data.fixture.config).run(data.command(operationId), resultSchema, data.mutate)).toMatchObject({ state: "completed", replayed: false });
      const unconfigured = data.ledger(() => readMessagingHostingSecurityConfig({}));
      await expect(unconfigured.run(data.command(operationId), resultSchema, data.mutate)).rejects.toMatchObject({ code: "operation_unresolved", operationId });
      await expect(unconfigured.read(data.command(operationId), resultSchema)).rejects.toMatchObject({ code: "operation_unresolved", operationId });
      expect(await data.ledger(async () => data.fixture.config).run(data.command(operationId), resultSchema, data.mutate)).toMatchObject({ state: "completed", replayed: true });
      expect(data.effectCount()).toBe(1);
    });
  }, SQL_SCENARIO_TIMEOUT_MS);

  it("should apply the same rule when the owner guard itself reads the hosting security before the original is looked up", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await prepareLedger(database), operationId = randomUUID();
      expect(await data.securityGuardedLedger(async () => data.fixture.config).run(data.command(operationId), resultSchema, data.mutate)).toMatchObject({ state: "completed", replayed: false });
      const unconfigured = data.securityGuardedLedger(() => readMessagingHostingSecurityConfig({}));
      await expect(unconfigured.read(data.command(operationId), resultSchema)).rejects.toMatchObject({ code: "operation_unresolved", operationId, cause: { name: "MessagingCryptographyError" } });
      await expect(unconfigured.run(data.command(operationId), resultSchema, data.mutate)).rejects.toMatchObject({ code: "operation_unresolved", operationId });
      await expect(unconfigured.read(data.command(), resultSchema)).rejects.toMatchObject({ code: "platform_security_unavailable", operationId: undefined });
      await expect(unconfigured.run(data.command(), resultSchema, data.mutate)).rejects.toMatchObject({ code: "platform_security_unavailable", operationId: undefined });
      expect(await data.rows()).toBe(1);
      expect(data.effectCount()).toBe(1);
    });
  }, SQL_SCENARIO_TIMEOUT_MS);

  it("should name the same platform requirement on a read, with the checks the claim runs", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await prepareLedger(database);
      const read = (readSecurityConfig: () => Promise<MessagingSecurityConfig>) => database.withContext(data.fixture.own, (transaction: RequestDatabase) => createAdmissionPlatformSecurityReader(readSecurityConfig)(transaction));
      expect(await read(async () => data.fixture.config)).toBeNull();
      expect(await read(() => readMessagingHostingSecurityConfig({}))).toBe("security_unconfigured");
      expect(await read(async () => createUnenrolledSecurityConfig(data.fixture.config))).toBe("security_unconfigured");
      expect(await read(async () => ({ ...data.fixture.config, recoveryLocked: true }))).toBe("recovery_locked");
    });
  }, SQL_SCENARIO_TIMEOUT_MS);
});
