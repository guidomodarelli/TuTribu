/** @vitest-environment node */
/** Exercises real Next/auth/SQL provider boundaries with a closed real-SDK transport. @module messaging-provider-http-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingConnectionCreation } from "@/tests/support/messaging-connection-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";
import { ADMISSION_BATCH_HTTP_VALIDATION as HTTP_VALIDATION } from "@/tests/support/constants/admission-batch-validation";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { messagingConnectionMutationSchema } from "@/src/modules/messaging/application/results/messaging-connection-mutation-result";
import { messagingConnectionConfigurationSchema } from "@/src/modules/messaging/application/results/messaging-connection-configuration-result";
import { messagingPublicErrorSchema } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native provider HTTP boundary", () => {
  it("should deny unknown providers without fallback or effects when real creation and configuration are attempted", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given one genuine leader/session and the same synthetic host material in SQL and Next.
      const securityConfig = await readMessagingHostingSecurityConfig(), keyringsJson = process.env.MESSAGING_KEYRINGS_JSON;
      if (!keyringsJson) throw new Error("Native provider HTTP validation requires its own synthetic hosting keyrings");
      const fixture = await prepareMessagingConnectionCreation(database, securityConfig), tribeId = fixture.context.tribeId;
      const slug = `connection-${tribeId}`, credential = randomUUID(), senderId = randomUUID(), unknownProviderId = randomUUID();
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`));
      let providerRequests = 0;
      /** @returns Only persisted effect counts in this exact synthetic tribe, never private rows. */
      const effects = () => database.withContext(fixture.fixture.own, async (transaction) => (await transaction.execute(sql`
        select (select count(*)::int from public.tenant_messaging_connections where tribe_id=${tribeId}) as connections,
          (select count(*)::int from public.messaging_connection_versions where tribe_id=${tribeId}) as versions,
          (select count(*)::int from public.academy_admission_operations where tribe_id=${tribeId}) as operations,
          (select count(*)::int from public.messaging_connection_capabilities where tribe_id=${tribeId}) as capabilities,
          (select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries
      `)).rows[0]);

      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const cookie = `better-auth.session_token=${encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`)}`;
        /** @param path - Own loopback route. @param method - Explicit public mutation method. @param body - Own confirmed input, retained only in memory. @returns Real native HTTP response with private transport failures suppressed. */
        const request = (path: string, method: "POST" | "PUT", body: unknown) => runPrivateBrowserRequest("messaging_provider_http", () => fetch(new URL(path, origin), {
          method, headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(HTTP_VALIDATION.requestTimeoutMs),
        }));
        const connectionPath = `/api/tribes/${slug}/messaging/connections`;
        const creation = { operationId: randomUUID(), confirmed: true, providerId: unknownProviderId, name: "Proveedor de prueba", apiKey: credential };

        // When an authenticated leader proposes an unimplemented provider, the capability boundary rejects it before any write or SDK request.
        const denied = await request(connectionPath, "POST", creation), deniedRaw: unknown = await denied.json();
        expect(denied.status).toBe(409);
        expect(JSON.stringify(deniedRaw).includes(credential)).toBe(false);
        expect(messagingPublicErrorSchema.parse(deniedRaw)).toMatchObject({ code: "missing_capability" });
        expect(Object.keys(deniedRaw as Record<string, unknown>).sort()).toEqual(["code", "message", "requestId"]);
        expect(await effects()).toEqual({ connections: 0, versions: 0, operations: 0, capabilities: 0, deliveries: 0 });
        expect(providerRequests).toBe(0);

        // Then the actual implemented provider still creates one original candidate, without inspecting or sending.
        const accepted = await request(connectionPath, "POST", { ...creation, operationId: randomUUID(), providerId: "zavu" });
        expect(accepted.status).toBe(201);
        const createdRaw: unknown = await accepted.json();
        expect(JSON.stringify(createdRaw).includes(credential)).toBe(false);
        const created = createAdmissionOperationStateSchema(messagingConnectionMutationSchema).parse(createdRaw);
        expect(created.state).toBe("completed");
        if (created.state !== "completed") throw new Error("Native provider HTTP creation did not produce its original completed result");
        const connectionId = created.result.id;
        const initialEffects = { connections: 1, versions: 1, operations: 1, capabilities: 0, deliveries: 0 };
        expect(await effects()).toEqual(initialEffects);
        expect(providerRequests).toBe(0);

        const deniedAgain = await request(connectionPath, "POST", { ...creation, operationId: randomUUID() });
        expect(deniedAgain.status).toBe(409);
        expect(messagingPublicErrorSchema.parse(await deniedAgain.json()).code).toBe("missing_capability");
        const configuration = { operationId: randomUUID(), confirmed: true, expectedVersion: 1, channel: "email", senderId };
        const configurationPath = `${connectionPath}/${connectionId}/configuration`;
        const injected = await request(configurationPath, "PUT", { ...configuration, providerId: unknownProviderId });
        expect(injected.status).toBe(400);
        expect(messagingPublicErrorSchema.parse(await injected.json()).code).toBe("invalid_input");
        expect(await effects()).toEqual(initialEffects);
        expect(providerRequests).toBe(0);

        // The current storage contract also refuses an unknown stored provider; the transaction always rolls back.
        const client = new Client({ connectionString: environment.DATABASE_URL });
        let constraintFailure: { code: unknown; constraint: unknown } | null = null;
        try {
          await client.connect(); await client.query("begin");
          try { await client.query("update public.tenant_messaging_connections set provider=$1 where id=$2", [unknownProviderId, connectionId]); }
          catch (error) { const databaseError = error as { code?: unknown; constraint?: unknown }; constraintFailure = { code: databaseError.code, constraint: databaseError.constraint }; }
        } finally { try { await client.query("rollback"); } finally { await client.end(); } }
        expect(constraintFailure).toEqual({ code: "23514", constraint: "messaging_connection_provider_check" });

        // Explicit current recency permits the real detail lookup and versioned configuration, using only Zavu.
        await database.withContext(fixture.fixture.own, async (transaction) => {
          const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
          const validUntil = fixture.context.validUntil, intentId = randomUUID(), operation = REAUTHENTICATION_OPERATION.configureMessagingConnection;
          await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.context.actorUserId},${fixture.context.sessionId},${fixture.context.accountId},${fixture.context.subject},${tribeId},${operation},${connectionId},'/synthetic-provider-configuration',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
          await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.context.actorUserId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.sessionId},${tribeId},${operation},${connectionId},${now},${now},${validUntil})`);
        });
        const configured = await request(configurationPath, "PUT", { ...configuration, operationId: randomUUID() });
        expect(configured.status).toBe(200);
        const configuredRaw: unknown = await configured.json();
        expect(JSON.stringify(configuredRaw).includes(credential)).toBe(false);
        expect(createAdmissionOperationStateSchema(messagingConnectionConfigurationSchema).parse(configuredRaw)).toMatchObject({ state: "completed", result: { id: connectionId, version: 2, configurationVersion: 2, changed: true } });
        expect(providerRequests).toBe(1);
        expect(await effects()).toEqual({ connections: 1, versions: 2, operations: 2, capabilities: 1, deliveries: 0 });
      }, {
        preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")],
        environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: credential, ADMISSION_TEST_ZAVU_SENDER_ID: senderId },
        messagingSecurity: { environment: securityConfig.environment, securityEpoch: securityConfig.securityEpoch, keyringsJson },
        onProviderRequest: () => { providerRequests += 1; },
      }));
    });
  }, HTTP_VALIDATION.testTimeoutMs);
});
