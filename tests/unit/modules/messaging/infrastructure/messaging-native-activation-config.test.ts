/** @vitest-environment node */
/** Exercises live external recovery configuration through actual candidate activation and replay. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { createAdmissionSyntheticHostingEnvironment } from "@/tests/support/admission-synthetic-hosting-environment";
import { prepareMessagingConnectionActivation } from "@/tests/support/messaging-activation-fixture";
import { prepareMessagingActivationFromCreation } from "@/tests/support/messaging-activation-native";
import { MESSAGING_NATIVE_ACTIVATION } from "@/tests/support/constants/messaging-activation-native";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native activation with current external security", () => {
  it("keeps the old selection when lock or epoch changes, then explicitly activates and replays the prepared replacement", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const originalConfig = await readMessagingHostingSecurityConfig(createAdmissionSyntheticHostingEnvironment());
      const previous = await prepareMessagingConnectionActivation(database, undefined, undefined, originalConfig);
      expect(await previous.owner.activate(previous.context, previous.input)).toMatchObject({ state: "completed", result: { state: "active" } });
      let currentConfig = originalConfig;
      const replacement = await prepareMessagingActivationFromCreation(database, previous.fixture, {
        diagnosticRecipient: `${randomUUID()}@example.test`, initializeUsagePolicy: false, refreshCreationAuthority: true,
        readSecurityConfig: async () => currentConfig,
      });
      /** @returns Only native selection/version facts; no credentials, contacts or provider payloads. */
      const selection = () => database.withContext(previous.fixture.fixture.own, async (transaction) => (await transaction.execute<{ id: string; version: number; is_selected: boolean; selected_version: number | null }>(sql`select id,version,is_selected,selected_version from public.tenant_messaging_connections where tribe_id=${previous.context.tribeId} order by id`)).rows);
      const prepared = await selection(), requestsBefore = replacement.transport.receipts.length;
      currentConfig = { ...originalConfig, recoveryLocked: true };
      await expect(replacement.owner.activate(replacement.context, { ...replacement.input, operationId: randomUUID() })).rejects.toMatchObject({ code: "connection_incomplete" });
      expect(await selection()).toEqual(prepared);
      currentConfig = { ...originalConfig, securityEpoch: randomUUID() };
      await expect(replacement.owner.activate(replacement.context, { ...replacement.input, operationId: randomUUID() })).rejects.toMatchObject({ code: "connection_incomplete" });
      expect(await selection()).toEqual(prepared);
      expect(replacement.transport.receipts).toHaveLength(requestsBefore);
      currentConfig = originalConfig;
      const input = { ...replacement.input, operationId: randomUUID() };
      const activated = await replacement.owner.activate(replacement.context, input);
      expect(activated).toMatchObject({ state: "completed", result: { state: "active" } });
      const selected = await selection();
      expect(selected.filter((connection) => connection.is_selected)).toEqual([expect.objectContaining({ id: replacement.context.connectionId, selected_version: replacement.context.connectionVersion })]);
      expect(await replacement.owner.activate(replacement.context, input)).toMatchObject({ state: "completed", replayed: true });
      expect(await selection()).toEqual(selected);
      expect(replacement.transport.receipts).toHaveLength(requestsBefore);
      expect(previous.transport.deniedRequests + replacement.transport.deniedRequests).toBe(0);
    }, { databaseSelection: { databaseName: "neondb", roleName: "neondb_owner" }, computeUnits: MESSAGING_NATIVE_ACTIVATION.nativeComputeUnits });
  }, MESSAGING_NATIVE_ACTIVATION.nativeTestTimeoutMs);
});
