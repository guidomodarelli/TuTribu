import { buildAuthModule } from "./auth/setup";
import { BetterAuthSessionRepository } from "./auth/infrastructure/repositories/better-auth-session-repository";
import { buildTribesModule } from "./tribes/setup";
import { PostgresTribeCreationRepository } from "./tribes/infrastructure/repositories/postgres-tribe-creation-repository";
import { PostgresTribeCreatorWhitelistRepository } from "./tribes/infrastructure/repositories/postgres-tribe-creator-whitelist-repository";
import { PostgresTribeInvitationRepository } from "./tribes/infrastructure/repositories/postgres-tribe-invitation-repository";
import { PostgresTribeReadRepository } from "./tribes/infrastructure/repositories/postgres-tribe-read-repository";
import { PostgresMessageRoundRepository } from "./messages/infrastructure/repositories/postgres-message-round-repository";
import { PostgresTribeChannelRepository } from "./messages/infrastructure/repositories/postgres-tribe-channel-repository";
import { PostgresMessageMutationRepository } from "./messages/infrastructure/repositories/postgres-message-mutation-repository";
import { buildMessagesModule } from "./messages/setup";
import { buildEventsModule } from "./events/setup";
import { PostgresTribeEventRepository } from "./events/infrastructure/repositories/postgres-tribe-event-repository";
import { buildSubscriptionsModule } from "./subscriptions/setup";
import { PostgresTribeMemberSubscriptionRepository } from "./subscriptions/infrastructure/repositories/postgres-tribe-member-subscription-repository";
import { PostgresTribePaymentIntegrationRepository } from "./subscriptions/infrastructure/repositories/postgres-tribe-payment-integration-repository";
import { PostgresTribeSubscriptionPriceRepository } from "./subscriptions/infrastructure/repositories/postgres-tribe-subscription-price-repository";
import {
  createMercadoPagoPreapprovalPlan,
  createMercadoPagoPreapprovalSubscription,
  getMercadoPagoPreapprovalStatus,
} from "./subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";
import { createServerDatabaseClient } from "./shared/infrastructure/database/server-database-client";
import { resolvePublicAppBaseUrl } from "./shared/infrastructure/backend/public-app-base-url";

type RequestScopedDatabaseClient = Awaited<ReturnType<typeof createServerDatabaseClient>>;
type RequestModuleContextOverrides = {
  mercadoPagoWebhookVerified?: boolean;
};

export async function createRequestModules(
  contextOverrides: RequestModuleContextOverrides = {}
) {
  const databaseClient = await createServerDatabaseClient();
  const { getRequestAuthContext } = await import(
    "./auth/infrastructure/better-auth/server-auth-context"
  );
  const authContext = await getRequestAuthContext();
  const executeWithRequestContext = <T>(
    callback: Parameters<RequestScopedDatabaseClient["withRequestContext"]>[1]
  ) =>
    databaseClient.withRequestContext(
      {
        ...authContext,
        ...contextOverrides,
      },
      callback
    ) as Promise<T>;

  return {
    auth: buildAuthModule({
      authSessionRepository: new BetterAuthSessionRepository(),
    }),
    tribes: buildTribesModule({
      tribeReadRepository: new PostgresTribeReadRepository(
        executeWithRequestContext
      ),
      tribeCreationRepository: new PostgresTribeCreationRepository(
        executeWithRequestContext
      ),
      tribeCreatorWhitelistRepository:
        new PostgresTribeCreatorWhitelistRepository(executeWithRequestContext),
      tribeInvitationRepository: new PostgresTribeInvitationRepository(
        executeWithRequestContext
      ),
    }),
    messages: buildMessagesModule({
      tribeChannelRepository: new PostgresTribeChannelRepository(
        executeWithRequestContext
      ),
      messageReplyRepository: new PostgresMessageMutationRepository(
        executeWithRequestContext
      ),
      messageCreationRepository: new PostgresMessageMutationRepository(
        executeWithRequestContext
      ),
      messageRoundReadRepository: new PostgresMessageRoundRepository(executeWithRequestContext),
      messageReactionRepository: new PostgresMessageMutationRepository(
        executeWithRequestContext
      ),
    }),
    events: buildEventsModule({
      tribeEventRepository: new PostgresTribeEventRepository(
        executeWithRequestContext
      ),
    }),
    subscriptions: buildSubscriptionsModule({
      tribeMemberSubscriptionRepository:
        new PostgresTribeMemberSubscriptionRepository(
          executeWithRequestContext,
          createMercadoPagoPreapprovalSubscription,
          getMercadoPagoPreapprovalStatus,
          resolvePublicAppBaseUrl
        ),
      tribePaymentIntegrationRepository:
        new PostgresTribePaymentIntegrationRepository(executeWithRequestContext),
      tribeSubscriptionPriceRepository:
        new PostgresTribeSubscriptionPriceRepository(
          executeWithRequestContext,
          createMercadoPagoPreapprovalPlan
        ),
    }),
  };
}
