/** @vitest-environment node */
/** Exercises provider substitution through own ports and actual admission state transitions. @module messaging-provider-substitution-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestEmailProvider } from "@/tests/support/messaging-email-provider";
import { MessagingProviderRegistry } from "@/src/modules/messaging/infrastructure/messaging-provider-registry";
import { createZavuProviderDescriptor } from "@/src/modules/messaging/infrastructure/zavu/zavu-provider-descriptor";
import { RegisteredMessagingInspectorFactory } from "@/src/modules/messaging/infrastructure/registered-messaging-adapters";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { sql } from "drizzle-orm";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareProviderSubstitution } from "@/tests/support/messaging-provider-substitution-fixture";
import { MESSAGING_PROVIDER_SUBSTITUTION_TEST_TIMEOUT_MS } from "@/tests/support/constants/messaging-provider-validation";
import { createRegisteredMessagingAdapters } from "@/src/modules/messaging/infrastructure/composition/messaging-provider-adapters";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";

/** @returns One synthetic scope whose authority is provided by the test-owned current-resource port. */
function inspectionContext(): AuthorizedMessagingContext {
  const now = new Date();
  const connectionId = randomUUID();
  return { authorizationPurpose: "sensitive_leader", actorUserId: randomUUID(), sessionId: randomUUID(), accountId: randomUUID(), subject: randomUUID(), tribeId: randomUUID(), connectionId, connectionVersion: 1, secretRef: randomUUID(), environment: "synthetic", securityEpoch: "synthetic-epoch", requestId: randomUUID(), resourceId: connectionId, operation: "configure_messaging_connection", authenticatedAt: now, validUntil: new Date(now.getTime() + 540_000) };
}

