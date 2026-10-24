/** @vitest-environment node */
/** Exercises both real tribe DELETE orders against private rotation and observes native waits. @module messaging-protection-key-rotation-deletion-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import type { AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingProtectionKeyRotation } from "@/tests/support/messaging-protection-key-rotation-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { buildMessagingProtectionKeyRotationModule } from "@/src/modules/messaging/setup";
import { projectMessagingProtectionKeyState } from "@/src/modules/messaging/infrastructure/config/messaging-protection-key-state";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** @param database - Owned branch with three simultaneous transactions. @param waiter - Actual DELETE backend. @param holder - Rotation backend. @returns Only after PostgreSQL proves the exact native wait. */
async function observeDeleteWait(database: AcademyAdmissionTestDatabase, waiter: number, holder: number): Promise<void> {
  await database.withContext({ userId: null, email: null }, async (transaction) => {
    await transaction.execute(sql`set local statement_timeout='10s'`);
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await transaction.execute(sql`select pg_stat_clear_snapshot()`);
      const current = (await transaction.execute<{ waiting: boolean }>(sql`select exists(select 1 from pg_stat_activity where pid=${waiter} and wait_event_type='Lock' and ${holder}=any(pg_blocking_pids(pid))) as waiting`)).rows[0];
      if (current.waiting) return;
      await transaction.execute(sql`select pg_sleep(0.05)`);
    }
    throw new Error("Protection rotation DELETE observation failed: native_wait_unproven");
  });
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native protection rotation and tribe deletion", () => {
  for (const firstOwner of ["tribe", "rotation"] as const) {
    it(`should settle a real DELETE without deadlock when ${firstOwner} acquires its parent first`, async () => {
      await withAcademyAdmissionDatabase(async (database) => {
        const fixture = await prepareMessagingProtectionKeyRotation(database), backend = { userId: null, email: null };
        const target = await database.withContext(backend, async (transaction) => (await transaction.execute<{ tribe_id: string }>(sql`select envelope.tribe_id from public.messaging_secret_envelopes envelope where public.messaging_secret_rotation_scope_is_current(envelope.secret_ref,envelope.tribe_id,envelope.connection_id,envelope.connection_version,${fixture.rotated.environment},${fixture.rotated.securityEpoch},envelope.key_id) order by envelope.tribe_id,envelope.secret_ref limit 1`)).rows[0]);
        let rotationPid = 0, deletionPid = 0, announceDelete!: () => void, rejectDelete!: (error: unknown) => void, releaseDelete!: () => void;
        let announceRotation!: () => void, rejectRotation!: (error: unknown) => void, releaseRotation!: () => void, announced = false;
        const deletionReady = new Promise<void>((resolve, reject) => { announceDelete = resolve; rejectDelete = reject; });
        const deletionReleased = new Promise<void>((resolve) => { releaseDelete = resolve; });
        const rotationReady = new Promise<void>((resolve, reject) => { announceRotation = resolve; rejectRotation = reject; });
        const rotationReleased = new Promise<void>((resolve) => { releaseRotation = resolve; });
        /** @returns A real DELETE whose parent lock order is chosen by the scenario. */
        const deleteTribe = () => database.withContext(backend, async (transaction) => {
          deletionPid = (await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid;
          if (firstOwner === "tribe") await transaction.execute(sql`select id from public.tribes where id=${target.tribe_id} for update`);
          announceDelete();
          await deletionReleased;
          await transaction.execute(sql`delete from public.tribes where id=${target.tribe_id}`);
        });
        const rotate = () => buildMessagingProtectionKeyRotationModule({
          execute: <Result>(run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(backend, async (transaction) => {
            rotationPid = (await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid;
            return run(transaction);
          }),
          authorize: async () => true, readRecoveryLock: async () => false,
          readKeyState: async () => projectMessagingProtectionKeyState(fixture.rotated),
          readSecurityConfig: async () => {
            if (!announced) {
              announced = true; announceRotation();
              if (firstOwner === "tribe") { releaseDelete(); await observeDeleteWait(database, deletionPid, rotationPid); }
              else await rotationReleased;
            }
            return fixture.rotated;
          },
        }).useCases.rotateProtectionKeys.execute({ limit: 1 });
        let deletion: Promise<void> | undefined, rotation: ReturnType<typeof rotate> | undefined;
        try {
          if (firstOwner === "tribe") { deletion = deleteTribe(); void deletion.catch(rejectDelete); await deletionReady; }
          rotation = rotate(); void rotation.catch(rejectRotation); await rotationReady;
          if (firstOwner === "rotation") {
            deletion = deleteTribe(); void deletion.catch(rejectDelete); await deletionReady; releaseDelete();
            await observeDeleteWait(database, deletionPid, rotationPid); releaseRotation();
          }
          const result = await rotation;
          expect(result).toEqual({ rotatedCredentials: firstOwner === "tribe" ? 0 : 1, remainingCredentials: true, pendingOtpMaterial: true });
          await deletion;
          await database.withContext(backend, async (transaction) => {
            expect((await transaction.execute(sql`select id from public.tribes where id=${target.tribe_id}`)).rows).toHaveLength(0);
            const remaining = (await transaction.execute<{ material: boolean }>(sql`select iv is not null or ciphertext is not null as material from public.messaging_secret_envelopes where tribe_id=${target.tribe_id}`)).rows;
            expect(remaining.length).toBeGreaterThan(0); expect(remaining.every((envelope) => !envelope.material)).toBe(true);
          });
        } finally {
          releaseDelete(); releaseRotation();
          await Promise.allSettled([...(rotation ? [rotation] : []), ...(deletion ? [deletion] : [])]);
        }
      }, { concurrentTransactions: 3 });
    }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
  }
});
