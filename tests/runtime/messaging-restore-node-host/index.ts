/** Runs only the sealed synthetic phase after capability, branch, profile and database-scope checks. */
import { sql } from "drizzle-orm";
import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { createAdmissionNodeHostHandler } from "@/tests/support/admission-node-host-handler";
import { createMessagingRestoreNodeDatabase } from "@/tests/support/messaging-restore-node-database";
import { assertMessagingRestoreNodeProfile, runMessagingRestoreNodePhase } from "@/tests/support/run-messaging-restore-node-phase";
import { readPostgresTestDiagnostics } from "@/tests/support/postgres-test-diagnostics";
import { readMessagingNodePhaseFailureCode, summarizeMessagingNodeHostFailure } from "@/tests/support/messaging-node-host-failure";
import { ADMISSION_NODE_HOST, ADMISSION_NODE_RUN_STATE, admissionNodeConfigurationSchema, type AdmissionNodeStatus, type AdmissionNodeRunState } from "@/tests/support/constants/admission-node-host";
import { MESSAGING_RESTORE_NODE_HOST as HOST, messagingRestoreNodeInputSchema, type MessagingRestoreNodeInput } from "@/tests/support/constants/messaging-restore-node-host";
import { OWNED_MESSAGING_NODE_DEPLOYMENT } from "@/tests/support/constants/owned-messaging-node-deployment";

const configuration = admissionNodeConfigurationSchema.parse({ branchName: process.env[ADMISSION_NODE_HOST.branchVariable], operationId: process.env[ADMISSION_NODE_HOST.operationVariable], tokenSha256: process.env[ADMISSION_NODE_HOST.tokenDigestVariable], expiresAt: process.env[ADMISSION_NODE_HOST.expiresVariable], sourceCommit: process.env[ADMISSION_NODE_HOST.sourceCommitVariable], bundleSha256: process.env[ADMISSION_NODE_HOST.bundleDigestVariable] });
const logger = createServerLogger({ feature: "messaging", operation: HOST.operation, requestId: configuration.operationId });
const backend = { userId: null, email: null };
let resources: { pool: ReturnType<typeof createPostgresPool>; database: ReturnType<typeof createMessagingRestoreNodeDatabase>; role: string } | undefined;

/** @returns Only this phase's validated private DTO, read after the common capability guard. */
async function input() {
  const current = messagingRestoreNodeInputSchema.parse(JSON.parse(process.env[HOST.inputVariable] ?? ""));
  if (current.operationId !== configuration.operationId || !ADMISSION_NODE_HOST.nodeVersionPattern.test(process.versions.node)) throw new Error("MessagingRestoreNode.prepare failed: operation_or_runtime_mismatch");
  assertMessagingRestoreNodeProfile(await readMessagingHostingSecurityConfig(), current);
  return current;
}

/** @param current - Fixed validated phase. @returns A lazy exact-endpoint pool; no dotenv or parent URI is accepted. */
function database(current: MessagingRestoreNodeInput) {
  const value = process.env[ADMISSION_NODE_HOST.directDatabaseVariable] ?? process.env[ADMISSION_NODE_HOST.databaseVariable];
  const expectedEndpoint = process.env[OWNED_MESSAGING_NODE_DEPLOYMENT.databaseEndpointVariable];
  if (!value || !expectedEndpoint) throw new Error("MessagingRestoreNode.database failed: injected_binding_unavailable");
  const connection = new URL(value);
  const hostLabel = connection.hostname.split(".")[0];
  const endpoint = hostLabel.endsWith(ADMISSION_NODE_HOST.poolerHostnameMarker) ? hostLabel.slice(0, -ADMISSION_NODE_HOST.poolerHostnameMarker.length) : hostLabel;
  if (endpoint !== expectedEndpoint) throw new Error("MessagingRestoreNode.database failed: endpoint_binding_mismatch");
  if (!resources) {
    connection.searchParams.set("sslmode", "verify-full");
    connection.searchParams.set("application_name", configuration.operationId);
    const pool = createPostgresPool({ connectionString: connection.toString(), maximumConnections: HOST.poolMaximum, operation: HOST.operation });
    resources = { pool, database: createMessagingRestoreNodeDatabase(pool, current.source.nonBypassRoleName), role: current.source.nonBypassRoleName };
  }
  if (resources.role !== current.source.nonBypassRoleName) throw new Error("MessagingRestoreNode.database failed: copied_role_changed");
  return resources.database;
}

