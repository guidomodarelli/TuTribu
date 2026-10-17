/** Composes fresh native adapters against an owned restore copy without reusing the parent's SQL closures. @module messaging-restore-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareMessagingConnectionActivation, refreshMessagingActivationRecency } from "./messaging-activation-fixture";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { PostgresMessagingConnectionActivation } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-activation";
import { PostgresMessagingConnectionDisconnection } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-disconnection";
import { PostgresEncryptedSecretStore } from "@/src/modules/messaging/infrastructure/repositories/postgres-encrypted-secret-store";
import { PostgresMessagingLifecycleDependencies } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-messaging-lifecycle-dependencies";
import { PostgresMessagingSelectionDependencies } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-messaging-selection-dependencies";
import { readAdmissionEmailLifecycleDependency } from "@/src/modules/notifications/infrastructure/repositories/admission-email-lifecycle-reader";
import { buildMessagingModule } from "@/src/modules/messaging/setup";
import { createMessagingSecurityConfig, type MessagingSecurityConfig, type MessagingKeyPurpose, type MessagingKeyringInput } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_AUTHORIZATION_PURPOSE, MESSAGING_RESOURCE_SELECTION } from "@/src/modules/messaging/constants/messaging-connection";
import type { MessagingConnectionLifecycleContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-lifecycle";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Exposes only guarded transactions; a copied database cannot migrate or seed the parent. */
export type MessagingRestoreSql = Pick<AcademyAdmissionTestDatabase, "withContext">;
/** Keeps one native principal and protected resource while each composition receives its own database capability. */
type ActivationFixture = Awaited<ReturnType<typeof prepareMessagingConnectionActivation>>;

/**
 * Composes current identity, credential and lifecycle owners on the specified branch.
 * @param database - Exact owned parent or child; never inferred from persisted row IDs.
 * @param fixture - Native principal and resource facts, without using its captured repositories.
 * @param readSecurityConfig - External in-memory recovery scope, independent of every SQL snapshot.
 * @returns Fresh adapters whose every SQL operation uses this database capability.
 */
