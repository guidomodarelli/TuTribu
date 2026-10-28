/** Defines SC-021 independently from the concurrent hundred-account latency gate. */
import { z } from "zod";
import type { AdmissionFixtureShape } from "./admission-performance";
export const ADMISSION_SAMPLE = {
  participantCount: 1000, enabledParticipantCount: 800, entryCount: 10_000, batchSize: 100,
  environmentVariable: "ADMISSION_NODE_ADMISSION_SAMPLE", enabledValue: "1", kind: "deterministic_sample",
} as const satisfies AdmissionFixtureShape & { batchSize: number; environmentVariable: string; enabledValue: string; kind: string };
const integer = z.number().int().nonnegative();
const duration = z.number().nonnegative();
export const admissionNodeSampleSchema = z.object({
  kind: z.literal(ADMISSION_SAMPLE.kind), participants: integer, enabledContacts: integer, unlistedContacts: integer,
  admitted: integer, pending: integer, batchSize: integer, batchCount: integer,
  prepared: z.object({ accounts: integer, validEvidence: integer, enabledContacts: integer, unlistedContacts: integer, existingMembers: integer }).strict(),
  failures: z.array(z.object({ index: integer, code: z.string().min(1).max(128), sqlStates: z.array(z.string().regex(/^[0-9A-Z]{5}$/)), poolCheckoutTimedOut: z.boolean() }).strict()),
  batches: z.array(z.object({ participants: integer, admitted: integer, pending: integer, failures: integer }).strict()),
  facts: z.object({ entries: integer, requests: integer, basic_members: integer, deliveries: integer }).strict(),
  pool: z.object({ acquisitions: integer, releases: integer, errorReleases: integer, peakWaitingCount: integer, waitingAfter: integer, checkedOutAfter: integer }).strict(),
  setupDurationMs: duration, executionDurationMs: duration, realMessages: z.literal(0),
  nodeVersion: z.string().min(1), sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), bundleSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type AdmissionNodeSample = z.infer<typeof admissionNodeSampleSchema>;
