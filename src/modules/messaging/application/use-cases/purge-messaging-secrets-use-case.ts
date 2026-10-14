/** Validates every secret-retention ceiling before any candidate or envelope can change. @module purge-messaging-secrets-use-case */
import type { MessagingSecretRetention, MessagingSecretRetentionCommand, MessagingSecretRetentionResult } from "../../domain/repositories/messaging-secret-retention";
import { MessagingRetentionError } from "../../domain/errors/messaging-retention-error";
import { MESSAGING_SECRET_RETENTION } from "../../constants/messaging-retention";
import { MESSAGING_CANDIDATE_MAINTENANCE } from "../../constants/messaging-candidate-expiration";
import { SECRET_MATERIAL_PURGE } from "../../constants/secret-material-maintenance";
import { VERIFICATION_MATERIAL_PURGE_LIMIT } from "../../constants/verification-material";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";

/** Leaves atomicity, native clocks and current authority to the explicit private owner. */
export class PurgeMessagingSecretsUseCase {
  /** @param retention - Atomic backend retention owner without a sender or keyring. */
  constructor(private readonly retention: MessagingSecretRetention) {}

  /** @param input - Independent optional ceilings validated before work starts. @returns Counts after a confirmed batch. @throws MessagingRetentionError for invalid limits or an unconfirmed original operation. */
  async execute(input: Partial<MessagingSecretRetentionCommand> = {}): Promise<MessagingSecretRetentionResult> {
    const command = {
      candidateLimit: input.candidateLimit ?? MESSAGING_CANDIDATE_MAINTENANCE.defaultBatchSize,
      retiredSecretLimit: input.retiredSecretLimit ?? MESSAGING_SECRET_RETENTION.defaultRetiredSecretLimit,
      verificationLimit: input.verificationLimit ?? VERIFICATION_MATERIAL_PURGE_LIMIT.default,
    };
    if (!Number.isInteger(command.candidateLimit) || command.candidateLimit < 1 || command.candidateLimit > MESSAGING_CANDIDATE_MAINTENANCE.maximumBatchSize
      || !Number.isInteger(command.retiredSecretLimit) || command.retiredSecretLimit < 1 || command.retiredSecretLimit > SECRET_MATERIAL_PURGE.maximumBatchSize
      || !Number.isInteger(command.verificationLimit) || command.verificationLimit < 1 || command.verificationLimit > VERIFICATION_MATERIAL_PURGE_LIMIT.maximum) {
      throw new MessagingRetentionError(MESSAGING_ERROR_CODE.invalidInput);
    }
    return this.retention.purge(command);
  }
}
