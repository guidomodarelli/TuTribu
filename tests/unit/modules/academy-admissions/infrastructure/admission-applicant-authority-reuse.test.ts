/** @vitest-environment node */
/** Verifies on real PostgreSQL that reused applicant authority keeps every check its row locks cannot freeze and never outlives a savepoint rollback. @module admission-applicant-authority-reuse-tests */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { authorizeAdmissionApplicant, withAdmissionApplicantSavepointSection, withReusedAdmissionApplicantAuthority } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-applicant-authority";
import { readAdmissionControlMarker, readAdmissionPolicy, readLockedAdmissionPolicyGate } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-storage";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { ADMISSION_APPLICANT_AUTHORITY_REUSE_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-applicant-authority-reuse";

/** @param database - Real transaction. @returns The same transaction, counting the statements the guard sends through it. */
function countStatements(database: RequestDatabase): { database: RequestDatabase; count: () => number } {
  let statements = 0;
  const counted = new Proxy(database, { get(target, property, receiver) {
    const value: unknown = Reflect.get(target, property, receiver);
    if (property !== "execute" || typeof value !== "function") return value;
    return (...args: unknown[]) => { statements += 1; return Reflect.apply(value, target, args); };
  } });
  return { database: counted, count: () => statements };
}

/** @param error - Driver failure, possibly wrapped by Drizzle. @returns The first PostgreSQL SQLSTATE in its cause chain. */
function readPostgresCode(error: unknown): string | null {
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 5; current = current.cause, depth += 1) {
    const code: unknown = Reflect.get(current, "code");
    if (typeof code === "string") return code;
  }
  return null;
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native reused admission applicant authority", () => {
  it("should reuse held locks in one statement, keep actor and session checks, and never reuse a check made inside a savepoint", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { context, own } = await prepareAdmissionContactVerification(database);
      /** @returns Null when another transaction can lock the applicant's session, or the SQLSTATE that stopped it. */
      const probeSessionUpdate = () => database.withContext(own, async (other) => { await other.execute(sql`select id from public.session where id=${context.sessionId} for update nowait`); }).then(() => null, (error: unknown) => readPostgresCode(error));

      // Outside a scope every check stays complete.
      const unscoped = await database.withContext(own, async (transaction) => {
        const observed = countStatements(transaction);
        await authorizeAdmissionApplicant(observed.database, context);
        const first = observed.count();
        await authorizeAdmissionApplicant(observed.database, context);
        return { first, second: observed.count() - first };
      });
      expect(unscoped).toEqual({ first: VALIDATION.fullCheckStatements, second: VALIDATION.fullCheckStatements });

      // Inside a scope a repeated check is one statement and returns the same facts.
      const scoped = await database.withContext(own, (transaction) => { const observed = countStatements(transaction); return withReusedAdmissionApplicantAuthority(observed.database, async () => {
        const fullFacts = await authorizeAdmissionApplicant(observed.database, context);
        const full = observed.count();
        const reusedFacts = await authorizeAdmissionApplicant(observed.database, context);
        return { full, reused: observed.count() - full, same: reusedFacts.normalizedEmail === fullFacts.normalizedEmail && reusedFacts.userId === fullFacts.userId };
      }); });
      expect(scoped).toEqual({ full: VALIDATION.fullCheckStatements, reused: 1, same: true });

      // A check made inside a savepoint section is not registered: rolling back to the savepoint releases its locks, so the next check is complete again.
      const insideSavepoint = await database.withContext(own, (transaction) => { const observed = countStatements(transaction); return withReusedAdmissionApplicantAuthority(observed.database, async () => {
        await withAdmissionApplicantSavepointSection(observed.database, async () => {
          await transaction.execute(sql.raw(VALIDATION.savepointSql.begin));
          await authorizeAdmissionApplicant(observed.database, context);
          await transaction.execute(sql.raw(VALIDATION.savepointSql.rollback));
          await transaction.execute(sql.raw(VALIDATION.savepointSql.release));
        });
        const released = await probeSessionUpdate();
        const before = observed.count();
        await authorizeAdmissionApplicant(observed.database, context);
        return { released, after: observed.count() - before };
      }); });
      expect(insideSavepoint).toEqual({ released: null, after: VALIDATION.fullCheckStatements });

      // Authority held before the section survives a rollback to its savepoint: the session stays locked and checks inside and after it are reused.
      const beforeSavepoint = await database.withContext(own, (transaction) => { const observed = countStatements(transaction); return withReusedAdmissionApplicantAuthority(observed.database, async () => {
        await authorizeAdmissionApplicant(observed.database, context);
        const full = observed.count();
        await withAdmissionApplicantSavepointSection(observed.database, async () => {
          await transaction.execute(sql.raw(VALIDATION.savepointSql.begin));
          await authorizeAdmissionApplicant(observed.database, context);
          await transaction.execute(sql.raw(VALIDATION.savepointSql.rollback));
          await transaction.execute(sql.raw(VALIDATION.savepointSql.release));
        });
        const held = await probeSessionUpdate();
        const before = observed.count();
        await authorizeAdmissionApplicant(observed.database, context);
        return { full, held, reusedInside: before - full, reusedAfter: observed.count() - before };
      }); });
      expect(beforeSavepoint).toEqual({ full: VALIDATION.fullCheckStatements, held: VALIDATION.lockNotAvailableCode, reusedInside: 1, reusedAfter: 1 });

      // While the authority is held, another transaction cannot change the account email or the session deadline.
      await database.withContext(own, (transaction) => withReusedAdmissionApplicantAuthority(transaction, async () => {
        await authorizeAdmissionApplicant(transaction, context);
        const blocked = await database.withContext(own, async (other) => { await other.execute(sql`set local lock_timeout=${sql.raw(`'${VALIDATION.concurrentLockTimeoutMs}ms'`)}`); await other.execute(sql`update public."user" set email=email where id=${context.userId}`); }).then(() => null, (error: unknown) => error);
        expect(readPostgresCode(blocked)).toBe(VALIDATION.lockNotAvailableCode);
        await authorizeAdmissionApplicant(transaction, context);
      }));

      // A different transaction actor is still denied by the reused check.
      await expect(database.withContext(own, (transaction) => withReusedAdmissionApplicantAuthority(transaction, async () => {
        await authorizeAdmissionApplicant(transaction, context);
        await transaction.execute(sql`select set_config('app.current_user_id',${randomUUID()},true)`);
        await authorizeAdmissionApplicant(transaction, context);
      }))).rejects.toMatchObject({ code: "permission_denied" });

      // A session ended earlier in the same transaction is still detected, because the reused check re-reads the locked deadline.
      await expect(database.withContext(own, (transaction) => withReusedAdmissionApplicantAuthority(transaction, async () => {
        await authorizeAdmissionApplicant(transaction, context);
        await transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp() where id=${context.sessionId}`);
        await authorizeAdmissionApplicant(transaction, context);
      }))).rejects.toMatchObject({ code: "authentication_required" });

      // The session deadline is compared with the database clock on every reuse.
      await database.withContext(own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+${`${VALIDATION.shortSessionMs} milliseconds`}::interval where id=${context.sessionId}`));
      await expect(database.withContext(own, (transaction) => withReusedAdmissionApplicantAuthority(transaction, async () => {
        await authorizeAdmissionApplicant(transaction, context);
        await delay(VALIDATION.shortSessionMs + VALIDATION.expiryMarginMs);
        await authorizeAdmissionApplicant(transaction, context);
      }))).rejects.toMatchObject({ code: "authentication_required" });
    });
  }, VALIDATION.timeoutMs);

  it("should read settings, policy and marker in one statement with the same values and shared locks as the separate reads", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { context, own } = await prepareAdmissionContactVerification(database);
      /** @param update - Concurrent write on a row the gate must hold. @returns The SQLSTATE that stopped it, or null when it was not blocked. */
      const probeWrite = (update: ReturnType<typeof sql>) => database.withContext(own, async (other) => { await other.execute(sql`set local lock_timeout=${sql.raw(`'${VALIDATION.concurrentLockTimeoutMs}ms'`)}`); await other.execute(update); }).then(() => null, (error: unknown) => readPostgresCode(error));
      await database.withContext(own, async (transaction) => {
        const observed = countStatements(transaction);
        const gate = await readLockedAdmissionPolicyGate(observed.database, context.tribeId);
        expect(observed.count()).toBe(1);
        const separate = { settings: (await transaction.execute<{ access_model: string; admission_enabled: boolean }>(sql`select access_model,admission_enabled from public.tribe_academy_settings where tribe_id=${context.tribeId}`)).rows[0], policy: await readAdmissionPolicy(transaction, context.tribeId, false), marker: await readAdmissionControlMarker(transaction, context.tribeId) };
        expect(gate).toEqual(separate);
        expect(gate.policy?.activatedAt).toBeInstanceOf(Date);
        expect(await probeWrite(sql`update public.tribe_academy_settings set admission_enabled=admission_enabled where tribe_id=${context.tribeId}`)).toBe(VALIDATION.lockNotAvailableCode);
        expect(await probeWrite(sql`update public.academy_admission_policies set is_open=is_open where tribe_id=${context.tribeId}`)).toBe(VALIDATION.lockNotAvailableCode);
      });
      // A tribe without settings or policy yields genuine absences instead of failing.
      const missing = await database.withContext(own, (transaction) => readLockedAdmissionPolicyGate(transaction, randomUUID()));
      expect(missing).toEqual({ settings: null, policy: null, marker: null });
    });
  }, VALIDATION.timeoutMs);
});
