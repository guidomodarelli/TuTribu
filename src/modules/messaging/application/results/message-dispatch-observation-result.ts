/** Separates observed worker health from actual delivery outcome counters. @module message-dispatch-observation-result */
import type { MessageDispatchRunResult } from "./message-dispatch-result";
/** A failed observer does not erase a confirmed receipt or invent unresolved deliveries. */
export type MessageDispatchObservedRunResult = MessageDispatchRunResult & { workerOutcome: "completed" | "incomplete"; observationOutcome: "recorded" | "unavailable" };
