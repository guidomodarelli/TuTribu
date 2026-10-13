/** @vitest-environment node */
/** Exercises actual Next list routes, native signed auth/recency and PostgreSQL, including readonly historical recovery. @module allowlist-http-flow-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native allowlist HTTP flow", () => {
  it("should create, query, update and recover an original under actual leader authority without changing memberships", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-list-http", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAllowlistManagement(database, config), slug = `allowlist-${fixture.tribeId}`;
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261007231500_bind_verification_operation_purpose.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261008220000_scope_admission_operation_recovery.sql"]) await database.applyMigration(migration);
      await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const signed = encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), headers = { cookie: `better-auth.session_token=${signed}`, origin, "content-type": "application/json" }, base = `${origin}/api/tribes/${slug}/admissions`;
        /** @param path - Own list/operation path. @param method - Explicit native method. @param body - Own proposal without actor or permission. @returns Actual response without private headers in diagnostics. */
        const request = (path: string, method = "GET", body?: unknown) => fetch(`${base}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(180_000) });
        expect((await fetch(`${base}/allowlist`, { headers: { origin }, signal: AbortSignal.timeout(180_000) })).status).toBe(401);
        const empty = await request("/allowlist");
        expect(empty.status).toBe(200); expect(await empty.json()).toEqual({ items: [], nextCursor: null });
        const create = { operationId: randomUUID(), confirmed: true, contactType: "email", identity: "native.list+tag@example.test", displayName: "Grupo" };
        const created = await request("/allowlist", "POST", create), original = await created.json();
        expect(created.status).toBe(201);
        expect(original).toMatchObject({ state: "completed", operationId: create.operationId, result: { version: 1, created: true, changed: true } });
        const entryId = String(original.result.entryId);
        expect((await request("/allowlist", "POST", create)).status).toBe(200);
        await fixture.confirm(REAUTHENTICATION_OPERATION.updateAllowlistEntry, entryId);
        const edit = { operationId: randomUUID(), confirmed: true, expectedVersion: 1, displayName: "Otro nombre", status: "disabled" };
        const updated = await request(`/allowlist/${entryId}`, "PATCH", edit);
        expect(updated.status).toBe(200); expect(await updated.json()).toMatchObject({ result: { entryId, version: 2, created: false, changed: true } });
        expect((await request(`/allowlist/${entryId}`, "PATCH", { ...edit, operationId: randomUUID(), expectedVersion: 0 })).status).toBe(400);
        expect((await request(`/allowlist/${entryId}`, "PATCH", { ...edit, operationId: randomUUID() })).status).toBe(409);
        const current = await request(`/allowlist/${entryId.toUpperCase()}`), currentBody = await current.json();
        expect(current.status).toBe(200);
        expect(currentBody).toMatchObject({ id: entryId, version: 2, identity: create.identity, displayName: "Otro nombre", status: "disabled" });
        for (const field of ["ownerUserId", "createdByUserId", "fingerprintKeyId", "contactFingerprint", "importId"]) expect(currentBody).not.toHaveProperty(field);
        const historical = await request(`/operations/${create.operationId}`);
        expect(historical.status).toBe(200);
        expect(await historical.json()).toMatchObject({ type: "create_allowlist_entry", state: "completed", result: { entryId, version: 1, created: true } });
        const filtered = await request("/allowlist?status=disabled&search=Otro");
        expect(filtered.status).toBe(200); expect((await filtered.json()).items).toHaveLength(1);
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
        expect((await request("/allowlist")).status).toBe(403);
        expect((await request(`/operations/${create.operationId}`)).status).toBe(403);
        expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and role='tribemate'`))).rows).toEqual([{ count: 0 }]);
        expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`))).rows).toEqual([{ count: 0 }]);
      }, { messagingSecurity }));
    });
  }, 1_200_000);
});
