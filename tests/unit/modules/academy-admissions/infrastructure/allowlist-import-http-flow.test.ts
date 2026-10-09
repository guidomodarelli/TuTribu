/** @vitest-environment node */
/** Exercises actual import routes, native signed sessions, SQL originals and private CSV downloads. @module allowlist-import-http-flow-tests */
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

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native import HTTP", () => {
  it("should preview, confirm and recover originals while GET/download never changes the list and lost permission closes the report", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-import-http", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAllowlistManagement(database, config), slug = `allowlist-${fixture.tribeId}`;
      for (const migration of ["20261009061000_guard_allowlist_import_progress.sql", "20261005093000_guard_academy_membership_sources.sql", "20261007231500_bind_verification_operation_purpose.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261008220000_scope_admission_operation_recovery.sql"]) await database.applyMigration(migration);
      await fixture.confirm(REAUTHENTICATION_OPERATION.previewAllowlistImport);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const cookie = `better-auth.session_token=${encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`)}`, headers = { cookie, origin, "content-type": "application/json" }, base = `${origin}/api/tribes/${slug}/admissions`;
        /** @param path - Own native resource path. @param method - Static HTTP operation. @param body - Own input without actor/role/provider metadata. @returns Actual native HTTP response without logging protected headers. */
        const request = (path: string, method = "GET", body?: unknown) => fetch(`${base}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(180_000) });
        expect((await fetch(`${base}/allowlist/imports/template`, { headers: { origin }, signal: AbortSignal.timeout(180_000) })).status).toBe(401);
        const template = await request("/allowlist/imports/template"); expect(template.status).toBe(200); expect(await template.text()).toBe("identity,display_name\r\n");
        const previewInput = { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText: "identity,display_name\nnew+tag@example.test,=1+1\ninvalid,Nombre" };
        const created = await request("/allowlist/imports", "POST", previewInput), original = await created.json();
        expect(created.status).toBe(201); expect(original).toMatchObject({ state: "completed", operationId: previewInput.operationId, result: { sourceVersion: 1 } });
        const importId = String(original.result.importId);
        const current = await request(`/allowlist/imports/${importId.toUpperCase()}`), preview = await current.json();
        expect(current.status).toBe(200); expect(preview).toMatchObject({ importId, state: "preview", counts: { selected: 0, added: 0 } });
        expect(preview.rows[1]).toMatchObject({ errors: ["admission_contact_invalid"], selected: false });
        for (const key of ["actorUserId", "fileFingerprint", "fingerprintKeyId", "securityEpoch"]) expect(preview).not.toHaveProperty(key);
        const recovery = await request(`/operations/${previewInput.operationId}`); expect(recovery.status).toBe(200); expect(await recovery.json()).toMatchObject({ type: "preview_allowlist_import", result: { importId, sourceVersion: 1 } });
        expect((await request(`/allowlist/imports/${importId}/report`)).status).toBe(200);
        expect((await request("/allowlist")).status).toBe(200); expect((await (await request("/allowlist")).json()).items).toEqual([]);
        await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, importId);
        const confirmation = { operationId: randomUUID(), confirmed: true, expectedVersion: 1, selectedRows: [1] };
        const committed = await request(`/allowlist/imports/${importId}/confirm`, "POST", confirmation), result = await committed.json();
        expect(committed.status).toBe(200); expect(result).toMatchObject({ state: "completed", result: { importId, state: "completed", counts: { selected: 1, added: 1, skipped: 1 } } });
        const replay = await request(`/allowlist/imports/${importId}/confirm`, "POST", confirmation); expect(replay.status).toBe(200); expect(await replay.json()).toEqual({ ...result, replayed: true });
        const confirmRecovery = await request(`/operations/${confirmation.operationId}`); expect(confirmRecovery.status).toBe(200); expect(await confirmRecovery.json()).toMatchObject({ type: "confirm_allowlist_import", result: result.result });
        const report = await request(`/allowlist/imports/${importId}/report`); expect(report.headers.get("cache-control")).toContain("no-store"); expect(report.headers.get("x-content-type-options")).toBe("nosniff"); expect(await report.text()).toContain('"\'\t=1+1"');
        await database.withContext(fixture.own, async (transaction) => {
          expect((await transaction.execute(sql`select count(*)::int as count from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 1 }]);
          expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]);
          await transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`);
        });
        const closed = await request(`/allowlist/imports/${importId}/report`); expect(closed.status).toBe(403); expect(closed.headers.get("content-disposition")).toBeNull();
        expect((await request(`/operations/${confirmation.operationId}`)).status).toBe(403);
      }, { messagingSecurity }));
    });
  }, 1_200_000);
});
