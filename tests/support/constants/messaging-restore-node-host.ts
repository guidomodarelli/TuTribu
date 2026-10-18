/** Owns the private synthetic restore protocol; no HTTP caller supplies these identities or phases. */
import { z } from "zod";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

export type MessagingRestoreNodePhase = "baseline" | "locked" | "locked_original" | "epoch" | "retired_key" | "reconcile" | "reopen";
export const MESSAGING_RESTORE_NODE_PHASE = { baseline: "baseline", locked: "locked", lockedOriginal: "locked_original", epoch: "epoch", retiredKey: "retired_key", reconcile: "reconcile", reopen: "reopen" } as const satisfies Record<string, MessagingRestoreNodePhase>;
export const MESSAGING_RESTORE_NODE_HOST = {
  inputVariable: "MESSAGING_RESTORE_PRIVATE_INPUT",
  securityEnvironment: "synthetic-messaging-host-restore",
  entrypoint: "tests/runtime/messaging-restore-node-host/index.ts",
  supportMigration: "tests/support/sql/20261018211000_create_messaging_restore_probe.sql",
  coordinator: "tests/support/run-messaging-node-host-restore.ts",
  testFile: "tests/manual/messaging-node-host-restore.native.test.ts",
  sqlSchema: "native_test_support",
  sqlTable: "messaging_restore_phases",
  poolMaximum: 5,
  operation: "native_messaging_host_restore",
  recoveryBatchLimit: 1,
  historyCaseCount: 5,
  enabledVariable: "RUN_MESSAGING_NODE_HOST_RESTORE",
  enabledValue: "1",
  reportFileVariable: "MESSAGING_NODE_RESTORE_REPORT_FILE",
  nonBypassRolePattern: /^admission_test_[a-f0-9]{32}$/,
  syntheticCodePattern: /^\d{6}$/,
  syntheticEmailPattern: /^[a-f0-9-]+@example\.test$/,
} as const;

const uuid = z.uuid(), positive = z.number().int().positive();
const privateDate = z.coerce.date();
const baseContext = {
  actorUserId: uuid, sessionId: uuid, tribeId: uuid, requestId: uuid,
  accountId: uuid, subject: uuid, resourceId: uuid,
  authenticatedAt: privateDate, validUntil: privateDate,
};
const authorizedContext = {
  ...baseContext, authorizationPurpose: z.literal("sensitive_leader"),
  connectionId: uuid, connectionVersion: positive,
  environment: z.literal(MESSAGING_RESTORE_NODE_HOST.securityEnvironment), securityEpoch: uuid, secretRef: uuid,
};
const applicantContext = z.strictObject({ userId: uuid, sessionId: uuid, tribeId: uuid, requestId: uuid, purpose: z.literal("admission") });
const contact = z.strictObject({ type: z.literal("email"), value: z.string().regex(MESSAGING_RESTORE_NODE_HOST.syntheticEmailPattern) });
const applicant = { context: applicantContext, contact };
const phases: readonly [MessagingRestoreNodePhase, ...MessagingRestoreNodePhase[]] = ["baseline", "locked", "locked_original", "epoch", "retired_key", "reconcile", "reopen"];

