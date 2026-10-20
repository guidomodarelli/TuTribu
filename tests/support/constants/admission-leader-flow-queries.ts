/** Bounds the native leader flow query measurement and its regression budget. @module admission-leader-flow-queries-constants */
export const ADMISSION_LEADER_FLOW_QUERY_VALIDATION = {
  samples: 3,
  sessionLifetimeMs: 3_600_000,
  observationPolls: 40,
  observationPollMs: 250,
  timeoutMs: 900_000,
  reportEnvironmentVariable: "ADMISSION_LEADER_FLOW_QUERY_REPORT",
} as const;

/** Median transactions and statements per request measured after the leader flow optimization (queries keep two statements of headroom for pool warm-up); a change that adds round trips fails here. */
export const ADMISSION_LEADER_FLOW_QUERY_BUDGET = {
  initialize_policy: { transactions: 7, queries: 82 },
  save_policy: { transactions: 7, queries: 81 },
  page_inbox: { transactions: 54, queries: 434 },
  page_rules: { transactions: 25, queries: 249 },
  page_notifications: { transactions: 13, queries: 90 },
  page_usage: { transactions: 14, queries: 86 },
  page_connections: { transactions: 30, queries: 177 },
  read_policy: { transactions: 9, queries: 130 },
  read_policy_preflight: { transactions: 7, queries: 63 },
  activate_policy: { transactions: 7, queries: 120 },
} as const satisfies Record<string, { transactions: number; queries: number }>;
