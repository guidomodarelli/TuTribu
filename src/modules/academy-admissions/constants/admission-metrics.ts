/** Names closed public aggregate dimensions independently of accounts, contacts or exception text. @module admission-metrics-constants */
import { MESSAGE_DISPATCH_OBSERVATION_PHASE } from "@/src/modules/messaging/constants/message-dispatch-observation";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import type { AdmissionMetricPhase, AdmissionMetricRunOperation, AdmissionMetricChannel } from "../domain/entities/admission-metric-dimensions";

/** Describes only fixed workflow phases; callers cannot publish arbitrary label maps. */
export const ADMISSION_METRIC_PHASE = { admission: "admission", review: "review", verification: "verification", dispatch: "dispatch", retention: "retention", notification: "notification", ...MESSAGE_DISPATCH_OBSERVATION_PHASE } as const satisfies Record<AdmissionMetricPhase, AdmissionMetricPhase>;
/** Identifies a real completed worker category without using job/resource/request identifiers as dimensions. */
export const ADMISSION_METRIC_RUN_OPERATION = { messagingDispatch: "messaging_dispatch", admissionExpiration: "admission_expiration", admissionRetention: "admission_retention", notificationMaterialization: "notification_materialization" } as const satisfies Readonly<Record<string, AdmissionMetricRunOperation>>;
/** Bounds one output series per supported contact channel. */
export const ADMISSION_METRIC_CHANNELS = [MESSAGING_PUBLIC_CHANNEL.email, MESSAGING_PUBLIC_CHANNEL.sms, MESSAGING_PUBLIC_CHANNEL.whatsapp] as const satisfies readonly AdmissionMetricChannel[];
/** Names the private SQL observation model; the migration remains authoritative for owner-only RLS and grants. */
export const ADMISSION_WORKER_RUN_DATABASE = {
  tableName: "academy_admission_worker_runs", primaryKey: "academy_admission_worker_runs_pkey", tribeForeignKey: "academy_admission_worker_runs_tribe_id_fkey",
  operationCheck: "academy_admission_worker_runs_operation_check", processedCheck: "academy_admission_worker_runs_processed_check", timeCheck: "academy_admission_worker_runs_check",
  historyIndex: "admission_worker_run_history_idx",
} as const;
