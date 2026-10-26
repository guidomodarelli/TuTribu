/** Bounds opt-in CPU sampling and its safe diagnostic output. */
export type AdmissionCpuSource = "application_bundle" | "node_runtime" | "other";
export const ADMISSION_CPU_SOURCES = ["application_bundle", "node_runtime", "other"] as const satisfies readonly AdmissionCpuSource[];
export const ADMISSION_CPU_PROFILE = {
  environmentVariable: "ADMISSION_NODE_PROFILE_CPU", enabledValue: "1", scope: "workload",
  samplingIntervalMicroseconds: 1000, maximumEntries: 25, maximumSymbolLength: 96,
  symbolPattern: /^[A-Za-z_$][A-Za-z0-9_$]*$/, anonymous: "anonymous", root: "(root)", idle: "(idle)", garbageCollector: "(garbage collector)", program: "(program)",
  invalidMessage: "AdmissionCpuProfile.project failed: invalid_profile", startUnavailable: "inspector_unavailable", stopUnavailable: "inspector_stop_unavailable",
} as const;
