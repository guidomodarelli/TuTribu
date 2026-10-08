/** Defines portable sender/runtime ports without SDK types, hosting APIs or plaintext cache. @module message-delivery-sender */
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessageDeliveryReceipt } from "@/src/modules/messaging/domain/repositories/message-delivery-repository";
import type { MESSAGING_DISPATCH_STAGE } from "@/src/modules/messaging/constants/messaging-dispatch";

/** Represents one transient prepared operation; private material stays inside its adapter closure. */
export interface PreparedMessageDeliverySender {
  /** @param signal - This exact RPC deadline/cancellation. @returns Original own transport evidence; no preparation, identity substitution or retry occurs. */
  send(signal: AbortSignal): Promise<Omit<MessageDeliveryReceipt, "context">>;
}
/** Sender adapters revalidate current marker/context during local preparation, before the RPC budget starts. */
export interface MessageDeliverySender {
  /** @param context - Confirmed original marker and scope. @param signal - Remaining run deadline/cancellation. @returns One prepared original operation, without starting its RPC. */
  prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedMessageDeliverySender>;
}
/** Bounds belong to the worker; they never authorize an arbitrary browser send. */
export type MessagingDispatchSettings = { requestTimeoutMs: number; runBudgetMs: number; leaseSeconds: number; concurrency: number; batchLimit: number };
/** Private diagnostics retain actual causes and minimum original identities only. */
export type MessagingDispatchDiagnostic = { stage: (typeof MESSAGING_DISPATCH_STAGE)[keyof typeof MESSAGING_DISPATCH_STAGE]; deliveryId?: string; attemptId?: string; cause: unknown };
/** Host composition owns late work lifetime; application does not import after/waitUntil. */
export interface MessagingDispatchRuntime {
  /** @returns Current runtime time in milliseconds, sampled after awaits. */
  now(): number;
  /** @returns A fresh backend-only opaque lease/correlation identity. */
  createId(): string;
  /** @param work - Original late receipt work without another send. @returns Nothing after host retention is registered. */
  defer(work: Promise<void>): void;
  /** @param diagnostic - Actual private failure and minimum own identity. @returns Nothing after reporting at the worker boundary. */
  report(diagnostic: MessagingDispatchDiagnostic): void;
}
