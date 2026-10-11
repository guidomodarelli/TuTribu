/** @vitest-environment node */
/** Exercises UUID lifecycle routes with actual Next, Better Auth, scoped recency and PostgreSQL. @module tribe-lifecycle-native-route-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native tribe lifecycle HTTP", () => {
  it("should authorize exact native confirmations and recover the original after physical deletion", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => {
        const id = randomUUID();
        return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }];
      }));
      const messagingSecurity = { environment: "synthetic-lifecycle-http", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database, config);
      for (const migration of ["20261005100000_guard_messaging_secret_retirement.sql", "20261006180000_guard_subscription_membership_sources.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql", "20261010100000_minimize_deleted_admission_contact_owners.sql", "20261010113000_preserve_admission_tribe_namespaces.sql", "20261010120000_archive_deleted_admission_tribe_provenance.sql", "20261010121000_retire_deleted_tribe_messaging.sql", "20261011223000_close_admission_scope_lifecycle.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const applicant = await createApplicant();
      expect(await applicant.commands.submit.execute({ ...applicant.input, expectedPolicyVersion: 3 })).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending" } } });
      const settings = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{config_version: number}>(sql`select config_version from public.tribe_academy_settings where tribe_id=${fixture.tribeId}`)).rows[0]);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, `allowlist-${fixture.tribeId}`, async (origin, secret) => {
        const signed = encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`);
        const base = `${origin}/api/tribe-lifecycle/${fixture.tribeId.toUpperCase()}`;
        /** @param body - Explicit original without authority flags. @param recovery - Read-only original lookup. @param authenticated - Whether to attach the actual signed native session. @returns Real private HTTP response. */
        const send = (body: unknown, recovery = false, authenticated = true) => fetch(`${base}${recovery ? "/recover" : ""}`, { method: "POST", headers: { origin, "content-type": "application/json", ...(authenticated ? { cookie: `better-auth.session_token=${signed}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
        const exit = { operationId: randomUUID(), action: "exit_academy", expectedConfigVersion: settings.config_version, confirmed: true };
        expect((await send(exit, false, false)).status).toBe(401);
        expect((await send({ ...exit, role: "leader", authenticatedAt: new Date().toISOString() })).status).toBe(400);
        expect((await send({ ...exit, confirmed: false })).status).toBe(400);
        const noRecency = await send(exit);
        expect(noRecency.status).toBe(403);
        expect(await noRecency.json()).toMatchObject({ code: "reauthentication_required" });
        await fixture.confirm(REAUTHENTICATION_OPERATION.deleteTribe);
        expect((await send(exit)).status).toBe(403);
        await fixture.confirm(REAUTHENTICATION_OPERATION.exitAcademyMode);
        const exited = await send({ ...exit, operationId: exit.operationId.toUpperCase() });
        expect(exited.status).toBe(200);
        expect(exited.headers.get("Cache-Control")).toContain("no-store");
        expect(await exited.json()).toMatchObject({ state: "completed", operationId: exit.operationId, replayed: false, result: { action: "exit_academy", deleted: false, accessModel: "legacy", configVersion: settings.config_version + 1 } });
        const replay = await send(exit);
        expect(replay.status).toBe(200);
        expect(await replay.json()).toMatchObject({ state: "completed", replayed: true });
        expect((await send({ ...exit, expectedConfigVersion: settings.config_version + 1 })).status).toBe(409);
        const deletion = { ...exit, operationId: randomUUID(), action: "delete_tribe", expectedConfigVersion: settings.config_version + 1 };
        const deleted = await send(deletion);
        expect(deleted.status).toBe(200);
        expect(await deleted.json()).toMatchObject({ state: "completed", operationId: deletion.operationId, replayed: false, result: { action: "delete_tribe", deleted: true, accessModel: null, configVersion: null } });
        const recovered = await send(deletion, true);
        expect(recovered.status).toBe(200);
        expect(await recovered.json()).toMatchObject({ original: { state: "completed", operationId: deletion.operationId, replayed: true, result: { deleted: true } } });
        const deletedReplay = await send(deletion);
        expect(deletedReplay.status).toBe(200);
        expect(await deletedReplay.json()).toMatchObject({ replayed: true });
        const absent = await send({ ...deletion, operationId: randomUUID() }, true);
        expect(absent.status).toBe(200);
        expect(await absent.json()).toEqual({ original: null });
        await database.withContext(fixture.own, async (transaction) => {
          expect((await transaction.execute(sql`select count(*)::integer as total from public.tribes where id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
          expect((await transaction.execute(sql`select count(*)::integer as total from public.tribe_lifecycle_operations where tribe_id=${fixture.tribeId} and actor_user_id=${fixture.userId}`)).rows).toEqual([{ total: 2 }]);
          await transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.sessionId}`);
        });
        expect((await send(deletion, true)).status).toBe(401);
      }, { messagingSecurity }));
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
