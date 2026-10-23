/** @vitest-environment node */
/** Exercises the first binding between saved admission rules and an activated messaging connection through native protected PostgreSQL. @module admission-policy-first-messaging-binding-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingConnectionActivation } from "@/tests/support/messaging-activation-fixture";
import { PostgresAdmissionPolicyRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-repository";
import { PostgresAdmissionPolicyPreparationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-preparation-reader";
import { authorizeAdmissionPolicy } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-authorizer";
import { AdmissionMessagingUsagePolicyReader } from "@/src/modules/academy-admissions/infrastructure/verification/messaging-usage-policy-reader";
import { PostgresMessagingUsageRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-usage-repository";
import { PostgresAdmissionVerificationReadinessReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-admission-verification-readiness-reader";
import { REAUTHENTICATION_OPERATION, type ReauthenticationOperation } from "@/src/modules/auth/constants/reauthentication-resources";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

const FIRST_BINDING_MIGRATION = "20261022210000_bind_admission_policies_to_selected_messaging.sql";
const FIRST_BINDING_TIMEOUT_MS = 1_200_000;
/** Rules a leader saves before codes can be sent: email contact checked with a code, open for requests; turning codes on moves the verification epoch to 2. */
const RULES_WITH_CODE = { contactType: "email", requiresAdditionalVerification: true, isOpen: true } as const;

