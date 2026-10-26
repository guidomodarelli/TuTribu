/** Starts or inspects one bounded private recovery batch without retries or automatic reopening. @module reconcile-messaging-recovery-use-case */
import { normalizeUuid } from "@/src/modules/shared/application/validation/uuid";
import type { MessagingRecovery, MessagingRecoveryCommand, MessagingRecoveryResult } from "../../domain/repositories/messaging-recovery";
import { MessagingRecoveryError } from "../../domain/errors/messaging-recovery-error";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGING_RECOVERY } from "../../constants/messaging-recovery";

/** Accepts operator-selected deployment scope; no epoch or authority is reconstructed from PostgreSQL. */
export type MessagingRecoveryInput = Omit<MessagingRecoveryCommand, "limit"> & { limit?: number };

/** Keeps scope validation separate from native authority and current external-state checks. */
export class ReconcileMessagingRecoveryUseCase {
  /** @param recovery - Explicit private owner; there is no permissive default or provider adapter. */
  constructor(private readonly recovery: MessagingRecovery) {}

  /** @param input - Own backend command. @returns A normalized bounded scope. @throws MessagingRecoveryError before private effects for an invalid scope, unchanged epoch or bounds. */
  private command(input: MessagingRecoveryInput): MessagingRecoveryCommand {
    const tribeId = normalizeUuid(input.tribeId), environment = input.environment.trim(), securityEpoch = input.securityEpoch.trim(), sourceSecurityEpoch = input.sourceSecurityEpoch.trim();
    const limit = input.limit ?? MESSAGING_RECOVERY.defaultBatchSize;
    if (!tribeId || !environment || !securityEpoch || !sourceSecurityEpoch || securityEpoch === sourceSecurityEpoch || !Number.isInteger(limit) || limit < 1 || limit > MESSAGING_RECOVERY.maximumBatchSize) throw new MessagingRecoveryError(MESSAGING_ERROR_CODE.invalidInput);
    return { tribeId, environment, securityEpoch, sourceSecurityEpoch, limit };
  }

  /** @param input - Explicit replacement scope and optional per-family ceiling. @returns Only the original confirmed batch; incomplete work is retained, never retried automatically. */
  async execute(input: MessagingRecoveryInput): Promise<MessagingRecoveryResult> { return this.recovery.reconcile(this.command(input)); }

  /** @param input - Same explicit scope after a completed or unconfirmed original. @returns Current remaining work only; no mutation, inferred original counts or recovery-lock release. */
  async inspect(input: MessagingRecoveryInput): Promise<{ remaining: boolean }> { return this.recovery.inspect(this.command(input)); }
}
