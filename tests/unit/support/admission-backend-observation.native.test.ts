/** @vitest-environment node */
/** Observes real scoped backend states and lock waits without query text or identities. */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { readAdmissionBackendSnapshot, startAdmissionBackendObservation } from "@/tests/support/admission-backend-observation";
import { ADMISSION_BACKEND_OBSERVATION as SETTINGS } from "@/tests/support/constants/admission-backend-observation";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native backend observation", () => {
  it("should distinguish only its application's physical backends and advisory wait, then drain its sampler", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const applicationName = randomUUID(), unrelatedName = randomUUID(), lockName = randomUUID();
      await database.withServerEnvironment(async (environment) => {
        const pool = new Pool({ connectionString: environment.DATABASE_URL, max: SETTINGS.nativeConnections });
        const holder = await pool.connect(), waiter = await pool.connect(), unrelated = await pool.connect();
        let waiting: Promise<unknown> | undefined;
        let observer: ReturnType<typeof startAdmissionBackendObservation> | undefined;
        try {
          await unrelated.query("begin");
          await unrelated.query("select set_config('application_name',$1,true)", [unrelatedName]);
          expect((await readAdmissionBackendSnapshot(database, applicationName)).backends).toBe(0);
          await holder.query("begin");
          await holder.query("select set_config('application_name',$1,true)", [applicationName]);
          await holder.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [lockName]);
          await waiter.query("begin");
          await waiter.query("select set_config('application_name',$1,true)", [applicationName]);
          waiting = waiter.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [lockName]);
          observer = startAdmissionBackendObservation(database, applicationName);
          for (let attempt = 0; attempt < SETTINGS.nativePollAttempts && !observer.latest()?.waitClasses.Lock; attempt += 1) await delay(SETTINGS.nativePollMs);
          const contended = observer.latest();
          expect(contended?.backends).toBe(2);
          expect(contended?.states.active).toBe(1);
          expect(contended?.states["idle in transaction"]).toBe(1);
          expect(contended?.waitClasses.Lock).toBe(1);
          expect(contended?.waitEvents.advisory).toBe(1);
          const observed = await observer.stop();
          expect(observed.samples.length).toBeGreaterThan(0);
          expect(observed.errors).toEqual([]);
          expect(observed.samples.every((sample) => sample.backends <= 2)).toBe(true);
          await holder.query("rollback");
          await waiting;
          await waiter.query("rollback");
          expect((await readAdmissionBackendSnapshot(database, applicationName)).backends).toBe(0);
        } finally {
          await observer?.stop();
          await holder.query("rollback");
          await waiting;
          await waiter.query("rollback");
          await unrelated.query("rollback");
          holder.release(); waiter.release(); unrelated.release();
          await pool.end();
        }
      });
    });
  }, SETTINGS.nativeTestTimeoutMs);
});
