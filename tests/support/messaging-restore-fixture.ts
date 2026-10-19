/** Composes fresh native adapters against an owned restore copy without reusing the parent's SQL closures. @module messaging-restore-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareMessagingConnectionActivation } from "./messaging-activation-fixture";
import { composeMessagingRestoreOwnersForPrincipal, type MessagingRestoreSql } from "./messaging-restore-composition";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { createMessagingSecurityConfig, type MessagingSecurityConfig, type MessagingKeyPurpose, type MessagingKeyringInput } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { MessagingConnectionLifecycleContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-lifecycle";

/** Exposes only guarded transactions; a copied database cannot migrate or seed the parent. */
export type { MessagingRestoreSql } from "./messaging-restore-composition";
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
  return composeMessagingRestoreOwnersForPrincipal(database, fixture.fixture.context, readSecurityConfig);
}

/**
 * Creates a genuinely prepared selection before freezing the restore checkpoint.
 * @param database - Live owned parent, used only before its copy callback begins.
 * @param securityConfig - Optional original external host configuration, retained outside the SQL checkpoint.
 * @returns Actual activation, scoped native credential access and local retirement authority.
 */
export async function prepareMessagingRestoreSource(database: AcademyAdmissionTestDatabase, securityConfig?: MessagingSecurityConfig) {
  const fixture = await prepareMessagingConnectionActivation(database, undefined, undefined, securityConfig);
  const activated = await fixture.owner.activate(fixture.context, fixture.input);
  if (activated.state !== "completed") throw new Error("Messaging restore fixture failed: original_activation_unconfirmed");
  const connectionId = fixture.context.connectionId;
  const owners = composeMessagingRestoreOwners(database, fixture, async () => fixture.fixture.fixture.config);
  const resolved = await owners.request.useCases.resolveContext.execute({ tribeId: fixture.context.tribeId, connectionId, operation: REAUTHENTICATION_OPERATION.readMessagingSenders, requestId: randomUUID() });
  if (!resolved.allowed) throw new Error(`Messaging restore fixture failed: original_scope_${resolved.failure.code}`);
  const retirementContext: MessagingConnectionLifecycleContext = {
    ...fixture.context, connectionId, resourceId: connectionId,
    operation: REAUTHENTICATION_OPERATION.disconnectMessagingConnection,
  };
  return { fixture, owners, context: resolved.context, retirementContext, activated: activated.result };
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

export { readMessagingRestoreFacts } from "./messaging-restore-observations-native";
