/** Own private storage and fixed dimensions for actual dispatch observations. @module message-dispatch-observation-constants */
import type { MessageDispatchPhase } from "../domain/repositories/message-dispatch-observation";
/** Timing belongs to an actual call, without identifying its recipient, account or exception. */
export const MESSAGE_DISPATCH_OBSERVATION_PHASE = { claim: "claim", authorize: "authorize", prepare: "prepare", send: "send", complete: "complete", late: "late", defer: "defer" } as const satisfies Record<MessageDispatchPhase, MessageDispatchPhase>;
/** Closed run completion is independent of a provider acceptance or delivery. */
export const MESSAGE_DISPATCH_RUN_OUTCOME = { completed: "completed", incomplete: "incomplete" } as const;
/** Persistence availability cannot substitute for the delivery counters. */
export const MESSAGE_DISPATCH_OBSERVATION_OUTCOME = { recorded: "recorded", unavailable: "unavailable" } as const;
/** A bounded observation collector stops acquiring new obligations before discarding evidence. */
export const MESSAGE_DISPATCH_OBSERVATION_LIMIT = { phaseSamples: 10_000 } as const;
/** Physical names belong to the owning private projection, separate from provider configuration. */
export const MESSAGE_DISPATCH_OBSERVATION_DATABASE = { runs: "messaging_dispatch_runs", phases: "messaging_dispatch_phase_samples", historyIndex: "messaging_dispatch_run_history_idx", phaseIndex: "messaging_dispatch_phase_scope_idx", outcomeCheck: "messaging_dispatch_runs_outcome_check", countersCheck: "messaging_dispatch_runs_counters_check", timeCheck: "messaging_dispatch_runs_check", phaseCheck: "messaging_dispatch_phase_samples_phase_check", durationCheck: "messaging_dispatch_phase_samples_duration_ms_check" } as const;
