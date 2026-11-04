/** @vitest-environment node */
/** Exercises, on a real ledger, that an original whose effect stopped can be resent at once instead of staying `started`. @module admission-operation-lease-release-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

const resultSchema = z.strictObject({ changed: z.literal(true) });
const chunkSchema = z.strictObject({ blocks: z.int().positive() });
const SQL_SCENARIO_TIMEOUT_MS = 240_000;
/** Blocks the chunked original needs before it completes. */
const CHUNK_BLOCKS = 3;

/** @param database - This run's owned branch. @returns A leader in a tribe, a real ledger and readers of its own rows. */
async function prepareLedger(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareContactVerificationDatabase(database), tribeId = randomUUID();
  await database.withContext(fixture.own, async (transaction) => {
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic lease tribe',${`lease-${tribeId}`},${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},'leader','active')`);
  });
  let effects = 0;
  const ledger = new PostgresAdmissionOperationRepository((run) => database.withContext(fixture.own, run), async () => true, async () => fixture.config);
  const command = (operationId = randomUUID()) => ({ actorUserId: fixture.userId, tribeId, operationType: "update_allowlist_entry", idempotencyKey: operationId, intent: { synthetic: true } });
  const mutate = async () => { effects += 1; return { changed: true as const }; };
  /** @param operationId - Original client key. @returns Its state and whether its lease is still live. */
  const lease = async (operationId: string) => (await database.withContext(fixture.own, (transaction) => transaction.execute<{ state: string; live: boolean }>(sql`select state,coalesce(lease_until>clock_timestamp(),false) as live from public.academy_admission_operations where tribe_id=${tribeId} and idempotency_key=${operationId}`))).rows[0];
  return { ledger, command, mutate, lease, effectCount: () => effects };
}

describe.skipIf(process.env.ACADEMY_ADMISSION_SQL_TESTS !== "1")("admission ledger lease release", () => {
  it("should release the lease of a rolled back effect so resending the same original completes it once at once", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await prepareLedger(database), command = data.command();
      await expect(data.ledger.run(command, resultSchema, async () => { throw new Error("Synthetic effect failure"); })).rejects.toMatchObject({ code: "operation_unresolved", operationId: command.idempotencyKey, cause: { message: "Synthetic effect failure" } });
      expect(await data.lease(command.idempotencyKey)).toEqual({ state: "started", live: false });
      expect(await data.ledger.read(command, resultSchema)).toEqual({ state: "started", operationId: command.idempotencyKey });
      expect(await data.ledger.run(command, resultSchema, data.mutate)).toMatchObject({ state: "completed", replayed: false });
      expect(await data.ledger.run(command, resultSchema, data.mutate)).toMatchObject({ state: "completed", replayed: true });
      expect(data.effectCount()).toBe(1);
    });
  }, SQL_SCENARIO_TIMEOUT_MS);

  it("should release the lease after a definitive business rejection so the same original answers it again", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await prepareLedger(database), command = data.command();
      const reject = async () => { throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict); };
      await expect(data.ledger.run(command, resultSchema, reject)).rejects.toMatchObject({ code: "policy_conflict" });
      expect(await data.lease(command.idempotencyKey)).toEqual({ state: "started", live: false });
      await expect(data.ledger.run(command, resultSchema, reject)).rejects.toMatchObject({ code: "policy_conflict" });
    });
  }, SQL_SCENARIO_TIMEOUT_MS);

  it("should keep the live lease of an effect that is still running", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await prepareLedger(database), command = data.command();
      let finish: () => void = () => undefined, announce: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => { finish = resolve; }), running = new Promise<void>((resolve) => { announce = resolve; });
      const first = data.ledger.run(command, resultSchema, async () => { announce(); await finished; return data.mutate(); });
      await running;
      // The unlocked registry read, like the recovery reader, sees the running effect's live lease.
      expect(await data.lease(command.idempotencyKey)).toEqual({ state: "started", live: true });
      finish();
      expect(await first).toMatchObject({ state: "completed", replayed: false });
      expect(await data.lease(command.idempotencyKey)).toEqual({ state: "completed", live: false });
      expect(data.effectCount()).toBe(1);
    });
  }, SQL_SCENARIO_TIMEOUT_MS);

  it("should let a chunked original resume its remaining blocks at once after a block rolls back or it runs out of steps", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await prepareLedger(database), command = data.command();
      let committed = 0, failNext = true;
      const block = async (_transaction: RequestDatabase) => {
        if (committed === 1 && failNext) { failNext = false; throw new Error("Synthetic block rollback"); }
        committed += 1;
        return committed === CHUNK_BLOCKS ? { completed: true as const, result: { blocks: committed } } : { completed: false as const };
      };
      await expect(data.ledger.runChunks(command, chunkSchema, CHUNK_BLOCKS, block)).rejects.toMatchObject({ code: "operation_unresolved", operationId: command.idempotencyKey });
      expect(await data.lease(command.idempotencyKey)).toEqual({ state: "started", live: false });
      // One step only: the claim stays registered with blocks left, and nobody keeps it.
      expect(await data.ledger.runChunks(command, chunkSchema, 1, block)).toEqual({ state: "started", operationId: command.idempotencyKey });
      expect(await data.lease(command.idempotencyKey)).toEqual({ state: "started", live: false });
      expect(await data.ledger.runChunks(command, chunkSchema, CHUNK_BLOCKS, block)).toMatchObject({ state: "completed", replayed: false, result: { blocks: CHUNK_BLOCKS } });
    });
  }, SQL_SCENARIO_TIMEOUT_MS);
});
