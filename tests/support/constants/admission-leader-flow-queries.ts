/** Bounds the native leader flow query measurement and its regression budget. @module admission-leader-flow-queries-constants */
export const ADMISSION_LEADER_FLOW_QUERY_VALIDATION = {
  samples: 3,
  sessionLifetimeMs: 3_600_000,
  observationPolls: 40,
  observationPollMs: 250,
  timeoutMs: 900_000,
  reportEnvironmentVariable: "ADMISSION_LEADER_FLOW_QUERY_REPORT",
} as const;

/** Median transactions and statements per request measured after the standalone account projection (queries keep two or three statements of headroom for pool warm-up); a change that adds round trips fails here. */
export const ADMISSION_LEADER_FLOW_QUERY_BUDGET = {
  initialize_policy: { transactions: 4, queries: 54 },
  save_policy: { transactions: 4, queries: 54 },
  page_inbox: { transactions: 23, queries: 226 },
  page_rules: { transactions: 13, queries: 132 },
  page_notifications: { transactions: 7, queries: 58 },
  page_usage: { transactions: 6, queries: 37 },
  page_connections: { transactions: 11, queries: 67 },
  read_policy: { transactions: 5, queries: 65 },
  read_policy_preflight: { transactions: 4, queries: 39 },
  activate_policy: { transactions: 4, queries: 94 },
} as const satisfies Record<string, { transactions: number; queries: number }>;
