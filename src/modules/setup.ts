import { buildAuthModule } from "./auth/setup";
import { BetterAuthSessionRepository } from "./auth/infrastructure/repositories/better-auth-session-repository";
import { buildTribesModule } from "./tribes/setup";
import { PostgresTribeCreationRepository } from "./tribes/infrastructure/repositories/postgres-tribe-creation-repository";
import { PostgresTribeCreatorWhitelistRepository } from "./tribes/infrastructure/repositories/postgres-tribe-creator-whitelist-repository";
import { PostgresTribeInvitationRepository } from "./tribes/infrastructure/repositories/postgres-tribe-invitation-repository";
import { PostgresTribeReadRepository } from "./tribes/infrastructure/repositories/postgres-tribe-read-repository";
import { PostgresTribeSupportRepository } from "./tribes/infrastructure/repositories/postgres-tribe-support-repository";
import { PostgresTribeWelcomeRepository } from "./tribes/infrastructure/repositories/postgres-tribe-welcome-repository";
import { PostgresTribeWelcomeSelectionRepository } from "./tribes/infrastructure/repositories/postgres-tribe-welcome-selection-repository";
import { PostgresMessageRoundRepository } from "./messages/infrastructure/repositories/postgres-message-round-repository";
import { PostgresTribeChannelRepository } from "./messages/infrastructure/repositories/postgres-tribe-channel-repository";
import { PostgresMessageMutationRepository } from "./messages/infrastructure/repositories/postgres-message-mutation-repository";
import { buildMessagesModule } from "./messages/setup";
import { buildCoursesModule } from "./courses/setup";
import { PostgresCourseRepository } from "./courses/infrastructure/repositories/postgres-course-repository";
import { buildEventsModule } from "./events/setup";
import { PostgresTribeEventRepository } from "./events/infrastructure/repositories/postgres-tribe-event-repository";
import { buildSubscriptionsModule } from "./subscriptions/setup";
import { PostgresTribeMemberSubscriptionRepository } from "./subscriptions/infrastructure/repositories/postgres-tribe-member-subscription-repository";
import { PostgresTribePaymentIntegrationRepository } from "./subscriptions/infrastructure/repositories/postgres-tribe-payment-integration-repository";
import { PostgresTribeSubscriptionPriceRepository } from "./subscriptions/infrastructure/repositories/postgres-tribe-subscription-price-repository";
import {
  buildMercadoPagoPreapprovalPlanCheckoutUrl,
  createMercadoPagoPreapprovalPlan,
  getMercadoPagoPreapprovalDetails,
  getMercadoPagoPreapprovalPlan,
  getMercadoPagoPreapprovalPlanStatus,
  getMercadoPagoPreapprovalStatus,
  refreshMercadoPagoAccessToken,
  updateMercadoPagoPreapprovalPlan,
  updateMercadoPagoPreapprovalSubscriptionStatus,
} from "./subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";
import { createServerDatabaseClient } from "./shared/infrastructure/database/server-database-client";

type RequestScopedDatabaseClient = Awaited<ReturnType<typeof createServerDatabaseClient>>;
type RequestModuleContextOverrides = {
  mercadoPagoWebhookVerified?: boolean;
  requestId?: string;
};

/**
 * Builds request-scoped modules with database context and optional tracing metadata.
 *
 * @param contextOverrides - Request flags and correlation data for infrastructure adapters.
 * @returns Composed application modules for the current request.
 */
export async function createRequestModules(
  contextOverrides: RequestModuleContextOverrides = {}
) {
  const { requestId, ...databaseContextOverrides } = contextOverrides;
  const [databaseClient, authContext] = await Promise.all([
    createServerDatabaseClient(),
    import("./auth/infrastructure/better-auth/server-auth-context").then(
      ({ getRequestAuthContext }) => getRequestAuthContext()
    ),
  ]);
  const executeWithRequestContext = <T>(
    callback: Parameters<RequestScopedDatabaseClient["withRequestContext"]>[1]
  ) =>
    databaseClient.withRequestContext(
      {
        ...authContext,
        ...databaseContextOverrides,
      },
      callback
    ) as Promise<T>;
  const tribeSubscriptionPriceRepository =
    new PostgresTribeSubscriptionPriceRepository(
      executeWithRequestContext,
      createMercadoPagoPreapprovalPlan,
      updateMercadoPagoPreapprovalPlan,
      getMercadoPagoPreapprovalPlan,
      refreshMercadoPagoAccessToken,
      getMercadoPagoPreapprovalPlanStatus,
      getMercadoPagoPreapprovalStatus,
      requestId
    );

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
      tribeSupportRepository: new PostgresTribeSupportRepository(
        executeWithRequestContext
      ),
      tribeWelcomeRepository: new PostgresTribeWelcomeRepository(
        executeWithRequestContext
      ),
      tribeWelcomeSelectionRepository:
        new PostgresTribeWelcomeSelectionRepository(executeWithRequestContext),
    }),
    messages: buildMessagesModule({
      tribeChannelRepository: new PostgresTribeChannelRepository(
        executeWithRequestContext
      ),
      listCachedTribeRoundSharedData: (query) =>
        import("./messages/infrastructure/cache/tribe-round-shared-data-cache").then(
          ({ listCachedTribeRoundSharedData }) =>
            listCachedTribeRoundSharedData(query)
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
      messagePinRepository: new PostgresMessageMutationRepository(
        executeWithRequestContext
      ),
      messagePollRepository: new PostgresMessageMutationRepository(
        executeWithRequestContext
      ),
      messageDeletionRepository: new PostgresMessageMutationRepository(
        executeWithRequestContext
      ),
      messageCreatedAtUpdateRepository: new PostgresMessageMutationRepository(
        executeWithRequestContext
      ),
    }),
    courses: buildCoursesModule({
      courseRepository: new PostgresCourseRepository(executeWithRequestContext),
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
          buildMercadoPagoPreapprovalPlanCheckoutUrl,
          getMercadoPagoPreapprovalDetails,
          getMercadoPagoPreapprovalStatus,
          updateMercadoPagoPreapprovalSubscriptionStatus,
          refreshMercadoPagoAccessToken,
          requestId
        ),
      tribePaymentIntegrationRepository:
        new PostgresTribePaymentIntegrationRepository(executeWithRequestContext),
      tribeProviderSubscriberReconciliationRepository:
        tribeSubscriptionPriceRepository,
      tribeSubscriberDiagnosticsRepository: tribeSubscriptionPriceRepository,
      tribeSubscriptionPriceRepository:
        tribeSubscriptionPriceRepository,
    }),
  };
}