/** @returns Only the original lifecycle state, after live outside-SQL control was rechecked. */
async function readStatus(): Promise<AdmissionNodeStatus> {
  const current = await input();
  const row = await database(current).withContext(backend, async (transaction) => (await transaction.execute<{ state: AdmissionNodeRunState }>(sql`select state from native_test_support.messaging_restore_phases where id=${configuration.operationId} and cohort_id=${current.cohortId} and expected_branch=${configuration.branchName} and phase=${current.phase}`)).rows[0]);
  if (!row) throw new Error("MessagingRestoreNode.read failed: owned_phase_unregistered");
  return { operationId: configuration.operationId, state: row.state, measurement: null };
}

/** @returns A committed original phase result; running, failed or completed phases are never automatically repeated. */
async function run(): Promise<AdmissionNodeStatus> {
  const current = await input(), sqlCapability = database(current);
  const acquired = await sqlCapability.withContext(backend, async (transaction) => (await transaction.execute(sql`update native_test_support.messaging_restore_phases set state=${ADMISSION_NODE_RUN_STATE.running},work_runs=work_runs+1,started_at=clock_timestamp(),source_commit=${configuration.sourceCommit},bundle_sha256=${configuration.bundleSha256} where id=${configuration.operationId} and cohort_id=${current.cohortId} and expected_branch=${configuration.branchName} and phase=${current.phase} and state=${ADMISSION_NODE_RUN_STATE.prepared} returning id`)).rows[0]);
  if (!acquired) return readStatus();
  try {
    const observed = await runMessagingRestoreNodePhase(sqlCapability, current, readMessagingHostingSecurityConfig);
    const completed = await sqlCapability.withContext(backend, async (transaction) => (await transaction.execute(sql`update native_test_support.messaging_restore_phases set state=${ADMISSION_NODE_RUN_STATE.completed},cipher_operations=${observed.cipherOperations},checked_rejections=${observed.checkedRejections},provider_requests=${observed.providerRequests},invitation_round_trip=${observed.invitationRoundTrip},runtime_version=${process.versions.node},completed_at=clock_timestamp() where id=${configuration.operationId} and cohort_id=${current.cohortId} and expected_branch=${configuration.branchName} and state=${ADMISSION_NODE_RUN_STATE.running} returning id`)).rows[0]);
    if (!completed) throw new Error("MessagingRestoreNode.complete failed: phase_commit_unconfirmed");
    return readStatus();
  } catch (error) {
    try {
      await sqlCapability.withContext(backend, (transaction) => transaction.execute(sql`update native_test_support.messaging_restore_phases set state=${ADMISSION_NODE_RUN_STATE.failed},failure_code=${readMessagingNodePhaseFailureCode(error)},completed_at=clock_timestamp() where id=${configuration.operationId} and cohort_id=${current.cohortId} and expected_branch=${configuration.branchName} and state=${ADMISSION_NODE_RUN_STATE.running}`));
    } catch (recordingError) { throw new AggregateError([error, recordingError], "MessagingRestoreNode.record failed: phase_state_unconfirmed", { cause: error }); }
    throw error;
  }
}

export default createAdmissionNodeHostHandler(configuration, {
  currentBranchName: () => process.env[ADMISSION_NODE_HOST.branchIdentityVariable],
  readStatus, run,
  failureCode: readMessagingNodePhaseFailureCode,
  reportFailure: (error) => {
    logger.error({ message: "MessagingRestoreNode.request failed", metadata: { operationId: configuration.operationId, errorName: summarizeMessagingNodeHostFailure(error).name, diagnostic: readMessagingNodePhaseFailureCode(error), ...readPostgresTestDiagnostics(error) } });
  },
});