/** @param database - Owned ephemeral branch. @returns A prepared, locally tested email candidate and the real admission policy writer of the same academy. */
async function prepareFirstBinding(database: AcademyAdmissionTestDatabase) {
  const prepared = await prepareMessagingConnectionActivation(database);
  const { tribeId, actorUserId, sessionId } = prepared.fixture.context, own = prepared.fixture.fixture.own;
  const readSecurityConfig = async () => prepared.fixture.fixture.config;
  await database.withContext(own, (transaction) => transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`));
  const context = (operation: ReauthenticationOperation): AuthorizedAdmissionContext => ({ userId: actorUserId, sessionId, tribeId, requestId: randomUUID(), role: "leader", membershipStatus: "active", resourceId: tribeId, action: "configure_policy", sensitiveOperation: operation });
  const authorize = (current: AuthorizedAdmissionContext) => async (transaction: RequestDatabase, requestedTribeId: string) => {
    if (requestedTribeId !== current.tribeId) return false;
    await authorizeAdmissionPolicy(transaction, current, current.sensitiveOperation);
    return true;
  };
  // The cutover inventory is outside this flow: it reports the academy as prepared and reads the real protection marker.
  const preflight = (transaction: RequestDatabase) => ({ readPreparation: async () => ({ prepared: true, isAcademy: true, evaluatorEnabled: true, controlActivated: (await transaction.execute<{ activated: boolean }>(sql`select admissions_control_activated_at is not null as activated from public.tribes where id=${tribeId}`)).rows[0].activated }) });
  const policies = new PostgresAdmissionPolicyRepository((_context, work) => database.withContext(own, work), readSecurityConfig, (transaction, current) => new PostgresAdmissionPolicyPreparationReader(preflight(transaction), new AdmissionMessagingUsagePolicyReader(new PostgresMessagingUsageRepository(transaction, authorize(current))), new PostgresAdmissionVerificationReadinessReader(transaction, authorize(current), readSecurityConfig), readSecurityConfig));
  const saveRules = async () => {
    const initialized = await policies.initialize({ context: context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), confirmed: true, type: "initialize_admission_policy" });
    if (initialized.state !== "completed") throw new Error("AdmissionPolicyFirstBinding.saveRules failed: initialization_unconfirmed");
    return policies.update({ context: context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), confirmed: true, type: "update_admission_policy", expectedVersion: initialized.result.version, patch: RULES_WITH_CODE });
  };
  const activateAdmissions = (expectedVersion: number) => policies.activate({ context: context(REAUTHENTICATION_OPERATION.activateAdmissionPolicy), operationId: randomUUID(), confirmed: true, type: "activate_admission_policy", expectedVersion });
  /** @returns The stored policy reference and counter, never provider or credential data. */
  const storedPolicy = () => database.withContext(own, async (transaction) => (await transaction.execute<{ messaging_connection_id: string | null; messaging_connection_version: number | null; version: number }>(sql`select messaging_connection_id,messaging_connection_version,version from public.academy_admission_policies where tribe_id=${tribeId}`)).rows[0]);
  /** @returns Every first-binding or replacement fact of this academy, oldest first. */
  const selectionAudits = () => database.withContext(own, async (transaction) => (await transaction.execute(sql`select metadata,actor_user_id,operation_id is not null as has_operation,resource_version,rule,cause from public.academy_admission_audit_events where tribe_id=${tribeId} and event_type='messaging_selection_replaced' order by created_at,id`)).rows);
  return { prepared, own, tribeId, actorUserId, saveRules, activateAdmissions, storedPolicy, selectionAudits };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("first binding of admission rules to the messaging selection", () => {
  it("should bind rules saved before the connection when the connection is activated and then activate admissions with a code", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const binding = await prepareFirstBinding(database);
      expect(await binding.saveRules()).toMatchObject({ state: "completed", result: { version: 2, changed: true } });
      expect(await binding.storedPolicy()).toEqual({ messaging_connection_id: null, messaging_connection_version: null, version: 2 });

      const activated = await binding.prepared.owner.activate(binding.prepared.context, binding.prepared.input);
      expect(activated).toMatchObject({ state: "completed", result: { state: "active", policyVersion: 3 } });
      const { connectionId, connectionVersion } = binding.prepared.context;
      expect(await binding.storedPolicy()).toEqual({ messaging_connection_id: connectionId, messaging_connection_version: connectionVersion, version: 3 });
      expect(await binding.selectionAudits()).toEqual([{ metadata: { previousVersion: 2, previousConnectionId: null, previousConnectionVersion: null, connectionId, connectionVersion, verificationEpoch: 2 }, actor_user_id: binding.actorUserId, has_operation: true, resource_version: 3, rule: "messaging_connection_replaced", cause: "messaging_connection_replaced" }]);

      expect(await binding.activateAdmissions(3)).toMatchObject({ state: "completed", result: { controlActivated: true, changed: true, version: 4 } });
      expect(await binding.prepared.owner.activate(binding.prepared.context, binding.prepared.input)).toMatchObject({ state: "completed", replayed: true });
      expect(await binding.selectionAudits()).toHaveLength(1);
    });
  }, FIRST_BINDING_TIMEOUT_MS);

  it("should take the current selection when rules are saved after the connection is activated", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const binding = await prepareFirstBinding(database);
      expect(await binding.prepared.owner.activate(binding.prepared.context, binding.prepared.input)).toMatchObject({ state: "completed", result: { state: "active", policyVersion: null } });
      const { connectionId, connectionVersion } = binding.prepared.context;

      expect(await binding.saveRules()).toMatchObject({ state: "completed", result: { version: 2, changed: true } });
      expect(await binding.storedPolicy()).toEqual({ messaging_connection_id: connectionId, messaging_connection_version: connectionVersion, version: 2 });
      expect(await binding.activateAdmissions(2)).toMatchObject({ state: "completed", result: { controlActivated: true, changed: true, version: 3 } });
    });
  }, FIRST_BINDING_TIMEOUT_MS);

  it("should repair a policy left without a reference next to an active selection and leave a system audit fact", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const binding = await prepareFirstBinding(database);
      expect(await binding.prepared.owner.activate(binding.prepared.context, binding.prepared.input)).toMatchObject({ state: "completed", result: { state: "active" } });
      const { connectionId, connectionVersion } = binding.prepared.context;
      // A policy stored by an earlier release: rules with a code and no messaging reference.
      await database.withContext(binding.own, (transaction) => transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,contact_type,requires_additional_verification,is_open,version) values (${binding.tribeId},'email',true,true,2)`));

      await database.applyMigration(FIRST_BINDING_MIGRATION);
      expect(await binding.storedPolicy()).toEqual({ messaging_connection_id: connectionId, messaging_connection_version: connectionVersion, version: 3 });
      expect(await binding.selectionAudits()).toEqual([{ metadata: { previousVersion: 2, previousConnectionId: null, previousConnectionVersion: null, connectionId, connectionVersion, verificationEpoch: 1 }, actor_user_id: null, has_operation: false, resource_version: 3, rule: "messaging_connection_replaced", cause: "messaging_connection_replaced" }]);
      expect(await binding.activateAdmissions(3)).toMatchObject({ state: "completed", result: { controlActivated: true, version: 4 } });
    });
  }, FIRST_BINDING_TIMEOUT_MS);

  it("should leave a policy without a reference when the selected connection is suspended", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const binding = await prepareFirstBinding(database);
      expect(await binding.prepared.owner.activate(binding.prepared.context, binding.prepared.input)).toMatchObject({ state: "completed", result: { state: "active" } });
      await database.withContext(binding.own, async (transaction) => {
        await transaction.execute(sql`update public.tenant_messaging_connections set state='suspended',version=version+1 where id=${binding.prepared.context.connectionId}`);
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,contact_type,requires_additional_verification,is_open,version) values (${binding.tribeId},'email',true,true,2)`);
      });

      await database.applyMigration(FIRST_BINDING_MIGRATION);
      expect(await binding.storedPolicy()).toEqual({ messaging_connection_id: null, messaging_connection_version: null, version: 2 });
      expect(await binding.selectionAudits()).toEqual([]);
    });
  }, FIRST_BINDING_TIMEOUT_MS);
});
