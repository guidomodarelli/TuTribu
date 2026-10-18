/** Bounds and names the authenticated ephemeral Node workload contract. */
import { z } from "zod";
export type AdmissionNodeRunState = "prepared" | "running" | "completed" | "failed";
export const ADMISSION_NODE_RUN_STATE = { prepared: "prepared", running: "running", completed: "completed", failed: "failed" } as const satisfies Record<string, AdmissionNodeRunState>;
export const ADMISSION_NODE_HOST = {
  runPath: "/run", statusPath: "/status", tokenPrefix: "Bearer ", tokenBytes: 32, tokenCharacters: 43,
  tokenDigestPattern: /^[a-f0-9]{64}$/, nodeVersionPattern: /^24\./,
  deploymentTimeoutMs: 120_000, requestTimeoutMs: 300_000, nativeCaseTimeoutMs: 900_000, capabilityLifetimeMs: 600_000,
  sourceCommitVariable: "ADMISSION_NODE_SOURCE_COMMIT", branchVariable: "ADMISSION_NODE_BRANCH_NAME", operationVariable: "ADMISSION_NODE_OPERATION_ID", tokenDigestVariable: "ADMISSION_NODE_TOKEN_SHA256", expiresVariable: "ADMISSION_NODE_EXPIRES_AT",
  bundleDigestVariable: "ADMISSION_NODE_BUNDLE_SHA256", branchIdentityVariable: "NEON_BRANCH", directDatabaseVariable: "DATABASE_URL_UNPOOLED", databaseVariable: "DATABASE_URL",
  operation: "native_admission_node_workload", bundleDirectoryPrefix: "admission-node-bundle-", functionSlugPrefix: "admload",
  computeUnits: 2,
  computeUnitsVariable: "ADMISSION_NODE_COMPUTE_UNITS",
} as const;
const nonnegative = z.number().finite().nonnegative();
const integer = z.number().int().nonnegative();
export const admissionNodeMeasurementSchema = z.object({
  warmupDurationMs: nonnegative, setupDurationMs: nonnegative,
  networkQueryP95Ms: nonnegative.nullable(), networkSamples: integer, participants: integer,
  admitted: integer, pending: integer,
  failures: z.array(z.object({ index: integer, code: z.string().min(1).max(128), sqlStates: z.array(z.string().regex(/^[0-9A-Z]{5}$/)), poolCheckoutTimedOut: z.boolean() }).strict()),
  p95Ms: nonnegative.nullable(), targetMs: nonnegative, peakInFlight: integer,
  pool: z.object({ maximum: integer, acquisitions: integer, releases: integer, errorReleases: integer, peakWaitingCount: integer, peakTotalCount: integer, waitingAfter: integer, checkedOutAfter: integer }).strict(),
  eventLoopP95Ms: nonnegative,
  facts: z.object({ entries: integer, requests: integer, basic_members: integer, deliveries: integer }).strict(),
  realMessages: z.literal(0), nodeVersion: z.string().regex(ADMISSION_NODE_HOST.nodeVersionPattern),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), bundleSha256: z.string().regex(ADMISSION_NODE_HOST.tokenDigestPattern),
  diagnostics: z.object({ wallDurationMs: nonnegative, cpuUserMs: nonnegative, cpuSystemMs: nonnegative, eventLoopActiveMs: nonnegative, eventLoopIdleMs: nonnegative, eventLoopUtilization: nonnegative.max(1), accountTransactions: integer, commandTransactions: integer, accountTransactionP95Ms: nonnegative.nullable(), commandTransactionP95Ms: nonnegative.nullable(), admittedP95Ms: nonnegative.nullable(), pendingP95Ms: nonnegative.nullable() }).strict(),
}).strict();
export const admissionNodeStatusSchema = z.object({ operationId: z.uuid(), state: z.enum(["prepared", "running", "completed", "failed"]), measurement: admissionNodeMeasurementSchema.nullable() }).strict();
export type AdmissionNodeStatus = z.infer<typeof admissionNodeStatusSchema>;
export type AdmissionNodeMeasurement = z.infer<typeof admissionNodeMeasurementSchema>;
export const admissionNodeConfigurationSchema = z.object({
  branchName: z.string().min(1), operationId: z.uuid(), tokenSha256: z.string().regex(ADMISSION_NODE_HOST.tokenDigestPattern),
  expiresAt: z.coerce.number().int().positive(), sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), bundleSha256: z.string().regex(ADMISSION_NODE_HOST.tokenDigestPattern),
}).strict();
export type AdmissionNodeConfiguration = z.infer<typeof admissionNodeConfigurationSchema>;
