/** Reports only confirmed own outcomes and explicitly unresolved work, not a global success flag. @module message-dispatch-result */
export type MessageDispatchRunResult = {
  claimed: number; authorized: number; accepted: number; delivered: number; rejected: number; unknown: number;
  suppressed: number; quotaDeferred: number; unresolved: number; deadlineReached: boolean; elapsedMs: number;
};
