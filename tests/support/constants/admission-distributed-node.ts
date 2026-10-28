/** Defines one fixed, reproducible hundred-applicant workload across four owned Node hosts. */
import { z } from "zod";
import type { AdmissionPerformanceActor, AdmissionPerformanceConfirmation } from "../run-admission-performance-workload";
import type { AdmissionNodeMeasurement } from "./admission-node-host";
import { ADMISSION_PERFORMANCE } from "./admission-performance";

export const ADMISSION_DISTRIBUTED_NODE = {
  functionCount: 4,
  poolMaximum: 25,
  transactionsPerParticipant: 3,
  computeUnits: 4,
  barrierPollIntervalMs: 100,
  barrierTimeoutMs: 60_000,
  barrierReleaseDelayMs: 500,
  clockArithmeticToleranceMs: 1,
  functionSlugPrefix: "admshard",
  functionNonceCharacters: 8,
  bundleDirectoryPrefix: "admission-distributed-node-",
  entrypoint: "tests/runtime/admission-distributed-node-host/index.ts",
  coordinator: "tests/support/run-admission-distributed-performance.ts",
  testFile: "tests/performance/academy-admissions-distributed-node-host.test.ts",
  supportMigration: "tests/support/sql/20261018174500_create_admission_distributed_probe.sql",
  privateInputVariable: "ADMISSION_DISTRIBUTED_PRIVATE_INPUT",
  environmentAliasPrefix: "ADMISSION_DISTRIBUTED_DEPLOY_",
  enabledVariable: "RUN_ADMISSION_DISTRIBUTED_NODE_HOST_TESTS",
  enabledValue: "1",
  reportFileVariable: "ADMISSION_DISTRIBUTED_NODE_REPORT_FILE",
  cliProfile: "DEFAULT",
  configPackage: "@neon/config/v1",
  configFilename: "neon.ts",
  operation: "native_distributed_admission_workload",
} as const;

/** Private server input; no session token or caller-selected cohort may cross this boundary. */
export type AdmissionDistributedHostInput = {
  nodeIndex: number;
  tribeId: string;
  leaderUserId: string;
  leaderEmail: string;
  participants: AdmissionPerformanceActor[];
};

/** Brackets each original operation against one server-clock observation. */
export type AdmissionDistributedConfirmation = AdmissionPerformanceConfirmation & {
  startedLowerMs: number;
  startedUpperMs: number;
  finishedLowerMs: number;
  finishedUpperMs: number;
};

/** Safe own measurement stored by the producer; it contains no private host input. */
export type AdmissionDistributedNodeMeasurement = {
  nodeIndex: number;
  nodeVersion: string;
  sourceCommit: string;
  bundleSha256: string;
  participants: number;
  admitted: number;
  pending: number;
  p95Ms: number | null;
  peakInFlight: number;
  pool: AdmissionNodeMeasurement["pool"];
  confirmations: AdmissionDistributedConfirmation[];
  clockBracketMs: number;
  wallDurationMs: number;
  eventLoopP95Ms: number;
  configurationDurationMs: number;
  warmupDurationMs: number;
  barrierDurationMs: number;
  networkQueryP95Ms: number | null;
  networkSamples: number;
  realMessages: 0;
};

const nonnegative = z.number().nonnegative();
const integer = nonnegative.int();
const actorSchema = z.object({ index: integer.max(ADMISSION_PERFORMANCE.participantCount - 1), userId: z.uuid(), sessionId: z.uuid(), email: z.email() }).strict();
export const admissionDistributedHostInputSchema = z.object({
  nodeIndex: integer.max(ADMISSION_DISTRIBUTED_NODE.functionCount - 1), tribeId: z.uuid(), leaderUserId: z.uuid(), leaderEmail: z.email(),
  participants: z.array(actorSchema).length(ADMISSION_DISTRIBUTED_NODE.poolMaximum),
}).strict().refine((input) => new Set(input.participants.map((participant) => participant.index)).size === ADMISSION_DISTRIBUTED_NODE.poolMaximum && input.participants.every((participant) => participant.index % ADMISSION_DISTRIBUTED_NODE.functionCount === input.nodeIndex), { message: "Owned host actor partition is inconsistent" }) satisfies z.ZodType<AdmissionDistributedHostInput>;

const confirmationSchema = z.object({ index: integer, durationMs: nonnegative, startedOffsetMs: nonnegative, outcome: z.string().nullable(), failure: z.string().nullable(), startedLowerMs: z.number(), startedUpperMs: z.number(), finishedLowerMs: z.number(), finishedUpperMs: z.number() }).strict();
export const admissionDistributedNodeMeasurementSchema = z.object({
  nodeIndex: integer, nodeVersion: z.string(), sourceCommit: z.string(), bundleSha256: z.string(), participants: integer, admitted: integer, pending: integer, p95Ms: nonnegative.nullable(), peakInFlight: integer,
  pool: z.object({ maximum: integer, acquisitions: integer, releases: integer, errorReleases: integer, peakWaitingCount: integer, peakTotalCount: integer, waitingAfter: integer, checkedOutAfter: integer }).strict(),
  confirmations: z.array(confirmationSchema), clockBracketMs: nonnegative, wallDurationMs: nonnegative, eventLoopP95Ms: nonnegative,
  configurationDurationMs: nonnegative, warmupDurationMs: nonnegative, barrierDurationMs: nonnegative, networkQueryP95Ms: nonnegative.nullable(), networkSamples: integer, realMessages: z.literal(0),
}).strict() satisfies z.ZodType<AdmissionDistributedNodeMeasurement>;
