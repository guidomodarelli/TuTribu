/** @vitest-environment node */
/** Exercises, on a real ledger, how a sensitive messaging write tells a registered original from a new one while the platform is blocked. @module messaging-original-operation-lookup-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { PostgresMessagingOriginalOperationLookup } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-original-operation-lookup";
import { ResolveMessagingContextUseCase, ResolveMessagingWriteContextUseCase } from "@/src/modules/messaging/application/use-cases/resolve-messaging-context-use-case";
import type { MessagingOriginalOperation } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { AdmissionOperationCommand } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { MESSAGING_CREDENTIAL_VALIDATION_OPERATION } from "@/src/modules/messaging/constants/messaging-credential-validation";
import { VERIFICATION_ISSUANCE_OPERATION } from "@/src/modules/academy-admissions/constants/verification-issuance";
import { ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

const resultSchema = z.strictObject({ registered: z.literal(true) });
const SQL_SCENARIO_TIMEOUT_MS = 240_000;
const SESSION_LIFETIME_MS = 3_600_000;

/** @param database - This run's owned branch. @returns A leader in a tribe, a way to register originals on the real ledger and to look them up. */
async function prepareMessagingLedger(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareContactVerificationDatabase(database), tribeId = randomUUID();
  await database.withContext(fixture.own, async (transaction) => {
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic messaging original tribe',${`original-${tribeId}`},${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},'leader','active')`);
  });
  const ledger = new PostgresAdmissionOperationRepository((run) => database.withContext(fixture.own, run), async () => true, async () => fixture.config);
  /** @param operationType - Ledger namespace. @param intent - Original intent. @returns The registered caller UUID. */
  const register = async (operationType: string, intent?: AdmissionOperationCommand["intent"]) => {
    const operationId = randomUUID();
    await ledger.run({ actorUserId: fixture.userId, tribeId, operationType, idempotencyKey: operationId, intent: intent ?? { synthetic: true } }, resultSchema, async () => ({ registered: true as const }));
    return operationId;
  };
  /** @param original - Original to look up. @returns Whether the lookup finds it inside the actor's own transaction. */
  const isRegistered = (original: Partial<MessagingOriginalOperation> & Pick<MessagingOriginalOperation, "operation" | "operationId">) => database.withContext(fixture.own, (transaction) => new PostgresMessagingOriginalOperationLookup(transaction).isRegistered({ actorUserId: fixture.userId, tribeId, ...original }));
  return { fixture, tribeId, register, isRegistered };
}

describe.skipIf(process.env.ACADEMY_ADMISSION_SQL_TESTS !== "1")("messaging original lookup on the real ledger", () => {
  it("should find only the actor's own registered original in the namespaces of its operation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await prepareMessagingLedger(database);
      const activation = await data.register(REAUTHENTICATION_OPERATION.activateMessagingConnection);
      const preparedValidation = await data.register(MESSAGING_CREDENTIAL_VALIDATION_OPERATION.prepare);
      const diagnostic = await data.register(VERIFICATION_ISSUANCE_OPERATION.issue, { purpose: ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic });
      const admissionChallenge = await data.register(VERIFICATION_ISSUANCE_OPERATION.issue, { purpose: ADMISSION_VERIFICATION_PURPOSE.admission });
      expect({
        activation: await data.isRegistered({ operation: REAUTHENTICATION_OPERATION.activateMessagingConnection, operationId: activation }),
        activationAsConfiguration: await data.isRegistered({ operation: REAUTHENTICATION_OPERATION.configureMessagingConnection, operationId: activation }),
        preparedValidation: await data.isRegistered({ operation: REAUTHENTICATION_OPERATION.validateMessagingConnection, operationId: preparedValidation }),
        diagnostic: await data.isRegistered({ operation: REAUTHENTICATION_OPERATION.diagnoseMessagingConnection, operationId: diagnostic }),
        admissionChallenge: await data.isRegistered({ operation: REAUTHENTICATION_OPERATION.diagnoseMessagingConnection, operationId: admissionChallenge }),
        newOriginal: await data.isRegistered({ operation: REAUTHENTICATION_OPERATION.activateMessagingConnection, operationId: randomUUID() }),
        anotherTribe: await data.isRegistered({ tribeId: randomUUID(), operation: REAUTHENTICATION_OPERATION.activateMessagingConnection, operationId: activation }),
      }).toEqual({ activation: true, activationAsConfiguration: false, preparedValidation: true, diagnostic: true, admissionChallenge: false, newOriginal: false, anotherTribe: false });
    });
  }, SQL_SCENARIO_TIMEOUT_MS);

  it("should keep a resent registered activation unresolved and refuse a new one definitively while the platform is locked", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await prepareMessagingLedger(database), activation = await data.register(REAUTHENTICATION_OPERATION.activateMessagingConnection);
      const now = new Date(), connectionId = randomUUID(), { userId } = data.fixture;
      const account = { userId, session: { id: randomUUID(), expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS) }, googleAccount: { id: randomUUID(), subject: randomUUID() } };
      const accounts = { getAuthenticatedAccount: async () => account };
      const resolve = (operationId: string) => database.withContext(data.fixture.own, (transaction) => new ResolveMessagingWriteContextUseCase(new ResolveMessagingContextUseCase(
        accounts,
        { getCurrentLeadership: async (tribeId) => ({ tribeId, leaderUserId: userId, membership: { userId, role: "leader", status: "active" } }), getConnection: async (tribeId) => ({ id: connectionId, tribeId, version: 1, contributedByUserId: userId, state: "ready", environment: data.fixture.config.environment, securityEpoch: data.fixture.config.securityEpoch, retiredAt: null, secretRef: randomUUID() }) },
        { getCurrentSecurityFacts: async () => ({ environment: data.fixture.config.environment, securityEpoch: data.fixture.config.securityEpoch, recoveryLocked: true }) },
        () => now,
      ), accounts, new PostgresMessagingOriginalOperationLookup(transaction)).execute({ tribeId: data.tribeId, connectionId, requestId: randomUUID(), operation: REAUTHENTICATION_OPERATION.activateMessagingConnection, operationId }));
      expect(await resolve(activation)).toMatchObject({ allowed: false, failure: { code: MESSAGING_ERROR_CODE.operationUnresolved, operation: { operationId: activation, state: "started" } } });
      const fresh = await resolve(randomUUID());
      expect(fresh).toMatchObject({ allowed: false, failure: { code: MESSAGING_ERROR_CODE.platformSecurityUnavailable } });
      expect(fresh.allowed ? null : fresh.failure.operation).toBeUndefined();
    });
  }, SQL_SCENARIO_TIMEOUT_MS);
});
