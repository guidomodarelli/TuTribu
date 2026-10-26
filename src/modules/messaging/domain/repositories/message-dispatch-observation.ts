/** Defines private worker facts independently of host, SQL and provider payloads. @module message-dispatch-observation */

/** Confirmed outcomes and explicit uncertainty are independent of elapsed runtime. */
export type MessageDispatchCounters = { claimed: number; authorized: number; accepted: number; delivered: number; rejected: number; unknown: number; suppressed: number; quotaDeferred: number; unresolved: number; deadlineReached: boolean };

/** Closed timing dimensions; correlation and resource identifiers are never metric labels. */
export type MessageDispatchPhase = "claim" | "authorize" | "prepare" | "send" | "complete" | "late" | "defer";
/** Native backend start retains only hosting identity and the SQL clock, never keyrings. */
export type MessageDispatchRunStart = { runId: string; startedAt: Date; environment: string; securityEpoch: string; clockObservedAtMs?: number };
/** One actually settled phase; its ID deduplicates original evidence, including retained late work. */
export type MessageDispatchPhaseSample = { sampleId: string; tribeId: string; phase: MessageDispatchPhase; durationMs: number };
/** Selected counters for this tribe, not the aggregate counts of another tenant. */
export type MessageDispatchTribeRun = { tribeId: string; outcome: "completed" | "incomplete"; counters: MessageDispatchCounters };
/** Persistence remains private and uses current backend authority independently of the dispatcher. */
export interface MessageDispatchRunRecorder {
  /** @param runId - Fresh backend correlation identity. @returns The actual SQL start after current authorization. */
  begin(runId: string): Promise<MessageDispatchRunStart>;
  /** @param start - Original protected start. @param runs - Only actual claimed or native focal scopes. @param phases - Actually settled observations. @param budgetMs - Server-owned run bound. @returns After atomic records commit, or a controlled storage error. */
  finish(start: MessageDispatchRunStart, runs: readonly MessageDispatchTribeRun[], phases: readonly MessageDispatchPhaseSample[], budgetMs: number): Promise<void>;
  /** @param start - Original run, never a new execution. @param samples - Settled retained work for its original scopes. @returns After idempotently appending late evidence. */
  appendPhases(start: MessageDispatchRunStart, samples: readonly MessageDispatchPhaseSample[], lateScopes?: readonly MessageDispatchTribeRun[]): Promise<void>;
}