export function composeMessagingRestoreOwners(database: MessagingRestoreSql, fixture: ActivationFixture, readSecurityConfig: () => Promise<MessagingSecurityConfig>) {
  const principal = fixture.fixture.context;
  const execute = <Result>(context: { actorUserId: string }, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext({ userId: context.actorUserId, email: null }, run);
  const accounts = new PostgresAuthenticatedAccountProvider(
    async () => ({ userId: principal.actorUserId, sessionId: principal.sessionId }),
    (_identity, run) => execute(principal, run),
  );
  const request = buildMessagingModule({ accounts, clock: () => new Date(), execute: (_account, run) => execute(principal, run) })
    .createRequestModule({ selection: MESSAGING_RESOURCE_SELECTION.management, readSecurityConfig });
  return {
    accounts, request,
    activation: new PostgresMessagingConnectionActivation(execute, readSecurityConfig, (transaction) => new PostgresMessagingSelectionDependencies(transaction, readAdmissionEmailLifecycleDependency)),
    disconnection: new PostgresMessagingConnectionDisconnection(execute, readSecurityConfig, (transaction) => new PostgresMessagingLifecycleDependencies(transaction, readAdmissionEmailLifecycleDependency)),
    secrets: new PostgresEncryptedSecretStore((actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), accounts, readSecurityConfig, MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader),
  };
}

/**
 * Creates a genuinely prepared selection before freezing the restore checkpoint.
 * @param database - Live owned parent, used only before its copy callback begins.
 * @returns Actual activation, scoped native credential access and local retirement authority.
 */
export async function prepareMessagingRestoreSource(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareMessagingConnectionActivation(database);
  const activated = await fixture.owner.activate(fixture.context, fixture.input);
  if (activated.state !== "completed") throw new Error("Messaging restore fixture failed: original_activation_unconfirmed");
  const connectionId = fixture.context.connectionId;
  await refreshMessagingActivationRecency(database, fixture.fixture, REAUTHENTICATION_OPERATION.readMessagingSenders, connectionId);
  const recency = await refreshMessagingActivationRecency(database, fixture.fixture, REAUTHENTICATION_OPERATION.disconnectMessagingConnection, connectionId);
  const owners = composeMessagingRestoreOwners(database, fixture, async () => fixture.fixture.fixture.config);
  const resolved = await owners.request.useCases.resolveContext.execute({ tribeId: fixture.context.tribeId, connectionId, operation: REAUTHENTICATION_OPERATION.readMessagingSenders, requestId: randomUUID() });
  if (!resolved.allowed) throw new Error(`Messaging restore fixture failed: original_scope_${resolved.failure.code}`);
  const retirementContext: MessagingConnectionLifecycleContext = {
    ...fixture.context, ...recency, connectionId, resourceId: connectionId,
    operation: REAUTHENTICATION_OPERATION.disconnectMessagingConnection,
  };
  return { fixture, owners, context: resolved.context, retirementContext, activated: activated.result };
}

/**
 * Refreshes the original action-bound authority after long native setup and before freezing its parent.
 * Resource identity stays native and unchanged; only bounds returned by newly persisted evidence are replaced.
 * This avoids relying on the unspecified ordering of multiple still-live evidence rows.
 * @param database - Exact owned parent, still writable before its restore callback begins.
 * @param source - Actual verified resource scope and native principal from preparation.
 * @returns The same selection with current evidence for secret access, activation, retirement and policy commands.
 */
export async function refreshMessagingRestoreCheckpointAuthority(database: AcademyAdmissionTestDatabase, source: Awaited<ReturnType<typeof prepareMessagingRestoreSource>>) {
  const connectionId = source.context.connectionId, tribeId = source.context.tribeId;
  const secretRecency = await refreshMessagingActivationRecency(database, source.fixture.fixture, REAUTHENTICATION_OPERATION.readMessagingSenders, connectionId);
  const activationRecency = await refreshMessagingActivationRecency(database, source.fixture.fixture, REAUTHENTICATION_OPERATION.activateMessagingConnection, connectionId);
  const retirementRecency = await refreshMessagingActivationRecency(database, source.fixture.fixture, REAUTHENTICATION_OPERATION.disconnectMessagingConnection, connectionId);
  for (const operation of [REAUTHENTICATION_OPERATION.updateAdmissionPolicy, REAUTHENTICATION_OPERATION.activateAdmissionPolicy, REAUTHENTICATION_OPERATION.pauseAdmissionPolicy]) {
    await refreshMessagingActivationRecency(database, source.fixture.fixture, operation, tribeId);
  }
  return {
    ...source,
    context: { ...source.context, ...secretRecency },
    retirementContext: { ...source.retirementContext, ...retirementRecency },
    fixture: { ...source.fixture, context: { ...source.fixture.context, ...activationRecency } },
  };
}

/**
 * Rotates synthetic external keyrings without writing their material into the copied database.
 * @param previous - Existing external environment whose old material remains independently held.
 * @returns A new epoch and six independent nonextractable keyrings, initially recovery locked.
 */
export async function createMessagingRestoreSecurity(previous: MessagingSecurityConfig): Promise<MessagingSecurityConfig> {
  const keyrings = {} as Record<MessagingKeyPurpose, MessagingKeyringInput>;
  for (const purpose of Object.values(MESSAGING_KEY_PURPOSE)) {
    const id = randomUUID();
    keyrings[purpose] = { activeKeyId: id, keys: [{ id, material: randomBytes(MESSAGING_CRYPTO.keyBytes) }] };
  }
  try {
    return await createMessagingSecurityConfig({ environment: previous.environment, securityEpoch: randomUUID(), recoveryLocked: true, keyrings });
  } finally {
    for (const ring of Object.values(keyrings)) for (const key of ring.keys) key.material.fill(0);
  }
}

/**
 * Reads only safe resource and original delivery metadata from the specified capability.
 * @param database - Exact owned parent or copy.
 * @param context - Current synthetic leader and immutable original resource identity.
 * @returns Observable state and byte availability, with no credential, payload or recipient bytes.
 */
export function readMessagingRestoreFacts(database: MessagingRestoreSql, context: { actorUserId: string; tribeId: string; connectionId: string }) {
  return database.withContext({ userId: context.actorUserId, email: null }, async (transaction) => ({
    connection: (await transaction.execute(sql`select id,state,version,is_selected,selected_version,retired_at from public.tenant_messaging_connections where id=${context.connectionId} and tribe_id=${context.tribeId}`)).rows[0],
    secret: (await transaction.execute(sql`select connection_version,retired_at,purge_after,purged_at,octet_length(ciphertext)>0 as has_bytes from public.messaging_secret_envelopes where connection_id=${context.connectionId} and tribe_id=${context.tribeId} order by connection_version`)).rows,
    deliveries: (await transaction.execute(sql`select id,state,connection_id,connection_version from public.message_deliveries where connection_id=${context.connectionId} and tribe_id=${context.tribeId} order by id`)).rows,
    attempts: (await transaction.execute(sql`select attempt.id,attempt.delivery_id,attempt.state,attempt.connection_id,attempt.connection_version from public.message_delivery_attempts attempt where attempt.connection_id=${context.connectionId} and attempt.tribe_id=${context.tribeId} order by attempt.id`)).rows,
  }));
}
