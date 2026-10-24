/** Reports only confirmed own outcomes and explicitly unresolved work, not a global success flag. @module message-dispatch-result */
import type { MessageDispatchCounters } from "../../domain/repositories/message-dispatch-observation";
/** Elapsed observation includes persistence; counters remain independent of delivery success. */
export type MessageDispatchRunResult = MessageDispatchCounters & { elapsedMs: number };
