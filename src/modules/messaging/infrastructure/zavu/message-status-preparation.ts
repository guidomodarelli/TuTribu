/** Keeps status credentials inside infrastructure; implementations must authorize the original stored connection. @module message-status-preparation */
import type { MessageStatusReference } from "../../domain/repositories/message-status-lookup";

/** One transient authorized lookup, never a module cache or a public DTO. */
export type PreparedMessageStatusQuery = Readonly<{ reference: MessageStatusReference; credential: string; senderId: string }>;

/** Native composition owns current identity, original storage scope, retirement and secret authorization. */
export interface MessageStatusPreparation {
  /** @param reference - Immutable original stored identity; not caller permission. @param signal - This exact lookup cancellation. @returns Transient material only after current native authorization. */
  prepare(reference: MessageStatusReference, signal: AbortSignal): Promise<PreparedMessageStatusQuery>;
}
