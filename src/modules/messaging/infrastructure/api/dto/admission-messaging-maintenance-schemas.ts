/** Validates only the maintenance route's own input and public DTO; never PostgreSQL or provider payloads. @module admission-messaging-maintenance-schemas */
import { z } from "zod";
import { ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE, ADMISSION_MESSAGING_MAINTENANCE_METRIC, ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION, ADMISSION_MESSAGING_MAINTENANCE_PHASE, ADMISSION_MESSAGING_MAINTENANCE_PHASES, ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS, ADMISSION_MESSAGING_MAINTENANCE_REASON, ADMISSION_MESSAGING_MAINTENANCE_RUNNING_PHASE, ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS } from "../../../constants/admission-messaging-maintenance";

/** No browser-supplied limits, clocks, resources, destinations or configuration are accepted. */
export const admissionMessagingMaintenanceInputSchema = z.strictObject({});
/** Restricts own counts and elapsed times without schema-validating a backend response. */
const nonNegativeIntegerSchema = z.number().int().nonnegative();
/** Copies no adapter/provider fields into a public operational metric. */
const metricSchema = z.strictObject({ key: z.enum(ADMISSION_MESSAGING_MAINTENANCE_METRIC), value: nonNegativeIntegerSchema });
/** A repeated own counter key would make the visible result ambiguous. */
const metricsSchema = z.array(metricSchema).max(Object.keys(ADMISSION_MESSAGING_MAINTENANCE_METRIC).length).refine((metrics) => new Set(metrics.map((metric) => metric.key)).size === metrics.length, { message: "Own maintenance metric keys must be unique" });
/** Exposes phase processing separately from its settled result and observation. */
const phaseSchema = z.strictObject({ phase: z.enum(ADMISSION_MESSAGING_MAINTENANCE_PHASE), status: z.enum({ ...ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS, running: ADMISSION_MESSAGING_MAINTENANCE_RUNNING_PHASE }), reason: z.enum(ADMISSION_MESSAGING_MAINTENANCE_REASON).nullable(), metrics: metricsSchema, hasRemainingWork: z.boolean(), startedAtMilliseconds: nonNegativeIntegerSchema.nullable(), durationMilliseconds: nonNegativeIntegerSchema.nullable(), observation: z.enum(ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION), late: z.boolean() });
/** Unknown queue health is represented explicitly, not as a successful empty queue. */
const healthSchema = z.strictObject({ available: z.boolean(), observedAtMilliseconds: nonNegativeIntegerSchema.nullable(), lastSuccessfulRunAtMilliseconds: nonNegativeIntegerSchema.nullable(), oldestQueuedAtMilliseconds: nonNegativeIntegerSchema.nullable(), queueAgeMilliseconds: nonNegativeIntegerSchema.nullable() }).superRefine((health, context) => {
  if (health.available && health.observedAtMilliseconds === null || !health.available && [health.observedAtMilliseconds, health.lastSuccessfulRunAtMilliseconds, health.oldestQueuedAtMilliseconds, health.queueAgeMilliseconds].some((value) => value !== null) || (health.oldestQueuedAtMilliseconds === null) !== (health.queueAgeMilliseconds === null)) context.addIssue({ code: "custom", message: "Own maintenance health is contradictory" });
});
/** This is the application's own public response contract, including safe Spanish copy and correlation. */
export const admissionMessagingMaintenanceResponseSchema = z.strictObject({ runId: z.uuid().nullable(), status: z.enum(ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS), newRunStarted: z.boolean(), deadlineReached: z.boolean(), observation: z.enum({ recorded: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded, pending: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.pending, unavailable: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable }), phases: z.array(phaseSchema).length(ADMISSION_MESSAGING_MAINTENANCE_PHASES.length), health: healthSchema, message: z.string().min(1), requestId: z.string().min(1) }).superRefine((result, context) => {
  if (new Set(result.phases.map((phase) => phase.phase)).size !== ADMISSION_MESSAGING_MAINTENANCE_PHASES.length || result.newRunStarted && result.runId === null || result.status === ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.completed && (result.deadlineReached || !result.health.available || result.health.lastSuccessfulRunAtMilliseconds === null || result.observation !== ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded || result.phases.some((phase) => phase.status !== ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.completed || phase.observation !== ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded))) context.addIssue({ code: "custom", message: "Own maintenance result is contradictory" });
});
/** Boundary errors carry only owned code, safe Spanish copy and bounded private correlation. */
export const admissionMessagingMaintenanceErrorSchema = z.strictObject({ code: z.enum(ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE), message: z.string().min(1), requestId: z.string().min(1) });
