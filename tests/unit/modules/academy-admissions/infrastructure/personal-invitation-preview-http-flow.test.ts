/** @vitest-environment node */
/** Exercises the real Next personal-preview route, native signed account cookies and PostgreSQL without effects. @module personal-invitation-preview-http-flow-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native personal preview HTTP", () => {
  it("should expose only guarded current preview with private headers and keep anonymous, forwarded and invalid links free of writes", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-personal-preview-http", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database, config), recipient = await createApplicant(), other = await createApplicant(), slug = `allowlist-${fixture.tribeId}`;
      for (const migration of ["20261009130000_add_personal_invitation_context_digest.sql", "20261007001000_read_public_admission_overview.sql"]) await database.applyMigration(migration);
      const invitations = new PostgresPersonalInvitationRepository((_scope, run) => database.withContext(fixture.own, run), async () => fixture.config);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await invitations.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Nombre privado HTTP", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Expected native personal HTTP initial material");
      const invitationId = created.result.invitationId, token = created.initialToken;
      const sessions = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string; token: string }>(sql`select id,token from public.session where id in (${recipient.sessionId},${other.sessionId})`)).rows);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        /** @param sessionId - Exact synthetic native session. @returns In-memory signed cookie only; it is never logged or persisted. */
        const headers = async (sessionId: string) => { const session = sessions.find((candidate) => candidate.id === sessionId); if (!session) throw new Error("Missing native personal preview session"); return { cookie: `better-auth.session_token=${encodeURIComponent(`${session.token}.${await makeSignature(session.token, secret)}`)}` }; };
        const url = `${origin}/api/admissions/invitations/${token}/overview`;
        const anonymous = await fetch(url, { signal: AbortSignal.timeout(180_000) });
        expect(anonymous.status).toBe(200); expect(anonymous.headers.get("cache-control")).toBe("no-store"); expect(anonymous.headers.get("referrer-policy")).toBe("no-referrer");
        expect(await anonymous.json()).toEqual({ state: "sign_in_required", safeMessage: "Iniciá sesión para consultar esta invitación personal." });
        const allowed = await fetch(url, { headers: await headers(recipient.sessionId), signal: AbortSignal.timeout(180_000) });
        expect(allowed.status).toBe(200); const body = await allowed.json();
        expect(body).toMatchObject({ state: "available", expectedOutcome: "admitted", overview: { tribe: { slug }, policy: { version: 2 } } });
        expect(JSON.stringify(body)).not.toContain(recipient.email); expect(JSON.stringify(body)).not.toContain(token); expect(JSON.stringify(body)).not.toContain("Nombre privado HTTP");
        const forwarded = await fetch(url, { headers: await headers(other.sessionId), signal: AbortSignal.timeout(180_000) });
        expect(forwarded.status).toBe(200); expect(await forwarded.json()).toMatchObject({ state: "unavailable" });
        const invalid = await fetch(`${origin}/api/admissions/invitations/invalid/overview`, { headers: await headers(recipient.sessionId), signal: AbortSignal.timeout(180_000) });
        expect(invalid.status).toBe(400); expect(invalid.headers.get("cache-control")).toBe("no-store"); expect(invalid.headers.get("referrer-policy")).toBe("no-referrer");
      }, { messagingSecurity }));
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "active", version: 1, redeemed_request_id: null }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}) as bindings,(select count(*)::int from public.contact_verification_challenges where tribe_id=${fixture.tribeId}) as challenges`)).rows).toEqual([{ requests: 0, bindings: 0, challenges: 0 }]);
      });
    });
  }, 1_200_000);
});
