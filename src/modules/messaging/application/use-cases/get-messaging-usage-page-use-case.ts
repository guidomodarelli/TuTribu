/** Builds one current leader usage SSR state without initial browser fetching or write effects. @module get-messaging-usage-page-use-case */
import type { MessagingAccountProvider, MessagingAuthenticatedAccount } from "../../domain/repositories/messaging-repositories";
import type { ManageMessagingUsageUseCases } from "./manage-messaging-usage-use-cases";
import type { MessagingUsageCountryChoice } from "../commands/messaging-usage-draft";
import type { ResolveAdmissionTribeUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-tribe-use-case";
import { LiveAccountTribePageUseCase, type TribePageQuery } from "@/src/modules/shared/application/live-account-tribe-page-read";
import { MessagingUsageOperationError } from "../../domain/errors/messaging-usage-operation-error";
import { messagingPageFailures, type messagingRoutingFailure, type MessagingFailure } from "../results/messaging-errors";
import { messagingUsagePageStateSchema } from "../results/messaging-usage-page-state";

/** Own read ports and public choices are supplied by native composition; no provider catalog enters the use case. */
export class GetMessagingUsagePageUseCase extends LiveAccountTribePageUseCase<MessagingAuthenticatedAccount, { code: string }, ReturnType<typeof messagingRoutingFailure>, { ok: false; failure: MessagingFailure }> {
  /** @param accounts - Native current account. @param readers - Authorized usage and canonical routing. @param clock - Final render clock. @param countryChoices - Standard localized input options supplied by infrastructure. */
  constructor(accounts: MessagingAccountProvider, private readonly readers: { usage: Pick<ManageMessagingUsageUseCases, "read">; resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute"> }, clock: () => Date, private readonly countryChoices: readonly MessagingUsageCountryChoice[]) {
    super(accounts, readers, clock, messagingPageFailures(MessagingUsageOperationError));
  }
  /** @param query - Once-validated slug and correlation. @returns Safe current leader state or a contained failure, never an implicit initialization. */
  execute(query: TribePageQuery) {
    return this.readPage(query, async ({ tribeId, confirm }) => {
      const result = await this.readers.usage.read({ tribeId, requestId: query.requestId });
      if (!result.ok) return result;
      const { current, now } = await confirm();
      return { ok: true as const, value: messagingUsagePageStateSchema.parse({ kind: "ready", slug: query.slug, tribeId, viewerId: current.userId, renderedAt: now.toISOString(), usage: result.value, countryChoices: this.countryChoices }) };
    });
  }
}