/** This validates only the controller's private DTO, never PostgreSQL rows or provider responses. */
export const messagingRestoreNodeInputSchema = z.strictObject({
  operationId: uuid, cohortId: uuid, phase: z.enum(phases),
  expected: z.strictObject({ environment: z.literal(MESSAGING_RESTORE_NODE_HOST.securityEnvironment), securityEpoch: uuid, recoveryLocked: z.boolean() }),
  source: z.strictObject({
    context: z.strictObject({ ...authorizedContext, operation: z.literal(REAUTHENTICATION_OPERATION.readMessagingSenders) }),
    activationContext: z.strictObject({ ...authorizedContext, operation: z.literal(REAUTHENTICATION_OPERATION.activateMessagingConnection) }),
    retirementContext: z.strictObject({ ...authorizedContext, operation: z.literal(REAUTHENTICATION_OPERATION.disconnectMessagingConnection) }),
    creationContext: z.strictObject({ ...baseContext, operation: z.literal(REAUTHENTICATION_OPERATION.saveMessagingCredentials) }),
    ownEmail: z.string().regex(MESSAGING_RESTORE_NODE_HOST.syntheticEmailPattern),
    originalCredential: uuid, originalKeyIds: z.record(z.enum(MESSAGING_KEY_PURPOSE), uuid),
    activatedVersion: positive, policyVersion: positive, nonBypassRoleName: z.string().regex(MESSAGING_RESTORE_NODE_HOST.nonBypassRolePattern),
    applied: z.strictObject({ ...applicant, proofId: uuid, requestId: uuid, requestVersion: positive, applyBefore: privateDate }),
    available: z.strictObject({ ...applicant, proofId: uuid, applyBefore: privateDate }),
    queued: z.strictObject({ ...applicant, original: z.strictObject({ challengeId: uuid, deliveryId: uuid }), code: z.string().regex(MESSAGING_RESTORE_NODE_HOST.syntheticCodePattern), expiresAt: privateDate }),
    uncertainDeliveryId: uuid, manualTribeId: uuid,
    history: z.array(z.strictObject({ name: z.enum(["selected", "fresh", "expired", "late", "selected_with_candidate"]), tribeId: uuid, connectionId: uuid, candidateVersion: positive.nullable(), selectedVersion: positive.nullable() })).length(MESSAGING_RESTORE_NODE_HOST.historyCaseCount),
  }),
}).superRefine((input, context) => {
  const source = input.source, canonical = source.context;
  const accountScopes = [source.activationContext, source.retirementContext, source.creationContext];
  if (accountScopes.some((scope) => scope.actorUserId !== canonical.actorUserId || scope.sessionId !== canonical.sessionId || scope.accountId !== canonical.accountId || scope.subject !== canonical.subject || scope.tribeId !== canonical.tribeId)) context.addIssue({ code: "custom", message: "Private restore account scope mismatch" });
  if ([source.activationContext, source.retirementContext].some((scope) => scope.connectionId !== canonical.connectionId || scope.connectionVersion !== canonical.connectionVersion || scope.secretRef !== canonical.secretRef || scope.securityEpoch !== canonical.securityEpoch)) context.addIssue({ code: "custom", message: "Private restore resource scope mismatch" });
  if ([canonical, source.activationContext, source.retirementContext].some((scope) => scope.resourceId !== canonical.connectionId)) context.addIssue({ code: "custom", message: "Private restore authorization resource mismatch" });
  if ([source.applied, source.available, source.queued].some((candidate) => candidate.context.tribeId !== canonical.tribeId) || source.creationContext.resourceId !== canonical.tribeId || !source.history.some((candidate) => candidate.name === "selected" && candidate.tribeId === source.manualTribeId)) context.addIssue({ code: "custom", message: "Private restore fixture scope mismatch" });
  if (new Set(source.history.map((candidate) => candidate.name)).size !== MESSAGING_RESTORE_NODE_HOST.historyCaseCount || new Set(source.history.map((candidate) => candidate.connectionId)).size !== MESSAGING_RESTORE_NODE_HOST.historyCaseCount) context.addIssue({ code: "custom", message: "Private restore history incomplete" });
  const requiresLock = input.phase === MESSAGING_RESTORE_NODE_PHASE.locked || input.phase === MESSAGING_RESTORE_NODE_PHASE.lockedOriginal || input.phase === MESSAGING_RESTORE_NODE_PHASE.reconcile;
  const requiresOriginalEpoch = input.phase === MESSAGING_RESTORE_NODE_PHASE.baseline || input.phase === MESSAGING_RESTORE_NODE_PHASE.lockedOriginal || input.phase === MESSAGING_RESTORE_NODE_PHASE.retiredKey;
  if (input.expected.recoveryLocked !== requiresLock || (input.expected.securityEpoch === canonical.securityEpoch) !== requiresOriginalEpoch) context.addIssue({ code: "custom", message: "Private restore external control mismatch" });
});
export type MessagingRestoreNodeInput = z.output<typeof messagingRestoreNodeInputSchema>;
