/** @vitest-environment node */
/** Exercises actual Next administration, signed native sessions/recency and owned PostgreSQL with no platform mocks. @module personal-invitation-management-http-flow-tests */
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

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native personal invitation management HTTP", () => {
  it("should enforce actual leader and signed recency while preserving one-view issuance, CAS and historical recovery", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-personal-management-http", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAllowlistManagement(database, config), slug = `allowlist-${fixture.tribeId}`;
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261007231500_bind_verification_operation_purpose.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261008220000_scope_admission_operation_recovery.sql", "20261009130000_add_personal_invitation_context_digest.sql"]) await database.applyMigration(migration);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const signed = encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), headers = { cookie: `better-auth.session_token=${signed}`, origin, "content-type": "application/json" }, base = `${origin}/api/tribes/${slug}/admissions`;
        /** @param path - Own route template with opaque resource identity. @param method - Explicit native action. @param body - Browser intent without actor/role authority. @returns Actual response with private transport diagnostics suppressed. */
        const request = async (path: string, method = "GET", body?: unknown) => {
          try { return await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(180_000) }); }
          catch { throw new Error("Personal invitation management HTTP observation failed"); }
        };
        expect((await fetch(base + "/invitations", { headers: { origin }, signal: AbortSignal.timeout(180_000) })).status).toBe(401);
        const empty = await request("/invitations");
        expect(empty.status).toBe(200); expect(await empty.json()).toEqual({ items: [], nextCursor: null });
        const creation = { operationId: randomUUID(), confirmed: true, internalName: "Grupo inicial", recipient: { type: "email", value: "personal.native+tag@example.test" }, requiresAllowlist: true };
        const absentRecency = await request("/invitations", "POST", creation);
        expect(absentRecency.status).toBe(401); expect(await absentRecency.json()).toMatchObject({ code: "reauthentication_required" });
        await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation);
        const blockedCreation = await request("/invitations", "POST", { ...creation, operationId: randomUUID() });
        expect(blockedCreation.status).toBe(404); expect(await blockedCreation.json()).toMatchObject({ code: "invitation_unavailable" });
        expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select count(*)::int as count from public.academy_personal_invitations where tribe_id=${fixture.tribeId}`))).rows).toEqual([{ count: 0 }]);
        await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
        const preparedList = await request("/allowlist", "POST", { operationId: randomUUID(), confirmed: true, contactType: "email", identity: creation.recipient.value });
        expect(preparedList.status).toBe(201);
        const created = await request("/invitations", "POST", creation), original = await created.json();
        expect(created.status).toBe(201);
        expect(original).toMatchObject({ state: "completed", operationId: creation.operationId, replayed: false, result: { version: 1, created: true, changed: true } });
        expect(new URL(original.invitationUrl).origin).toBe(origin);
        expect(new URL(original.invitationUrl).pathname).toMatch(/^\/admissions\/invitations\/[A-Za-z0-9_-]{43}$/u);
        expect(created.headers.get("cache-control")).toBe("no-store"); expect(created.headers.get("referrer-policy")).toBe("no-referrer");
        expect(original).not.toHaveProperty("initialToken");
        const invitationId = String(original.result.invitationId);
        const replay = await request("/invitations", "POST", creation);
        expect(replay.status).toBe(200); expect(await replay.json()).toEqual({ state: "completed", operationId: creation.operationId, replayed: true, result: original.result });
        const changedIntent = await request("/invitations", "POST", { ...creation, internalName: "Otro intent con el mismo UUID" });
        expect(changedIntent.status).toBe(409); expect(await changedIntent.json()).toMatchObject({ code: "idempotency_conflict" });
        await fixture.confirm(REAUTHENTICATION_OPERATION.renamePersonalInvitation, invitationId);
        const rename = { operationId: randomUUID(), confirmed: true, expectedVersion: 1, internalName: "Otro nombre" };
        const renamed = await request(`/invitations/${invitationId.toUpperCase()}`, "PATCH", rename);
        expect(renamed.status).toBe(200); expect(await renamed.json()).toMatchObject({ result: { invitationId, version: 2, changed: true, created: false } });
        expect((await request(`/invitations/${invitationId}`, "PATCH", { ...rename, operationId: randomUUID() })).status).toBe(409);
        const detail = await request(`/invitations/${invitationId}`), current = await detail.json();
        expect(detail.status).toBe(200);
        expect(current).toMatchObject({ id: invitationId, version: 2, internalName: "Otro nombre", recipient: creation.recipient, status: "active" });
        for (const field of ["initialToken", "invitationUrl", "tokenHash", "tokenKeyId", "tokenContextDigest", "contactFingerprint", "createdByUserId"]) expect(current).not.toHaveProperty(field);
        const historical = await request(`/operations/${creation.operationId}`);
        expect(historical.status).toBe(200);
        expect(await historical.json()).toMatchObject({ type: "create_personal_invitation", state: "completed", result: { invitationId, version: 1, created: true } });
        expect((await request("/invitations", "POST", { ...creation, operationId: randomUUID(), replacement: { invitationId, expectedVersion: 1 } })).status).toBe(409);
        const replaced = await request("/invitations", "POST", { ...creation, operationId: randomUUID(), replacement: { invitationId, expectedVersion: 2 }, expiresAt: null }), replacement = await replaced.json();
        expect(replaced.status).toBe(201); expect(replacement.result.invitationId).not.toBe(invitationId);
        expect(replacement.result.version).toBe(1);
        await fixture.confirm(REAUTHENTICATION_OPERATION.revokePersonalInvitation, replacement.result.invitationId);
        const revocation = { operationId: randomUUID(), confirmed: true, expectedVersion: 1, reason: "Enlace retirado", revokeRedeemedAuthorization: false };
        const revoked = await request(`/invitations/${replacement.result.invitationId}/revoke`, "POST", revocation);
        expect(revoked.status).toBe(200); expect(await revoked.json()).toMatchObject({ result: { version: 2, changed: true, created: false } });
        const filtered = await request("/invitations?status=revoked&limit=1"), page = await filtered.json();
        expect(filtered.status).toBe(200); expect(page.items).toHaveLength(1); expect(page.nextCursor).toEqual(expect.any(String));
        expect((await request(`/invitations?status=revoked&limit=1&cursor=${encodeURIComponent(page.nextCursor)}`)).status).toBe(200);
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
        expect((await request("/invitations")).status).toBe(403);
        expect((await request(`/invitations/${invitationId}`)).status).toBe(403);
        expect((await request(`/operations/${creation.operationId}`)).status).toBe(403);
        expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`))).rows).toEqual([{ count: 0 }]);
        expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.tribeId}`))).rows).toEqual([{ count: 0 }]);
      }, { messagingSecurity }));
    });
  }, 1_200_000);
});
