/** Bounds the native leader flow query measurement and its regression budget. @module admission-leader-flow-queries-constants */
export const ADMISSION_LEADER_FLOW_QUERY_VALIDATION = {
  samples: 3,
  sessionLifetimeMs: 3_600_000,
  observationPolls: 40,
  observationPollMs: 250,
  timeoutMs: 900_000,
  reportEnvironmentVariable: "ADMISSION_LEADER_FLOW_QUERY_REPORT",
} as const;

/** Median transactions and statements per request measured after the consolidated SQL messaging guards; Rules and the leader policy read include the activation preparation evaluated since 5473d9ad (queries keep two statements of headroom for pool warm-up); a change that adds round trips fails here. */
export const ADMISSION_LEADER_FLOW_QUERY_BUDGET = {
  initialize_policy: { transactions: 7, queries: 63 },
  save_policy: { transactions: 7, queries: 63 },
  page_inbox: { transactions: 51, queries: 310 },
  page_rules: { transactions: 25, queries: 168 },
  page_notifications: { transactions: 13, queries: 75 },
  page_usage: { transactions: 12, queries: 57 },
  page_connections: { transactions: 22, queries: 100 },
  read_policy: { transactions: 9, queries: 77 },
  read_policy_preflight: { transactions: 7, queries: 48 },
  activate_policy: { transactions: 7, queries: 102 },
} as const satisfies Record<string, { transactions: number; queries: number }>;
