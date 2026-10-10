/** Identifies an actual local dispatch observation deadline without attributing it to the provider. @module messaging-dispatch-deadline-error */
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGING_DISPATCH_STAGE } from "../../constants/messaging-dispatch";

/** Keeps the expired stage and observation duration private; the original attempt retains its identity and usage. */
export class MessagingDispatchDeadlineError extends Error {
  readonly code = MESSAGING_ERROR_CODE.transportTimeout;
  /** @param stage - Local preparation or actual RPC observation that reached its deadline. @param durationMs - Its bounded observation time, not a claim about provider execution. */
  constructor(readonly stage: typeof MESSAGING_DISPATCH_STAGE.prepare | typeof MESSAGING_DISPATCH_STAGE.send, readonly durationMs: number) {
    super(`MessageDispatch.${stage} failed: observation_deadline_exceeded`);
    this.name = "MessagingDispatchDeadlineError";
  }
}