describe("own-port provider substitution", () => {
  it("should inspect real email resources when the adapter provides no phone or template operations", async () => {
    // Given an email-only implementation, rather than a full inspector with dummy phone methods.
    const senderId = randomUUID(), fixture = createTestEmailProvider(senderId);
    const registry = new MessagingProviderRegistry([fixture.descriptor]);
    const context = inspectionContext(), signal = new AbortController().signal;
    const inspector = new RegisteredMessagingInspectorFactory(registry, async () => fixture.descriptor.id).create(context, randomUUID());

    // When the application queries that same configured resource through its own factory.
    expect(await inspector.inspectCredential(signal)).toMatchObject({ isTestMode: false });
    expect(await inspector.listSenders(signal)).toEqual([{ resourceId: senderId, name: "Correo de prueba", channels: ["email"], canSendWhatsappTemplates: false }]);
    expect(await inspector.retrieveSender(senderId, signal)).toMatchObject({ resourceId: senderId, channels: ["email"] });

    // Then the real email path works and absent capabilities remain controlled failures.
    await expect(inspector.retrieveSender(randomUUID(), signal)).rejects.toMatchObject({ code: "missing_capability" });
    await expect(inspector.listTemplates(signal)).rejects.toMatchObject({ code: "missing_capability" });
    await expect(inspector.retrieveTemplate(randomUUID(), signal)).rejects.toMatchObject({ code: "missing_capability" });
    expect(() => registry.resolve(fixture.descriptor.id, "sms")).toThrow(expect.objectContaining({ code: "missing_capability" }));
    expect(() => registry.resolve(fixture.descriptor.id, "whatsapp")).toThrow(expect.objectContaining({ code: "missing_capability" }));
    expect(fixture.deliveries).toEqual([]);
  });

  it("should expose only Zavu in production composition and reject an unknown current provider without substituting the test adapter", async () => {
    // Given a real SDK descriptor whose closed transport must remain unused on a denial.
    let requests = 0;
    const registry = new MessagingProviderRegistry([createZavuProviderDescriptor(async () => { requests += 1; throw new Error("Unexpected provider substitution request"); })]);
    const production = createRegisteredMessagingAdapters({ execute: async () => { throw new Error("Unexpected catalog database request"); }, readSecurityFacts: async () => ({ environment: "synthetic", securityEpoch: "synthetic-epoch", recoveryLocked: false }), fetch: async () => { requests += 1; throw new Error("Unexpected catalog provider request"); } });
    expect(production.catalog).toEqual([{ id: "zavu", channels: ["email", "sms", "whatsapp"] }]);
    const inspector = new RegisteredMessagingInspectorFactory(registry, async () => "unimplemented").create(inspectionContext(), randomUUID());

    // When a protected current-resource read returns an unimplemented identity.
    await expect(inspector.inspectCredential(new AbortController().signal)).rejects.toMatchObject({ code: "missing_capability" });

    // Then neither a default RPC nor a test-provider fallback runs.
    expect(requests).toBe(0);
  });
});

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission outcomes after own transport substitution", () => {
  it.each(["allowlist", "personal", "review"] as const)("should preserve real %s decisions, proof consumption and replay when only the sender adapter changes", async (scenario) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const outcomes: unknown[] = [];
      let securityConfig: MessagingSecurityConfig | undefined;
      for (const alternative of [false, true]) {
        // Given independent native accounts/resources with the same business preconditions.
        const data = await prepareProviderSubstitution(database, scenario, alternative, securityConfig);
        securityConfig = data.fixture.fixture.config;
        const tribeId = data.fixture.context.tribeId;
        const issueInput = { tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true as const, channel: "email" as const, ...(data.personalToken ? { invitationToken: data.personalToken.token } : {}) };
        const issued = await data.verification.issue(issueInput);
        if (!issued.ok) throw new Error(`Provider substitution issuance failed: scenario=${scenario}, alternative=${alternative}, code=${issued.failure.code}`);
        expect(issued).toMatchObject({ ok: true, value: { state: "completed", replayed: false } });
        if (!issued.ok || issued.value.state !== "completed") throw new Error("Provider substitution failed: original_issuance_unavailable");
        await data.settle();
        expect(data.sends()).toBe(1);
        expect(await data.verification.issue(issueInput)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: issued.value.result } });
        expect(data.sends()).toBe(1);
        expect(await data.fixture.counts()).toMatchObject({ proofs: 0, memberships: 0 });

        // When the observed code is checked locally, then the original proof drives submission.
        const verified = await data.verification.verify({ tribeId, requestId: randomUUID(), operationId: randomUUID(), challengeId: issued.value.result.challengeId, verificationCode: data.code() });
        expect(verified).toMatchObject({ ok: true, value: { state: "completed", result: { result: "verified" } } });
        if (!verified.ok || verified.value.state !== "completed" || verified.value.result.result !== "verified") throw new Error("Provider substitution failed: original_proof_unavailable");
        const proofId = verified.value.result.proofId;
        const input = { tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true as const, proofId, ...(data.personalToken ? { invitationToken: data.personalToken.token } : {}) };
        const submitted = await data.commands.submit.execute(input);
        expect(submitted).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: scenario === "review" ? "pending" : "admitted" } } });
        if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Provider substitution failed: committed_admission_unavailable");
        const admissionRequestId = submitted.value.result.admissionRequestId;
        expect(await data.commands.submit.execute(input)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: submitted.value.result } });
        if (scenario === "review") {
          expect(await data.fixture.counts()).toMatchObject({ proofs: 1, memberships: 0 });
          const expectedVersion = submitted.value.result.committedRequestVersion;
          if (expectedVersion === null) throw new Error("Provider substitution failed: committed_request_version_unavailable");
          const decision = { tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId, expectedVersion, decision: "approve" as const, internalReason: "Admisión comprobada con transporte sustituible", externalMessage: null, confirmed: true as const };
          expect(await data.leader.decide.execute(decision)).toMatchObject({ ok: true, value: { state: "completed", result: { status: "approved", version: expectedVersion + 1 } } });
          expect(await data.leader.decide.execute(decision)).toMatchObject({ ok: true, value: { state: "completed", replayed: true } });
        }

        // Then persistence proves the business effects; transport acceptance itself never granted membership.
        const observed = await database.withContext(data.fixture.fixture.own, async (transaction) => ({
          requests: (await transaction.execute(sql`select source,status,evidence_source from public.academy_admission_requests where id=${admissionRequestId}`)).rows,
          proofs: (await transaction.execute(sql`select status,applied_request_id=${admissionRequestId} as original_request from public.academy_admission_verification_proofs where id=${proofId}`)).rows,
          memberships: (await transaction.execute(sql`select role,status from public.tribe_members where tribe_id=${tribeId} and user_id=${data.fixture.context.userId}`)).rows,
          decisions: (await transaction.execute(sql`select actor_kind,rule,allowlist_entry_id is not null as has_list from public.academy_admission_decisions where request_id=${admissionRequestId}`)).rows,
          invitations: data.invitationId ? (await transaction.execute(sql`select status,redeemed_request_id=${admissionRequestId} as original_request from public.academy_personal_invitations where id=${data.invitationId}`)).rows : [],
          notices: (await transaction.execute(sql`select event_type,count(*)::int as count from public.academy_admission_notification_obligations where request_id=${admissionRequestId} group by event_type order by event_type`)).rows,
          attempts: (await transaction.execute(sql`select state,count(*)::int as count from public.message_delivery_attempts where tribe_id=${tribeId} group by state`)).rows,
        }));
        expect(observed.requests).toEqual([{ source: scenario === "personal" ? "personal" : "common", status: "approved", evidence_source: "local" }]);
        expect(observed.proofs).toEqual([{ status: "applied", original_request: true }]);
        expect(observed.memberships).toEqual([{ role: "tribemate", status: "active" }]);
        expect(observed.decisions).toEqual([{ actor_kind: scenario === "review" ? "user" : "system", rule: scenario === "review" ? "manual_review" : "automatic", has_list: scenario === "allowlist" }]);
        expect(observed.invitations).toEqual(scenario === "personal" ? [{ status: "redeemed", original_request: true }] : []);
        expect(observed.notices).toEqual(scenario === "review" ? [{ event_type: "approved", count: 1 }, { event_type: "pending_created", count: 1 }] : [{ event_type: "approved", count: 1 }]);
        expect(observed.attempts).toEqual([{ state: "accepted", count: 1 }]);
        expect(data.sends()).toBe(1);
        outcomes.push(observed);
      }
      expect(outcomes[1]).toEqual(outcomes[0]);
    });
  }, MESSAGING_PROVIDER_SUBSTITUTION_TEST_TIMEOUT_MS);
});
