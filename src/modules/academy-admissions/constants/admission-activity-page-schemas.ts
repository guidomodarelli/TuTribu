/** Guards UI inputs and selected own snapshot DTOs without validating PostgreSQL or SDK responses. @module admission-activity-page-schemas */
import { z } from "zod";
import { admissionActivityPageSchema, admissionActivityQuerySchema } from "./admission-activity-schemas";
import { admissionMetricsResultSchema } from "./admission-metrics-schemas";
import { admissionTribeParamsSchema } from "./admission-route-input";
import { ADMISSION_QUERY_LIMIT } from "./admission-public-contract";
import { ADMISSION_ACTIVITY_RESOURCE } from "./admission-activity";
import { ADMISSION_ACTIVITY_PAGE_KIND } from "./admission-activity-browser";
import { messagingUsagePolicyStateSchema } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import type { AdmissionActivityPageSelection, AdmissionActivityReadyPageState } from "../application/results/admission-activity-page-state";

/** Native routing and user-selected filters are validated together before opening composition. */
export const admissionActivityPageInputSchema = z.strictObject({ params: admissionTribeParamsSchema, query: admissionActivityQuerySchema });
/** Only serialized selection is exposed; the exact database cursor remains opaque to the UI. */
export const admissionActivityPageSelectionSchema: z.ZodType<AdmissionActivityPageSelection> = z.strictObject({
  limit: z.int().positive().max(ADMISSION_QUERY_LIMIT.maximumPageSize),
  resourceType: z.enum(ADMISSION_ACTIVITY_RESOURCE).optional(), resourceId: z.uuid().optional(),
  cursor: z.string().max(ADMISSION_QUERY_LIMIT.cursorCharacters).optional(),
});
/** A composed own DTO cannot mix the metrics or history of another tribe. */
export const admissionActivityReadyPageStateSchema: z.ZodType<AdmissionActivityReadyPageState> = z.strictObject({
  kind: z.literal(ADMISSION_ACTIVITY_PAGE_KIND.ready), slug: z.string().min(1), tribeId: z.uuid(), viewerId: z.string().min(1), renderedAt: z.iso.datetime({ precision: 3 }),
  selection: admissionActivityPageSelectionSchema, activity: admissionActivityPageSchema,
  metrics: admissionMetricsResultSchema, currentUsage: messagingUsagePolicyStateSchema,
}).refine((value) => value.activity.tribeId === value.tribeId && value.metrics.tribeId === value.tribeId);
