/** Builds one current leader usage SSR state without initial browser fetching or write effects. @module get-messaging-usage-page-use-case */
import type { MessagingAccountProvider } from "../../domain/repositories/messaging-repositories";
import type { ManageMessagingUsageUseCases } from "./manage-messaging-usage-use-cases";
import type { MessagingUsageCountryChoice } from "../commands/messaging-usage-draft";
import type { ResolveAdmissionTribeUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-tribe-use-case";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import { MessagingUsageOperationError } from "../../domain/errors/messaging-usage-operation-error";
import { messagingFailure } from "../results/messaging-errors";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { messagingUsagePageStateSchema } from "../results/messaging-usage-page-state";

/** Own read ports and public choices are supplied by native composition; no provider catalog enters the use case. */
export class GetMessagingUsagePageUseCase {
  /** @param accounts - Native current account. @param readers - Authorized usage and canonical routing. @param clock - Final render clock. @param countryChoices - Standard localized input options supplied by infrastructure. */
  constructor(private readonly accounts: MessagingAccountProvider, private readonly readers: { usage: Pick<ManageMessagingUsageUseCases, "read">; resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute"> }, private readonly clock: () => Date, private readonly countryChoices: readonly MessagingUsageCountryChoice[]) {}
  /** @param query - Once-validated slug and correlation. @returns Safe current leader state or a contained failure, never an implicit initialization. */
  async execute(query: { slug: string; requestId: string }) {
    try {
      const first = await this.accounts.getAuthenticatedAccount();
      if (!first || !isAuthenticatedSessionLive(first.session.expiresAt, this.clock())) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
      const tribe = await this.readers.resolveTribe.execute(query);
      if (!tribe.ok) return { ok: false as const, failure: messagingFailure(Object.values(MESSAGING_ERROR_CODE).find((code) => code === tribe.failure.code) ?? MESSAGING_ERROR_CODE.unexpectedFailure, { cause: tribe.failure }) };
      const result = await this.readers.usage.read({ tribeId: tribe.value.tribeId, requestId: query.requestId });
      if (!result.ok) return result;
      const current = await this.accounts.getAuthenticatedAccount(), now = this.clock();
      if (!current || current.userId !== first.userId || current.session.id !== first.session.id || !isAuthenticatedSessionLive(current.session.expiresAt, now)) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
      return { ok: true as const, value: messagingUsagePageStateSchema.parse({ kind: "ready", slug: query.slug, tribeId: tribe.value.tribeId, viewerId: current.userId, renderedAt: now.toISOString(), usage: result.value, countryChoices: this.countryChoices }) };
    } catch (error) { return { ok: false as const, failure: messagingFailure(error instanceof MessagingUsageOperationError ? error.code : MESSAGING_ERROR_CODE.unexpectedFailure, { cause: error }) }; }
  }
}
