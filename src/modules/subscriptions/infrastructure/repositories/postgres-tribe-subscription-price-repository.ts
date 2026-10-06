/**
 * Persists and maps tribe subscription prices in Postgres.
 *
 * @module postgres-tribe-subscription-price-repository
 */

import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";
import {buildReconciledSubscriptionsSql,buildSubscriptionMembershipUpdateSql,lockSubscriptionMembershipTribes} from "@/src/modules/subscriptions/infrastructure/repositories/subscription-membership-reconciliation-sql";

import type {
  TribeCurrentSubscriptionOfferResult,
  TribeFreeJoinMutationResult,
  TribeProviderSubscriberReconciliationResult,
  TribeSubscriberDiagnosticsReconciliationResult,
  TribeSubscriberDiagnosticsResult,
  TribeSubscriptionProviderPlanVerificationResult,
  TribeSubscriptionProviderPlansVerificationResult,
  TribeSubscriptionProviderPlanSyncResult,
  TribeSubscriptionPriceListResult,
  TribeSubscriptionPriceMutationResult,
  TribeSubscriptionPriceResult,
} from "@/src/modules/subscriptions/application/results/tribe-subscription-price-result";
import {
  MERCADO_PAGO_CONNECTION_STATUS,
  SUBSCRIPTION_PRICE_INVITATION_ACTION,
  TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS,
  TRIBE_SUBSCRIPTION_CURRENCY,
  TRIBE_SUBSCRIPTION_PRICE_LIMIT,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
  TRIBE_SUBSCRIPTION_PRODUCT_KEY,
  TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE,
  TRIBE_SUBSCRIPTION_TRIAL_MAXIMUM_DAYS,
  type TribeSubscriptionProductKey,
} from "@/src/modules/subscriptions/constants/subscriptions";
import type {
  TribeProviderSubscriberReconciliationCommand,
  TribeProviderSubscriberReconciliationRepository,
} from "@/src/modules/subscriptions/application/ports/tribe-provider-subscriber-reconciliation-repository";
import type { TribeSubscriberDiagnosticsRepository } from "@/src/modules/subscriptions/application/ports/tribe-subscriber-diagnostics-repository";
import type {
  CreateTribeSubscriptionPriceCommand,
  DeleteTribeSubscriptionPriceInvitationAction,
  DeleteTribeSubscriptionPriceWithInvitationActionsCommand,
  SetTribeFreeJoinAsCurrentCommand,
  SetTribeOpenFreeJoinCommand,
  SyncTribeSubscriptionProviderPlanCommand,
  TribeSubscriptionPriceIdentity,
  TribeSubscriptionPriceListQuery,
  TribeSubscriptionPriceRepository,
  TribeSubscriptionPriceUpdateTrialPolicy,
  UpdateTribeSubscriptionPriceCommand,
} from "@/src/modules/subscriptions/domain/repositories/tribe-subscription-price-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {
  MercadoPagoPlanInput,
  MercadoPagoPlanUpdateInput,
  MercadoPagoPreapprovalPlanInput,
  MercadoPagoPreapprovalPlanResult,
  MercadoPagoPreapprovalStatusInput,
  MercadoPagoPreapprovalPlanStatusInput,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";
import type { PaymentOperationTraceContext } from "@/src/modules/subscriptions/infrastructure/observability/payment-operation-logger";
import {
  isMercadoPagoAccessTokenFresh,
  refreshStoredMercadoPagoAccessToken,
  resolveMercadoPagoAccessToken,
  type MercadoPagoAccessTokenRefresher,
  type StoredMercadoPagoAccessToken,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-access-token";
import { mapMercadoPagoSubscriptionStatus } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-status-mapper";
import { ROUTES } from "@/src/constants/routes";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type MercadoPagoPlanCreator = (input: MercadoPagoPlanInput) => Promise<string>;
type MercadoPagoPlanGetter = (
  input: MercadoPagoPreapprovalPlanInput
) => Promise<MercadoPagoPreapprovalPlanResult | null>;
type MercadoPagoPlanStatusGetter = (
  input: MercadoPagoPreapprovalPlanStatusInput
) => Promise<string | null>;
type MercadoPagoPlanUpdater = (
  input: MercadoPagoPlanUpdateInput
) => Promise<MercadoPagoPreapprovalPlanResult>;
type MercadoPagoSubscriptionStatusGetter = (
  input: MercadoPagoPreapprovalStatusInput
) => Promise<string | null>;

type MercadoPagoConnectionStatus =
  | typeof MERCADO_PAGO_CONNECTION_STATUS.connected
  | typeof MERCADO_PAGO_CONNECTION_STATUS.requiresReconnection;

type MercadoPagoAccountConnectionStatus = {
  paymentIntegrationId: string;
  status: MercadoPagoConnectionStatus;
};

type SubscriptionPriceRow = {
  active_subscribers_count: number | string | null;
  product_key?: TribeSubscriptionProductKey | null;
  amount_cents: number;
  created_at: Date | string;
  currency: "ARS";
  frequency: "monthly";
  id: string;
  is_current: boolean;
  mercado_pago_account_email?: string | null;
  mercado_pago_account_label?: string | null;
  name: string;
  payment_integration_id?: string | null;
  provider_account_id?: string | null;
  status: "active" | "canceled" | "deleted" | "paused";
  trial_frequency: number | null;
  trial_frequency_type: "days" | "months" | null;
};

type MercadoPagoAccountRow = {
  access_token: string | null;
  account_label: string;
  id: string;
  provider_account_email: string | null;
  provider_account_id: string | null;
  refresh_token: string | null;
  status: MercadoPagoConnectionStatus;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type SubscriptionPriceListRow = SubscriptionPriceRow & {
  access_token: string | null;
  can_manage_prices: boolean | null;
  can_view_prices: boolean | null;
  free_join_is_current: boolean | null;
  open_free_join_enabled?: boolean | null;
  has_mercado_pago_integration: boolean | null;
  mercado_pago_connection_payment_integration_id: string | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type SubscriptionPriceMutationRow = SubscriptionPriceRow & {
  status_result: string | null;
};

type SubscriptionProviderPlanRow = SubscriptionPriceRow & {
  access_token?: string | null;
  mercado_pago_preapproval_plan_id: string | null;
  refresh_token?: string | null;
  token_expires_at?: Date | string | null;
  tribe_id?: string;
};

type SubscriptionProviderSubscriberRow = {
  access_token?: string | null;
  mercado_pago_preapproval_id: string | null;
  payment_integration_id?: string | null;
  refresh_token?: string | null;
  token_expires_at?: Date | string | null;
  tribe_id?: string | null;
};

type TribeSubscriberDiagnosticsRow = {
  last_reconciled_at: Date | string | null;
  local_active_subscribers_count: number | string | null;
  mercado_pago_authorized_subscribers_count: number | string | null;
  mercado_pago_canceled_or_missing_subscribers_count: number | string | null;
  mercado_pago_paused_subscribers_count: number | string | null;
  mercado_pago_pending_subscribers_count: number | string | null;
  target_tribe_id: string | null;
};

type SubscriptionProviderSubscriberStatusUpdate = {
  provider_subscription_id: string;
  status_reason: string;
  subscription_status: string;
};

type PriceCreationContextRow = {
  access_token: string | null;
  can_manage_prices: boolean | null;
  existing_price_count: number | string | null;
  payment_integration_id: string | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type PriceVerificationContextRow = {
  access_token: string | null;
  can_manage_prices: boolean | null;
  payment_integration_id: string | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type PriceReservationRow = {
  reserved_price_id: string | null;
  status_result: string | null;
};

type CurrentSubscriptionOfferRow = {
  amount_cents: number | string;
  currency: string;
  frequency: string;
  name: string;
};

type PriceUpdateContextRow = SubscriptionProviderPlanRow & {
  access_token: string | null;
  can_manage_prices: boolean | null;
  payment_integration_id: string | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type ResolvedUpdateTrialPeriod = {
  trialFrequency: number | null;
  trialFrequencyType: "days" | "months" | null;
};

type PriceCancellationReservationRow = PriceUpdateContextRow & {
  was_current: boolean | null;
};

type ProviderPlanWebhookContextRow = SubscriptionProviderPlanRow & {
  access_token: string | null;
  payment_integration_id: string | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

const SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS =
  "pending_provider_plan";

/**
 * Local subscription statuses that still represent a live provider commitment.
 */
const CURRENT_MEMBER_SUBSCRIPTION_STATUSES = sql`(
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.gracePeriod},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pastDue},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused}
)`;

const LIVE_PROVIDER_PLAN_PRICE_STATUSES = sql`('active', 'paused')`;

const MANAGEABLE_PROVIDER_PLAN_PRICE_STATUSES = sql`(
  'active',
  'paused',
  'canceled'
)`;

const MERCADO_PAGO_PROVIDER_PLAN_STATUS = {
  active: "active",
  canceled: "canceled",
  paused: "paused",
} as const;

/**
 * Reports whether the provider plan still represents a live offering.
 *
 * @param providerPlanStatus - Status returned by Mercado Pago.
 * @returns Whether local deletion must be blocked.
 */
function isLiveProviderPlanStatus(providerPlanStatus: string | null): boolean {
  return (
    providerPlanStatus === MERCADO_PAGO_PROVIDER_PLAN_STATUS.active ||
    providerPlanStatus === MERCADO_PAGO_PROVIDER_PLAN_STATUS.paused
  );
}

const MERCADO_PAGO_PROVIDER_SUBSCRIPTION_STATUS_LOOKUP_CONCURRENCY_LIMIT = 5;

const SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY = {
  deleteProviderPlanPrice: "delete-provider-plan-price",
  syncProviderPlanWebhook: "mercado-pago-plan-webhook",
  updateProviderPlan: "update-provider-plan",
  verifyProviderPlan: "verify-provider-plan",
  verifyProviderSubscribers: "verify-provider-subscribers",
} as const;

const MERCADO_PAGO_PAYMENT_INTEGRATION = {
  checkoutTribeSettingName: "app.subscription_checkout_tribe_id",
  provider: "mercado_pago",
} as const;

const PROVIDER_PLAN_CONTENT_FINGERPRINT = {
  algorithm: "sha256",
  encoding: "hex",
  length: 16,
} as const;

const POSTGRES_ERROR_CODE = {
  undefinedColumn: "42703",
  undefinedTable: "42P01",
} as const;

type MercadoPagoConnectionTokenRow = {
  access_token: string | null;
  payment_integration_id: string | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type ProviderTokenContext = {
  access_token?: string | null;
  payment_integration_id?: string | null;
  refresh_token?: string | null;
  token_expires_at?: Date | string | null;
  tribe_id?: string | null;
};

/**
 * Normalizes token expiration timestamps for stable comparisons across database drivers.
 *
 * @param tokenExpiresAt - Token expiration timestamp read from Postgres.
 * @returns Epoch milliseconds or null when the timestamp is absent or invalid.
 */
function normalizeMercadoPagoTokenExpiration(
  tokenExpiresAt: Date | string | null
): number | null {
  if (!tokenExpiresAt) {
    return null;
  }

  const expirationTime = new Date(tokenExpiresAt).getTime();

  return Number.isFinite(expirationTime) ? expirationTime : null;
}

/**
 * Determines whether a reloaded token differs from the originally listed token.
 *
 * @param input - Original and reloaded token snapshots.
 * @returns Whether another request likely persisted a newer token.
 */
function hasStoredMercadoPagoTokenChanged(input: {
  reloadedToken: StoredMercadoPagoAccessToken;
  storedToken: StoredMercadoPagoAccessToken;
}): boolean {
  return (
    input.reloadedToken.accessToken !== input.storedToken.accessToken ||
    input.reloadedToken.refreshToken !== input.storedToken.refreshToken ||
    normalizeMercadoPagoTokenExpiration(input.reloadedToken.tokenExpiresAt) !==
      normalizeMercadoPagoTokenExpiration(input.storedToken.tokenExpiresAt)
  );
}

/**
 * Reads the latest persisted Mercado Pago token for one tribe.
 *
 * @param input - Tribe identity and database executor.
 * @returns Stored token data, or null when no integration exists.
 */
async function readLatestStoredMercadoPagoAccessToken(input: {
  executeWithDatabase: DatabaseExecutor;
  paymentIntegrationId: string | null;
  tribeId: string | null;
}): Promise<StoredMercadoPagoAccessToken | null> {
  if (!input.paymentIntegrationId || !input.tribeId) {
    return null;
  }

  return input.executeWithDatabase(async (database) => {
    const result = await database.execute(sql`
      with token_refresh_context as (
        select set_config(
          ${MERCADO_PAGO_PAYMENT_INTEGRATION.checkoutTribeSettingName},
          ${input.tribeId},
          true
        )
      )
      select
        tribe_payment_integrations.id as payment_integration_id,
        tribe_payment_integrations.tribe_id,
        tribe_payment_integrations.access_token,
        tribe_payment_integrations.refresh_token,
        tribe_payment_integrations.token_expires_at
      from token_refresh_context
      cross join public.tribe_payment_integrations
      where tribe_payment_integrations.tribe_id = ${input.tribeId}
        and tribe_payment_integrations.provider = ${MERCADO_PAGO_PAYMENT_INTEGRATION.provider}
        and tribe_payment_integrations.id = ${input.paymentIntegrationId}::uuid
      limit 1
    `);
    const row = (result.rows?.[0] ?? null) as
      | MercadoPagoConnectionTokenRow
      | null;

    return row
      ? {
          accessToken: row.access_token,
          paymentIntegrationId: row.payment_integration_id,
          refreshToken: row.refresh_token,
          tokenExpiresAt: row.token_expires_at,
          tribeId: row.tribe_id,
        }
      : null;
  });
}

/**
 * Resolves a fresh token persisted by a concurrent refresh after this request failed.
 *
 * @param input - Original token and reloaded token data.
 * @returns Fresh access token, or null when reconnection is still required.
 */
function resolveFreshConcurrentMercadoPagoAccessToken(input: {
  reloadedToken: StoredMercadoPagoAccessToken | null;
  storedToken: StoredMercadoPagoAccessToken;
}): string | null {
  if (!input.reloadedToken?.accessToken) {
    return null;
  }

  return hasStoredMercadoPagoTokenChanged({
    reloadedToken: input.reloadedToken,
    storedToken: input.storedToken,
  }) && isMercadoPagoAccessTokenFresh(input.reloadedToken.tokenExpiresAt)
    ? input.reloadedToken.accessToken
    : null;
}

/**
 * Resolves Mercado Pago integration health by forcing an OAuth token refresh.
 *
 * @param input - Stored token data and refresh dependencies.
 * @returns Connected when Mercado Pago accepts the refresh token, otherwise reconnection required.
 */
async function resolveMercadoPagoConnectionStatus(input: {
  executeWithDatabase: DatabaseExecutor;
  refreshMercadoPagoAccessToken: MercadoPagoAccessTokenRefresher;
  storedToken: {
    accessToken: string | null;
    paymentIntegrationId: string | null;
    refreshToken: string | null;
    tokenExpiresAt: Date | string | null;
    tribeId: string | null;
  };
}): Promise<MercadoPagoConnectionStatus> {
  let refreshedAccessToken: string | null;

  try {
    refreshedAccessToken = await refreshStoredMercadoPagoAccessToken({
      executeWithDatabase: input.executeWithDatabase,
      refreshMercadoPagoAccessToken: input.refreshMercadoPagoAccessToken,
      storedToken: input.storedToken,
    });
  } catch {
    const reloadedToken = await readLatestStoredMercadoPagoAccessToken({
      executeWithDatabase: input.executeWithDatabase,
      paymentIntegrationId: input.storedToken.paymentIntegrationId,
      tribeId: input.storedToken.tribeId,
    }).catch(() => null);

    refreshedAccessToken = resolveFreshConcurrentMercadoPagoAccessToken({
      reloadedToken,
      storedToken: input.storedToken,
    });
  }

  return refreshedAccessToken
    ? MERCADO_PAGO_CONNECTION_STATUS.connected
    : MERCADO_PAGO_CONNECTION_STATUS.requiresReconnection;
}

/**
 * Resolves provider health across every connected Mercado Pago account.
 *
 * @param input - Stored token rows for all tribe accounts.
 * @returns Connected when at least one account can refresh successfully.
 */
async function resolveMercadoPagoConnectionStatusesForAccounts(input: {
  executeWithDatabase: DatabaseExecutor;
  refreshMercadoPagoAccessToken: MercadoPagoAccessTokenRefresher;
  storedTokens: StoredMercadoPagoAccessToken[];
}): Promise<MercadoPagoAccountConnectionStatus[]> {
  if (input.storedTokens.length === 0) {
    return [];
  }

  return Promise.all(
    input.storedTokens.map((storedToken) =>
      resolveMercadoPagoConnectionStatus({
        executeWithDatabase: input.executeWithDatabase,
        refreshMercadoPagoAccessToken: input.refreshMercadoPagoAccessToken,
        storedToken,
      }).then((status) => ({
        paymentIntegrationId: storedToken.paymentIntegrationId ?? "",
        status,
      }))
    )
  );
}

/**
 * Resolves aggregate provider health from account-level connection status.
 *
 * @param accountConnectionStatuses - Per-account provider connection status.
 * @returns Connected when at least one account can refresh successfully.
 */
function resolveMercadoPagoConnectionStatusForAccounts(
  accountConnectionStatuses: MercadoPagoAccountConnectionStatus[]
): MercadoPagoConnectionStatus {
  return accountConnectionStatuses.some(
    (connectionStatus) =>
      connectionStatus.status === MERCADO_PAGO_CONNECTION_STATUS.connected
  )
    ? MERCADO_PAGO_CONNECTION_STATUS.connected
    : MERCADO_PAGO_CONNECTION_STATUS.requiresReconnection;
}

/**
 * Applies refreshed connection status to account rows and prioritizes usable accounts.
 *
 * @param accountRows - Stored Mercado Pago account rows.
 * @param accountConnectionStatuses - Refreshed status by payment integration.
 * @returns Account rows with refreshed status and connected accounts first.
 */
function applyMercadoPagoAccountConnectionStatuses(
  accountRows: MercadoPagoAccountRow[],
  accountConnectionStatuses: MercadoPagoAccountConnectionStatus[]
): MercadoPagoAccountRow[] {
  const statusByPaymentIntegrationId = new Map(
    accountConnectionStatuses.map((accountConnectionStatus) => [
      accountConnectionStatus.paymentIntegrationId,
      accountConnectionStatus.status,
    ])
  );

  return accountRows
    .map((accountRow) => ({
      ...accountRow,
      status:
        statusByPaymentIntegrationId.get(accountRow.id) ??
        MERCADO_PAGO_CONNECTION_STATUS.requiresReconnection,
    }))
    .toSorted((firstAccount, secondAccount) => {
      if (firstAccount.status === secondAccount.status) {
        return 0;
      }

      return firstAccount.status === MERCADO_PAGO_CONNECTION_STATUS.connected
        ? -1
        : 1;
    });
}

/**
 * Builds a trace context for Mercado Pago operations scoped to subscription prices.
 *
 * @param input - Payment operation identifiers available at the repository boundary.
 * @returns Trace context for provider logging, or undefined when request tracing is unavailable.
 */
function buildSubscriptionPricePaymentTraceContext(input: {
  operationKey: string;
  preapprovalId?: string | null;
  priceId?: string | null;
  providerPlanId?: string | null;
  requestId?: string;
  tribeSlug?: string | null;
}): PaymentOperationTraceContext | undefined {
  if (!input.requestId) {
    return undefined;
  }

  return {
    operationKey: input.operationKey,
    preapprovalId: input.preapprovalId,
    priceId: input.priceId,
    providerPlanId: input.providerPlanId,
    requestId: input.requestId,
    tribeSlug: input.tribeSlug,
  };
}

/**
 * Builds a stable operation key for price-scoped Mercado Pago reads and writes.
 *
 * @param parts - Operation family and local identifiers.
 * @returns Stable operation key for tracing retries and outcomes.
 */
function buildSubscriptionPriceOperationKey(parts: {
  operation: string;
  priceId: string;
  source?: string;
  tribeSlug: string;
}): string {
  const operationKeyParts = [
    parts.operation,
    parts.tribeSlug,
    parts.priceId,
  ];

  if (parts.source) {
    operationKeyParts.push(parts.source);
  }

  return operationKeyParts.join(":");
}

/**
 * Builds local status updates aligned to verified provider subscribers.
 *
 * @param input - Provider subscriber rows and statuses returned by Mercado Pago.
 * @returns Persistable status updates for subscribers with provider identifiers.
 */
function buildProviderSubscriberStatusUpdates(input: {
  providerSubscribers: SubscriptionProviderSubscriberRow[];
  providerSubscriptionStatuses: (string | null)[];
}): SubscriptionProviderSubscriberStatusUpdate[] {
  return input.providerSubscriptionStatuses.reduce<
    SubscriptionProviderSubscriberStatusUpdate[]
  >((statusUpdates, providerSubscriptionStatus, subscriberIndex) => {
    const providerSubscriptionId =
      input.providerSubscribers[subscriberIndex]
        ?.mercado_pago_preapproval_id;

    if (!providerSubscriptionId) {
      return statusUpdates;
    }

    const subscriptionStatus = mapMercadoPagoSubscriptionStatus(
      providerSubscriptionStatus
    );

    statusUpdates.push({
      provider_subscription_id: providerSubscriptionId,
      status_reason: subscriptionStatus.statusReason,
      subscription_status: subscriptionStatus.status,
    });

    return statusUpdates;
  }, []);
}

/**
 * Reads provider subscriber statuses without opening an unbounded request fan-out.
 *
 * @param input - Access token, provider subscriber rows, and status reader.
 * @returns Provider statuses aligned to the local subscriber rows.
 */
async function readProviderSubscriptionStatuses(input: {
  accessToken: string;
  getMercadoPagoSubscriptionStatus: MercadoPagoSubscriptionStatusGetter;
  operationKey: string;
  priceId: string;
  providerSubscribers: SubscriptionProviderSubscriberRow[];
  requestId?: string;
  tribeSlug: string;
}): Promise<(string | null)[]> {
  const providerSubscriptionStatuses: (string | null)[] = new Array(
    input.providerSubscribers.length
  );
  let nextSubscriberIndex = 0;

  async function readNextProviderSubscriptions(): Promise<void> {
    while (nextSubscriberIndex < input.providerSubscribers.length) {
      const providerSubscriberIndex = nextSubscriberIndex;
      nextSubscriberIndex += 1;

      const providerSubscriber =
        input.providerSubscribers[providerSubscriberIndex];
      const traceContext = providerSubscriber.mercado_pago_preapproval_id
        ? buildSubscriptionPricePaymentTraceContext({
            operationKey: input.operationKey,
            preapprovalId: providerSubscriber.mercado_pago_preapproval_id,
            priceId: input.priceId,
            requestId: input.requestId,
            tribeSlug: input.tribeSlug,
          })
        : undefined;

      providerSubscriptionStatuses[providerSubscriberIndex] =
        providerSubscriber.mercado_pago_preapproval_id
          ? await input.getMercadoPagoSubscriptionStatus({
              accessToken: input.accessToken,
              preapprovalId: providerSubscriber.mercado_pago_preapproval_id,
              ...(traceContext ? { traceContext } : {}),
            })
          : null;
    }
  }

  const workerCount = Math.min(
    MERCADO_PAGO_PROVIDER_SUBSCRIPTION_STATUS_LOOKUP_CONCURRENCY_LIMIT,
    input.providerSubscribers.length
  );

  await Promise.all(
    Array.from({ length: workerCount }, () => readNextProviderSubscriptions())
  );

  return providerSubscriptionStatuses;
}

/**
 * Groups provider subscribers by the Mercado Pago account token that owns them.
 *
 * @param providerSubscribers - Subscriber rows with account token context.
 * @returns Subscriber rows grouped by access token.
 */
function groupProviderSubscribersByAccessToken(
  providerSubscribers: SubscriptionProviderSubscriberRow[]
): Map<string, SubscriptionProviderSubscriberRow[]> {
  return providerSubscribers.reduce((subscriberGroups, providerSubscriber) => {
    if (!providerSubscriber.access_token) {
      return subscriberGroups;
    }

    const groupedSubscribers =
      subscriberGroups.get(providerSubscriber.access_token) ?? [];

    groupedSubscribers.push(providerSubscriber);
    subscriberGroups.set(providerSubscriber.access_token, groupedSubscribers);

    return subscriberGroups;
  }, new Map<string, SubscriptionProviderSubscriberRow[]>());
}

/**
 * Converts database dates and counts into application price results.
 *
 * @param row - Database subscription price row.
 * @returns Subscription price application result.
 */
function mapSubscriptionPrice(row: SubscriptionPriceRow): TribeSubscriptionPriceResult {
  return {
    activeSubscribersCount: Number(row.active_subscribers_count ?? 0),
    amountCents: row.amount_cents,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    currency: row.currency,
    frequency: row.frequency,
    id: row.id,
    isCurrent: row.is_current,
    mercadoPagoAccountEmail: row.mercado_pago_account_email,
    mercadoPagoAccountLabel: row.mercado_pago_account_label,
    name: row.name,
    paymentIntegrationId: row.payment_integration_id,
    productKey: row.product_key ?? TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership,
    providerAccountId: row.provider_account_id,
    status: row.status,
    trial:
      row.trial_frequency && row.trial_frequency_type
        ? {
            frequency: row.trial_frequency,
            frequencyType: row.trial_frequency_type,
          }
        : null,
  };
}

/**
 * Converts a stored Mercado Pago account row into the safe application contract.
 *
 * @param row - Stored payment integration row.
 * @returns Mercado Pago account data without secret token fields.
 */
function mapMercadoPagoAccount(row: MercadoPagoAccountRow) {
  return {
    accountLabel: row.account_label,
    id: row.id,
    providerAccountEmail: row.provider_account_email,
    providerAccountId: row.provider_account_id,
    status: row.status,
  };
}

/**
 * Converts aggregate subscriber diagnostics from database rows to application results.
 *
 * @param row - Aggregate diagnostics row.
 * @returns Subscriber diagnostics result.
 */
function mapSubscriberDiagnostics(
  row: TribeSubscriberDiagnosticsRow
): TribeSubscriberDiagnosticsResult {
  const lastReconciledAt = row.last_reconciled_at
    ? new Date(row.last_reconciled_at).toISOString()
    : undefined;

  return {
    ...(lastReconciledAt ? { lastReconciledAt } : {}),
    localActiveSubscribersCount: Number(
      row.local_active_subscribers_count ?? 0
    ),
    mercadoPagoAuthorizedSubscribersCount: Number(
      row.mercado_pago_authorized_subscribers_count ?? 0
    ),
    mercadoPagoCanceledOrMissingSubscribersCount: Number(
      row.mercado_pago_canceled_or_missing_subscribers_count ?? 0
    ),
    mercadoPagoPausedSubscribersCount: Number(
      row.mercado_pago_paused_subscribers_count ?? 0
    ),
    mercadoPagoPendingSubscribersCount: Number(
      row.mercado_pago_pending_subscribers_count ?? 0
    ),
  };
}

/**
 * Builds the local external reference stored in Mercado Pago plans.
 *
 * @param priceId - Local subscription price identifier.
 * @returns Provider external reference for a TuTribu price.
 */
function buildPriceExternalReference(priceId: string): string {
  return `tutribu:price:${priceId}`;
}

const MERCADO_PAGO_BACK_URL_ENV = "MERCADO_PAGO_BACK_URL";

/**
 * Builds the successful return URL stored in Mercado Pago plans.
 * Uses MERCADO_PAGO_BACK_URL when set (required in local dev with a tunnel URL),
 * otherwise falls back to the public app base URL (works in production).
 *
 * @param tribeSlug - Current tribe slug.
 * @returns Public tribe URL used as Mercado Pago back URL.
 */
function buildProviderPlanBackUrl(tribeSlug: string): string {
  const override = process.env[MERCADO_PAGO_BACK_URL_ENV]?.trim();
  const baseUrl = override || resolvePublicAppBaseUrl();

  return baseUrl.replace(/\/$/, "") + ROUTES.tribes.bySlug(tribeSlug);
}

/**
 * Reads a local price identifier from a Mercado Pago external reference.
 *
 * @param externalReference - Provider external reference value.
 * @returns Local price identifier, or null when the reference is not from TuTribu.
 */
function parsePriceIdFromExternalReference(
  externalReference: string | null
): string | null {
  const prefix = "tutribu:price:";

  return externalReference?.startsWith(prefix)
    ? externalReference.slice(prefix.length)
    : null;
}

/**
 * Builds a stable idempotency key for one reserved Mercado Pago plan creation.
 *
 * @param command - Price creation command.
 * @param reservedPriceId - Local price reservation identifier linked to the provider plan.
 * @returns Stable key scoped to the local reservation and price content.
 */
function buildPlanIdempotencyKey(
  command: CreateTribeSubscriptionPriceCommand,
  reservedPriceId: string
): string {
  return [
    "tribe-price",
    reservedPriceId,
    command.tribeSlug,
    command.name,
    String(command.amountCents),
    command.currency,
    command.frequency,
  ].join(":");
}

/**
 * Maps a price mutation SQL result into the application contract.
 *
 * @param row - Database mutation row.
 * @param successStatus - Expected success status for the mutation.
 * @returns Price mutation result.
 */
function mapPriceMutationResult(
  row: SubscriptionPriceMutationRow | null,
  successStatus:
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.created
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.current
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.updated
): TribeSubscriptionPriceMutationResult {
  if (row?.status_result === successStatus) {
    return {
      price: mapSubscriptionPrice(row),
      status: successStatus,
    };
  }

  return {
    status:
      row?.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound ||
      row?.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers ||
      row?.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached ||
      row?.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration
        ? row.status_result
        : TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
  };
}

/**
 * Resolves omitted update trial fields from the currently stored price.
 *
 * @param command - Price update command.
 * @param updateContext - Stored price state loaded for the update.
 * @returns Trial period values to persist and synchronize.
 */
function resolveUpdateTrialPeriod(
  command: UpdateTribeSubscriptionPriceCommand,
  updateContext: PriceUpdateContextRow
): ResolvedUpdateTrialPeriod {
  return {
    trialFrequency:
      command.trialFrequency === undefined
        ? updateContext.trial_frequency
        : command.trialFrequency,
    trialFrequencyType:
      command.trialFrequencyType === undefined
        ? updateContext.trial_frequency_type
        : command.trialFrequencyType,
  };
}

/**
 * Determines whether a day-based trial must wait until the provider plan is persisted.
 *
 * @param command - Price creation command that may carry a provider-synchronized trial.
 * @returns Whether the local reservation cannot store the trial before the provider plan exists.
 */
function shouldAttachTrialAfterProviderPlan(
  command: CreateTribeSubscriptionPriceCommand
): boolean {
  return (
    command.trialFrequencyType === TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.days &&
    typeof command.trialFrequency === "number" &&
    command.trialFrequency > TRIBE_SUBSCRIPTION_TRIAL_MAXIMUM_DAYS
  );
}

/**
 * Builds a short content fingerprint over the Mercado Pago plan fields that
 * the webhook handler reacts to. Two webhooks with identical effects share a
 * fingerprint and collapse into a single idempotent operation.
 *
 * @param providerPlan - Plan returned by Mercado Pago, or null when the plan is missing.
 * @returns Stable short hex digest.
 */
function buildProviderPlanContentHash(
  providerPlan: MercadoPagoPreapprovalPlanResult | null
): string {
  const normalized = [
    providerPlan?.status ?? "",
    providerPlan?.reason ?? "",
    providerPlan?.amountCents ?? "",
    providerPlan?.currency ?? "",
    providerPlan?.trial?.frequency ?? "",
    providerPlan?.trial?.frequencyType ?? "",
  ].join("|");

  return createHash(PROVIDER_PLAN_CONTENT_FINGERPRINT.algorithm)
    .update(normalized)
    .digest(PROVIDER_PLAN_CONTENT_FINGERPRINT.encoding)
    .slice(0, PROVIDER_PLAN_CONTENT_FINGERPRINT.length);
}

/**
 * Builds the idempotency key for a Mercado Pago plan webhook. The key joins
 * the provider plan identifier with the content fingerprint so equivalent
 * webhooks reuse the same row.
 *
 * @param input - Provider plan identifier and content fingerprint.
 * @returns Idempotent operation key.
 */
function buildProviderPlanWebhookOperationKey(input: {
  contentHash: string;
  providerPlanId: string;
}): string {
  return [
    SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.syncProviderPlanWebhook,
    input.providerPlanId,
    input.contentHash,
  ].join(":");
}

/**
 * Reports whether a local price already reflects the effective state from a
 * Mercado Pago plan webhook. Used as a safeguard against state oscillation
 * when a content-keyed idempotency row already exists.
 *
 * @param input - Local price context and provider plan response.
 * @returns Whether the local row matches the effective target state.
 */
function arePlanStatesEquivalent(input: {
  providerPlan: MercadoPagoPreapprovalPlanResult | null;
  webhookContext: ProviderPlanWebhookContextRow;
}): boolean {
  const local = input.webhookContext;
  const provider = input.providerPlan;

  if (provider?.status === MERCADO_PAGO_PROVIDER_PLAN_STATUS.paused) {
    return (
      local.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.paused &&
      local.is_current === false
    );
  }

  if (provider?.status !== MERCADO_PAGO_PROVIDER_PLAN_STATUS.active) {
    return (
      local.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled &&
      local.is_current === false
    );
  }

  const targetName = provider.reason ?? local.name;
  const targetAmountCents = provider.amountCents ?? local.amount_cents;
  const targetCurrency =
    provider.currency === TRIBE_SUBSCRIPTION_CURRENCY.ars
      ? provider.currency
      : local.currency;
  const targetTrialFrequency = provider.trial?.frequency ?? null;
  const targetTrialFrequencyType = provider.trial?.frequencyType ?? null;

  return (
    local.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.active &&
    local.name === targetName &&
    local.amount_cents === targetAmountCents &&
    local.currency === targetCurrency &&
    local.trial_frequency === targetTrialFrequency &&
    local.trial_frequency_type === targetTrialFrequencyType
  );
}

export class PostgresTribeSubscriptionPriceRepository
  implements
    TribeProviderSubscriberReconciliationRepository,
    TribeSubscriberDiagnosticsRepository,
    TribeSubscriptionPriceRepository
{
  /**
   * Creates a subscription price repository with provider adapters and trace context.
   *
   * @param executeWithDatabase - Request-scoped database executor.
   * @param createMercadoPagoPlan - Adapter that creates provider plans.
   * @param updateMercadoPagoPlan - Adapter that updates provider plans.
   * @param getMercadoPagoPlan - Adapter that reads provider plan details.
   * @param refreshMercadoPagoAccessToken - Adapter that refreshes provider tokens.
   * @param getMercadoPagoPlanStatus - Adapter that reads provider plan status.
   * @param getMercadoPagoSubscriptionStatus - Adapter that reads provider subscription status.
   * @param requestId - Optional request correlation identifier for payment traces.
   */
  constructor(
    private readonly executeWithDatabase: DatabaseExecutor,
    private readonly createMercadoPagoPlan: MercadoPagoPlanCreator,
    private readonly updateMercadoPagoPlan: MercadoPagoPlanUpdater,
    private readonly getMercadoPagoPlan: MercadoPagoPlanGetter,
    private readonly refreshMercadoPagoAccessToken: MercadoPagoAccessTokenRefresher,
    private readonly getMercadoPagoPlanStatus: MercadoPagoPlanStatusGetter,
    private readonly getMercadoPagoSubscriptionStatus: MercadoPagoSubscriptionStatusGetter,
    private readonly requestId?: string
  ) {}

  /**
   * Reads the tribe current paid subscription offer for a tokenless public join.
   *
   * Returns the price flagged as current only when the tribe offers it as the
   * live option (free_join_is_current is false) and the price has a synchronized
   * provider plan. The read goes through the SECURITY DEFINER function
   * public.tribe_open_join_current_paid_offer because the tribes SELECT policies
   * hide the tribe row from an authenticated non-member without an invitation
   * token; resolving the slug through RLS would yield no row and report the
   * offer as unavailable even when a current paid plan exists.
   *
   * @param query - Tribe slug query.
   * @returns The available current paid offer, or an unavailable result.
   */
  async getCurrentSubscriptionOffer(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeCurrentSubscriptionOfferResult> {
    const offerRow = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          open_join_offer.amount_cents,
          open_join_offer.currency,
          open_join_offer.frequency,
          open_join_offer.name
        from public.tribe_open_join_current_paid_offer(${query.tribeSlug})
          as open_join_offer
      `);

      return (result.rows?.[0] ?? null) as CurrentSubscriptionOfferRow | null;
    });

    return offerRow
      ? {
          price: {
            amountCents: Number(offerRow.amount_cents),
            currency: offerRow.currency,
            frequency: offerRow.frequency,
            name: offerRow.name,
          },
          status: TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS.available,
        }
      : { status: TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS.unavailable };
  }

  /**
   * Lists subscription prices visible to subscription admins.
   *
   * @param query - Tribe slug query.
   * @returns Prices and viewer permissions.
   */
  async listByTribeSlug(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeSubscriptionPriceListResult> {
    const rows = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select
            tribes.id,
            tribes.free_join_is_current,
            tribes.open_free_join_enabled
          from public.tribes
          where tribes.slug = ${query.tribeSlug}
          limit 1
        ),
        viewer_permissions as (
          select
            coalesce(public.can_view_tribe_subscription_prices((select id from target_tribe)), false) as can_view_prices,
            coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices
        ),
        payment_integration as (
          select
            tribe_payment_integrations.id as payment_integration_id,
            target_tribe.id as tribe_id,
            tribe_payment_integrations.access_token,
            tribe_payment_integrations.refresh_token,
            tribe_payment_integrations.token_expires_at
          from (select 1) result
          left join target_tribe
            on true
          left join public.tribe_payment_integrations
            on tribe_payment_integrations.tribe_id = target_tribe.id
            and tribe_payment_integrations.provider = 'mercado_pago'
          order by tribe_payment_integrations.created_at asc
          limit 1
        ),
        price_rows as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.status,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.product_key,
            tribe_subscription_prices.payment_integration_id,
            price_payment_integration.account_label as mercado_pago_account_label,
            price_payment_integration.provider_account_email as mercado_pago_account_email,
            price_payment_integration.provider_account_id,
            tribe_subscription_prices.trial_frequency,
            tribe_subscription_prices.trial_frequency_type,
            tribe_subscription_prices.created_at,
            count(tribe_member_subscriptions.id) filter (
              where tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
            ) as active_subscribers_count
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          left join public.tribe_member_subscriptions
            on tribe_member_subscriptions.price_id = tribe_subscription_prices.id
          left join public.tribe_payment_integrations price_payment_integration
            on price_payment_integration.id = tribe_subscription_prices.payment_integration_id
          where tribe_subscription_prices.status in ${MANAGEABLE_PROVIDER_PLAN_PRICE_STATUSES}
            and public.can_view_tribe_subscription_prices(target_tribe.id)
          group by
            tribe_subscription_prices.id,
            price_payment_integration.account_label,
            price_payment_integration.provider_account_email,
            price_payment_integration.provider_account_id
        )
        select
          price_rows.id,
          price_rows.name,
          price_rows.amount_cents,
          price_rows.currency,
          price_rows.frequency,
          price_rows.status,
          price_rows.is_current,
          price_rows.product_key,
          price_rows.payment_integration_id,
          price_rows.mercado_pago_account_label,
          price_rows.mercado_pago_account_email,
          price_rows.provider_account_id,
          price_rows.trial_frequency,
          price_rows.trial_frequency_type,
          price_rows.created_at,
          price_rows.active_subscribers_count,
          viewer_permissions.can_view_prices,
          viewer_permissions.can_manage_prices,
          (select free_join_is_current from target_tribe) as free_join_is_current,
          (select open_free_join_enabled from target_tribe) as open_free_join_enabled,
          payment_integration.tribe_id,
          payment_integration.access_token,
          payment_integration.payment_integration_id as mercado_pago_connection_payment_integration_id,
          payment_integration.refresh_token,
          payment_integration.token_expires_at
        from viewer_permissions
        cross join payment_integration
        left join price_rows
          on true
        order by price_rows.created_at desc
      `);

      return (result.rows ?? []) as SubscriptionPriceListRow[];
    });
    const prices = rows.reduce<ReturnType<typeof mapSubscriptionPrice>[]>(
      (mappedPrices, row) => {
        if (row.id) {
          mappedPrices.push(mapSubscriptionPrice(row));
        }

        return mappedPrices;
      },
      []
    );
    const mercadoPagoAccountRows = await this.listMercadoPagoAccountRowsByTribeSlug(
      query.tribeSlug
    );
    const mercadoPagoAccountConnectionStatuses =
      await resolveMercadoPagoConnectionStatusesForAccounts({
        executeWithDatabase: this.executeWithDatabase,
        refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
        storedTokens: mercadoPagoAccountRows.map((mercadoPagoAccountRow) => ({
          accessToken: mercadoPagoAccountRow.access_token,
          paymentIntegrationId: mercadoPagoAccountRow.id,
          refreshToken: mercadoPagoAccountRow.refresh_token,
          tokenExpiresAt: mercadoPagoAccountRow.token_expires_at,
          tribeId: mercadoPagoAccountRow.tribe_id,
        })),
      });
    const prioritizedMercadoPagoAccountRows =
      applyMercadoPagoAccountConnectionStatuses(
        mercadoPagoAccountRows,
        mercadoPagoAccountConnectionStatuses
      );
    const mercadoPagoConnectionStatus =
      resolveMercadoPagoConnectionStatusForAccounts(
        mercadoPagoAccountConnectionStatuses
      );

    return {
      availableMercadoPagoAccounts: prioritizedMercadoPagoAccountRows.map(
        mapMercadoPagoAccount
      ),
      freeJoinIsCurrent: Boolean(rows[0]?.free_join_is_current),
      openFreeJoinEnabled: Boolean(rows[0]?.open_free_join_enabled),
      hasMercadoPagoIntegration:
        mercadoPagoConnectionStatus === MERCADO_PAGO_CONNECTION_STATUS.connected,
      mercadoPagoConnectionStatus,
      prices,
      viewerPermissions: {
        canManagePrices: Boolean(rows[0]?.can_manage_prices),
        canViewPrices: Boolean(rows[0]?.can_view_prices),
      },
    };
  }

  /**
   * Reads the stored trial policy required to validate extended day trial preservation.
   *
   * @param command - Price identity for the update.
   * @returns Existing trial policy, or null when the price is unavailable.
   */
  async getUpdateTrialPolicy(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionPriceUpdateTrialPolicy | null> {
    const updateContext = await this.resolvePriceUpdateContext(command);

    if (!updateContext?.tribe_id || !updateContext.can_manage_prices) {
      return null;
    }

    return {
      amountCents: updateContext.amount_cents,
      hasMercadoPagoPreapprovalPlan: Boolean(
        updateContext.mercado_pago_preapproval_plan_id
      ),
      trialFrequency: updateContext.trial_frequency,
      trialFrequencyType: updateContext.trial_frequency_type,
    };
  }

  private async listMercadoPagoAccountRowsByTribeSlug(
    tribeSlug: string
  ): Promise<MercadoPagoAccountRow[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        )
        select
          tribe_payment_integrations.id,
          tribe_payment_integrations.tribe_id,
          tribe_payment_integrations.account_label,
          tribe_payment_integrations.provider_account_email,
          tribe_payment_integrations.provider_account_id,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at,
          tribe_payment_integrations.status
        from public.tribe_payment_integrations
        inner join target_tribe
          on target_tribe.id = tribe_payment_integrations.tribe_id
        where tribe_payment_integrations.provider = 'mercado_pago'
          and public.can_view_tribe_subscription_prices(target_tribe.id)
        order by
          tribe_payment_integrations.created_at asc,
          tribe_payment_integrations.id asc
      `);

      return (result?.rows ?? []) as MercadoPagoAccountRow[];
    });
  }

  /**
   * Reads aggregate local subscriber diagnostics for tribe leaders.
   *
   * @param query - Tribe slug query.
   * @returns Aggregate diagnostics, or null when the tribe is missing or forbidden.
   */
  async getSubscriberDiagnostics(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeSubscriberDiagnosticsResult | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${query.tribeSlug}
          limit 1
        )
        select
          target_tribe.id as target_tribe_id,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active}
          ) as local_active_subscribers_count,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active}
              and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
          ) as mercado_pago_authorized_subscribers_count,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
          ) as mercado_pago_pending_subscribers_count,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused}
          ) as mercado_pago_paused_subscribers_count,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled}
              or (
                tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active}
                and tribe_member_subscriptions.mercado_pago_preapproval_id is null
              )
          ) as mercado_pago_canceled_or_missing_subscribers_count,
          max(tribe_member_subscriptions.updated_at) as last_reconciled_at
        from target_tribe
        left join public.tribe_member_subscriptions
          on tribe_member_subscriptions.tribe_id = target_tribe.id
        where public.can_manage_tribe_subscription_prices(target_tribe.id)
        group by target_tribe.id
      `);
      const row = (result.rows?.[0] ?? null) as
        | TribeSubscriberDiagnosticsRow
        | null;

      return row?.target_tribe_id ? mapSubscriberDiagnostics(row) : null;
    });
  }

  /**
   * Reconciles every stored provider subscriber before returning aggregate diagnostics.
   *
   * @param query - Tribe slug query.
   * @returns Reconciled diagnostics or a stable failure status.
   */
  async reconcileSubscriberDiagnostics(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeSubscriberDiagnosticsReconciliationResult> {
    const verificationContext = await this.resolveProviderPlanVerificationContext(
      query.tribeSlug
    );
    const verificationFailure = this.resolveVerificationFailure(
      verificationContext
    );

    if (verificationFailure) {
      return verificationFailure;
    }

    const providerSubscribers = await this.listProviderSubscribersByTribe({
      tribeSlug: query.tribeSlug,
    });
    const providerSubscriberAccessTokens = new Map<string, string>();
    const providerSubscribersWithResolvedAccessTokens: SubscriptionProviderSubscriberRow[] = [];

    for (const providerSubscriber of providerSubscribers) {
      const accessToken = await this.resolveAccessTokenForProviderMutationWithCache(
        providerSubscriber,
        providerSubscriberAccessTokens
      );

      if (!accessToken) {
        return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
      }

      providerSubscribersWithResolvedAccessTokens.push({
        ...providerSubscriber,
        access_token: accessToken,
      });
    }

    const providerSubscriberStatusUpdates = (
      await Promise.all(
        Array.from(
          groupProviderSubscribersByAccessToken(
            providerSubscribersWithResolvedAccessTokens
          ).entries()
        ).map(async ([accessToken, accountProviderSubscribers]) => {
          const providerSubscriptionStatuses =
            await readProviderSubscriptionStatuses({
              accessToken,
              getMercadoPagoSubscriptionStatus:
                this.getMercadoPagoSubscriptionStatus,
              operationKey: [
                SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.verifyProviderSubscribers,
                query.tribeSlug,
                "diagnostics",
              ].join(":"),
              priceId: "subscriber-diagnostics",
              providerSubscribers: accountProviderSubscribers,
              requestId: this.requestId,
              tribeSlug: query.tribeSlug,
            });

          return buildProviderSubscriberStatusUpdates({
            providerSubscribers: accountProviderSubscribers,
            providerSubscriptionStatuses,
          });
        })
      )
    ).flat();

    await this.reconcileTribeProviderSubscriberStatuses({
      providerSubscriberStatusUpdates,
      tribeSlug: query.tribeSlug,
    });

    const diagnostics = await this.getSubscriberDiagnostics(query);

    return diagnostics
      ? {
          diagnostics,
          status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
          verifiedCount: providerSubscribers.length,
        }
      : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
  }

  /**
   * Creates a new price and matching Mercado Pago plan.
   *
   * @param command - Normalized price creation command.
   * @returns Price creation result.
   */
  async create(
    command: CreateTribeSubscriptionPriceCommand
  ): Promise<TribeSubscriptionPriceMutationResult> {
    const creationContext = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
          for update
        ),
        active_prices as (
          select count(*) as existing_price_count
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.status in (
            'active',
            ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS}
          )
        )
        select
          (select id from target_tribe) as tribe_id,
          coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices,
          (select existing_price_count from active_prices) as existing_price_count,
          tribe_payment_integrations.id as payment_integration_id,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
          and tribe_payment_integrations.id = ${command.paymentIntegrationId}
      `);

      return (result.rows?.[0] ?? null) as
        | PriceCreationContextRow
        | null;
    });

    if (!creationContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!creationContext.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    if (
      Number(creationContext.existing_price_count ?? 0) >=
        TRIBE_SUBSCRIPTION_PRICE_LIMIT
    ) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached };
    }

    const accessToken = await resolveMercadoPagoAccessToken({
      executeWithDatabase: this.executeWithDatabase,
      refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
      storedToken: {
        accessToken: creationContext.access_token,
        paymentIntegrationId: creationContext.payment_integration_id,
        refreshToken: creationContext.refresh_token,
        tokenExpiresAt: creationContext.token_expires_at,
        tribeId: creationContext.tribe_id,
      },
    }).catch(() => null);

    if (!accessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    const reservation = await this.reserveProviderPlanPrice(
      shouldAttachTrialAfterProviderPlan(command)
        ? {
            ...command,
            trialFrequency: null,
            trialFrequencyType: null,
          }
        : command
    );

    if (reservation.status_result !== TRIBE_SUBSCRIPTION_PRICE_STATUS.created) {
      return {
        status:
          reservation.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound ||
          reservation.status_result ===
            TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached
            ? reservation.status_result
            : TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
      };
    }

    if (!reservation.reserved_price_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    let mercadoPagoPlanId: string;
    const providerPlanOperationKey = buildPlanIdempotencyKey(
      command,
      reservation.reserved_price_id
    );
    const traceContext = buildSubscriptionPricePaymentTraceContext({
      operationKey: providerPlanOperationKey,
      priceId: reservation.reserved_price_id,
      requestId: this.requestId,
      tribeSlug: command.tribeSlug,
    });

    try {
      mercadoPagoPlanId = await this.createMercadoPagoPlan({
        accessToken,
        amountCents: command.amountCents,
        backUrl: buildProviderPlanBackUrl(command.tribeSlug),
        currency: command.currency,
        externalReference: buildPriceExternalReference(
          reservation.reserved_price_id
        ),
        idempotencyKey: providerPlanOperationKey,
        name: command.name,
        reason: command.name,
        trialFrequency: command.trialFrequency,
        trialFrequencyType: command.trialFrequencyType,
        ...(traceContext ? { traceContext } : {}),
      });
    } catch (error) {
      await this.releaseProviderPlanPriceReservation(reservation.reserved_price_id);

      throw error;
    }

    const activationResult = await this.attachProviderPlanToReservedPrice({
      mercadoPagoPlanId,
      priceId: reservation.reserved_price_id,
      trialFrequency: command.trialFrequency,
      trialFrequencyType: command.trialFrequencyType,
    });

    if (
      activationResult.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.created &&
      "price" in activationResult
    ) {
      const promotedPriceId = await this.markSoleActivePaidPriceAsCurrent(
        creationContext.tribe_id,
        command.productKey ?? TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership
      );

      if (promotedPriceId === activationResult.price.id) {
        return {
          ...activationResult,
          price: { ...activationResult.price, isCurrent: true },
        };
      }
    }

    return activationResult;
  }

  /**
   * Marks a price as current when it is the tribe's only active paid price.
   *
   * Owners frequently forget to flag their single plan as current, which leaves
   * the tribe without a live paid offering. When exactly one active price with a
   * provider plan exists, it is promoted to current and the synthetic free-join
   * option is cleared, mirroring {@link makeCurrent} atomically and respecting
   * the partial unique index on the current price.
   *
   * The candidate is matched with `in` (not a scalar `= (select ...)`) so that
   * when a tribe already has several active paid prices the predicate stays a
   * safe no-op instead of raising "more than one row returned by a subquery";
   * the `count(*) = 1` guard then keeps the promotion exclusive to the sole
   * active paid price.
   *
   * @param tribeId - Identifier of the tribe that owns the price.
   * @returns Identifier of the promoted price, or null when none was promoted.
   */
  private async markSoleActivePaidPriceAsCurrent(
    tribeId: string,
    productKey: TribeSubscriptionProductKey
  ): Promise<string | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with sole_active_paid_price as (
          select tribe_subscription_prices.id
          from public.tribe_subscription_prices
          where tribe_subscription_prices.tribe_id = ${tribeId}
            and tribe_subscription_prices.product_key = ${productKey}
            and tribe_subscription_prices.status = 'active'
            and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
        ),
        promoted_price as (
          update public.tribe_subscription_prices
          set is_current = true
          where tribe_subscription_prices.id in (
              select id from sole_active_paid_price
            )
            and (select count(*) from sole_active_paid_price) = 1
            and tribe_subscription_prices.is_current = false
            and public.can_manage_tribe_subscription_prices(${tribeId})
          returning id
        ),
        cleared_free_join as (
          update public.tribes
          set free_join_is_current = false
          where tribes.id = ${tribeId}
            -- Only the membership product replaces the free entry (AC-37):
            -- an academy price never closes the basic free join.
            and ${productKey} = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            and exists (select 1 from promoted_price)
            and public.can_manage_tribe_subscription_prices(tribes.id)
          returning id
        )
        select (select id from promoted_price) as promoted_price_id
      `);

      return (
        (result?.rows?.[0] as { promoted_price_id?: string | null } | undefined)
          ?.promoted_price_id ?? null
      );
    });
  }

  private async reserveProviderPlanPrice(
    command: CreateTribeSubscriptionPriceCommand
  ): Promise<PriceReservationRow> {
    return this.executeWithDatabase(async (database) => {
      const reservationResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
          for update
        ),
        active_prices_before_insert as (
          select count(*) as existing_price_count
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.status in (
            'active',
            ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS}
          )
        ),
        reserved_price as (
          insert into public.tribe_subscription_prices (
            tribe_id,
            name,
            amount_cents,
            currency,
            frequency,
            status,
            is_current,
            payment_integration_id,
            trial_frequency,
            trial_frequency_type,
            mercado_pago_preapproval_plan_id,
            product_key,
            created_by,
            created_at
          )
          select
            target_tribe.id,
            ${command.name},
            ${command.amountCents},
            ${command.currency},
            ${command.frequency},
            ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS},
            false,
            ${command.paymentIntegrationId},
            ${command.trialFrequency},
            ${command.trialFrequencyType},
            null,
            ${command.productKey ?? TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership},
            public.current_app_user_id(),
            timezone('utc', now())
          from target_tribe
          where public.can_manage_tribe_subscription_prices(target_tribe.id)
            and (
              select existing_price_count
              from active_prices_before_insert
            ) < ${TRIBE_SUBSCRIPTION_PRICE_LIMIT}
          returning id
        )
        select
          case
            when exists (select 1 from reserved_price) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.created}
            when not exists (select 1 from target_tribe) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            when (
              select existing_price_count
              from active_prices_before_insert
            ) >= ${TRIBE_SUBSCRIPTION_PRICE_LIMIT} then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
          end as status_result,
          (select id from reserved_price) as reserved_price_id
      `);

      return (reservationResult.rows?.[0] ?? null) as PriceReservationRow;
    });
  }

  private async releaseProviderPlanPriceReservation(priceId: string): Promise<void> {
    await this.executeWithDatabase(async (database) => {
      await database.execute(sql`
        update public.tribe_subscription_prices
        set
          status = 'deleted',
          deleted_at = timezone('utc', now())
        where tribe_subscription_prices.id = ${priceId}
          and tribe_subscription_prices.status = ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS}
          and tribe_subscription_prices.mercado_pago_preapproval_plan_id is null
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
      `);
    });
  }

  private async attachProviderPlanToReservedPrice(input: {
    mercadoPagoPlanId: string;
    priceId: string;
    trialFrequency: CreateTribeSubscriptionPriceCommand["trialFrequency"];
    trialFrequencyType: CreateTribeSubscriptionPriceCommand["trialFrequencyType"];
  }): Promise<TribeSubscriptionPriceMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const activationResult = await database.execute(sql`
        with activated_price as (
        update public.tribe_subscription_prices
        set
          mercado_pago_preapproval_plan_id = ${input.mercadoPagoPlanId},
          trial_frequency = ${input.trialFrequency},
          trial_frequency_type = ${input.trialFrequencyType},
          status = 'active'
        where tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status = ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS}
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
        returning id, name, amount_cents, currency, frequency, status, is_current, payment_integration_id, trial_frequency, trial_frequency_type, created_at
        )
        select
          activated_price.id,
          activated_price.name,
          activated_price.amount_cents,
          activated_price.currency,
          activated_price.frequency,
          activated_price.status,
          activated_price.is_current,
          activated_price.payment_integration_id,
          price_payment_integration.account_label as mercado_pago_account_label,
          price_payment_integration.provider_account_email as mercado_pago_account_email,
          price_payment_integration.provider_account_id,
          activated_price.trial_frequency,
          activated_price.trial_frequency_type,
          activated_price.created_at,
          0 as active_subscribers_count
        from activated_price
        left join public.tribe_payment_integrations price_payment_integration
          on price_payment_integration.id = activated_price.payment_integration_id
      `);

      return mapPriceMutationResult(
        (activationResult.rows?.[0]
          ? {
              ...activationResult.rows[0],
              status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
            }
          : null) as SubscriptionPriceMutationRow | null,
        TRIBE_SUBSCRIPTION_PRICE_STATUS.created
      );
    });
  }

  /**
   * Updates the linked provider plan and the local price row in place.
   *
   * @param command - Normalized price update command.
   * @returns Price update result.
   */
  async update(
    command: UpdateTribeSubscriptionPriceCommand
  ): Promise<TribeSubscriptionPriceMutationResult> {
    const updateContext = await this.resolvePriceUpdateContext(command);

    if (!updateContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!updateContext.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    if (updateContext.status !== TRIBE_SUBSCRIPTION_PRICE_STATUS.active) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    const resolvedTrialPeriod = resolveUpdateTrialPeriod(command, updateContext);

    const accessToken = await this.resolveAccessTokenForProviderMutation(
      updateContext
    );

    if (!accessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    if (updateContext.mercado_pago_preapproval_plan_id) {
      const operationKey = buildSubscriptionPriceOperationKey({
        operation: SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.updateProviderPlan,
        priceId: command.priceId,
        tribeSlug: command.tribeSlug,
      });
      const traceContext = buildSubscriptionPricePaymentTraceContext({
        operationKey,
        priceId: command.priceId,
        providerPlanId: updateContext.mercado_pago_preapproval_plan_id,
        requestId: this.requestId,
        tribeSlug: command.tribeSlug,
      });

      await this.updateMercadoPagoPlan({
        accessToken,
        amountCents: command.amountCents,
        backUrl: buildProviderPlanBackUrl(command.tribeSlug),
        currency: command.currency,
        externalReference: buildPriceExternalReference(command.priceId),
        frequency: command.frequency,
        preapprovalPlanId: updateContext.mercado_pago_preapproval_plan_id,
        reason: command.name,
        status: MERCADO_PAGO_PROVIDER_PLAN_STATUS.active,
        ...resolvedTrialPeriod,
        ...(traceContext ? { traceContext } : {}),
      });
    }

    return this.updateLocalPriceMutableFields({
      ...command,
      ...resolvedTrialPeriod,
    });
  }

  /**
   * Resolves the local price, permissions, and provider token state for mutations.
   *
   * @param command - Price update command.
   * @returns Price update context row, or null when no row is available.
   */
  private async resolvePriceUpdateContext(
    command: TribeSubscriptionPriceIdentity
  ): Promise<PriceUpdateContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.tribe_id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.status,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.trial_frequency,
            tribe_subscription_prices.trial_frequency_type,
            tribe_subscription_prices.created_at,
            tribe_subscription_prices.mercado_pago_preapproval_plan_id,
            tribe_subscription_prices.payment_integration_id
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status in ${MANAGEABLE_PROVIDER_PLAN_PRICE_STATUSES}
          limit 1
        )
        select
          target_price.id,
          target_price.tribe_id,
          target_price.name,
          target_price.amount_cents,
          target_price.currency,
          target_price.frequency,
          target_price.status,
          target_price.is_current,
          target_price.trial_frequency,
          target_price.trial_frequency_type,
          target_price.created_at,
          target_price.mercado_pago_preapproval_plan_id,
          target_price.payment_integration_id,
          0 as active_subscribers_count,
          coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        left join target_price
          on true
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.id = target_price.payment_integration_id
          and tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as PriceUpdateContextRow | null;
    });
  }

  /**
   * Resolves an access token for provider mutations from a stored context row.
   *
   * @param mutationContext - Stored provider token context.
   * @returns Fresh provider access token, or null when unavailable.
   */
  private async resolveAccessTokenForProviderMutation(
    mutationContext: ProviderTokenContext
  ): Promise<string | null> {
    return resolveMercadoPagoAccessToken({
      executeWithDatabase: this.executeWithDatabase,
      refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
      storedToken: {
        accessToken: mutationContext.access_token ?? null,
        paymentIntegrationId: mutationContext.payment_integration_id ?? null,
        refreshToken: mutationContext.refresh_token ?? null,
        tokenExpiresAt: mutationContext.token_expires_at ?? null,
        tribeId: mutationContext.tribe_id ?? null,
      },
    }).catch(() => null);
  }

  /**
   * Resolves and reuses one fresh access token per Mercado Pago account.
   *
   * @param mutationContext - Stored provider token context.
   * @param accessTokensByPaymentIntegrationId - Request-local account token cache.
   * @returns Fresh provider access token, or null when unavailable.
   */
  private async resolveAccessTokenForProviderMutationWithCache(
    mutationContext: ProviderTokenContext,
    accessTokensByPaymentIntegrationId: Map<string, string>
  ): Promise<string | null> {
    const paymentIntegrationId = mutationContext.payment_integration_id ?? null;

    if (paymentIntegrationId) {
      const cachedAccessToken =
        accessTokensByPaymentIntegrationId.get(paymentIntegrationId);

      if (cachedAccessToken) {
        return cachedAccessToken;
      }
    }

    const accessToken = await this.resolveAccessTokenForProviderMutation(
      mutationContext
    );

    if (paymentIntegrationId && accessToken) {
      accessTokensByPaymentIntegrationId.set(paymentIntegrationId, accessToken);
    }

    return accessToken;
  }

  /**
   * Persists mutable local price fields after Mercado Pago accepts the change.
   *
   * @param command - Price update command.
   * @returns Updated price mutation result.
   */
  private async updateLocalPriceMutableFields(
    command: UpdateTribeSubscriptionPriceCommand
  ): Promise<TribeSubscriptionPriceMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.mercado_pago_preapproval_plan_id
          from public.tribe_subscription_prices
          where tribe_subscription_prices.tribe_id = (select id from target_tribe)
            and tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status = 'active'
            and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
          limit 1
        ),
        snapshotted_subscriptions as (
          select public.snapshot_tribe_member_subscriptions_before_price_change(
            (select id from target_price)
          ) as updated_count
        ),
        updated_price as (
          update public.tribe_subscription_prices
          set
            name = ${command.name},
            amount_cents = ${command.amountCents},
            currency = ${command.currency},
            frequency = ${command.frequency},
            trial_frequency = ${command.trialFrequency},
            trial_frequency_type = ${command.trialFrequencyType}
          where tribe_subscription_prices.id = (select id from target_price)
            and exists (select 1 from snapshotted_subscriptions)
          returning id, name, amount_cents, currency, frequency, status, is_current, payment_integration_id, trial_frequency, trial_frequency_type, created_at
        ),
        subscriber_counts as (
          select
            count(tribe_member_subscriptions.id) filter (
              where tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
            ) as active_subscribers_count
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.price_id = (select id from target_price)
        )
        select
          ${TRIBE_SUBSCRIPTION_PRICE_STATUS.updated} as status_result,
          updated_price.id,
          updated_price.name,
          updated_price.amount_cents,
          updated_price.currency,
          updated_price.frequency,
          updated_price.status,
          updated_price.is_current,
          updated_price.payment_integration_id,
          price_payment_integration.account_label as mercado_pago_account_label,
          price_payment_integration.provider_account_email as mercado_pago_account_email,
          price_payment_integration.provider_account_id,
          updated_price.trial_frequency,
          updated_price.trial_frequency_type,
          updated_price.created_at,
          subscriber_counts.active_subscribers_count
        from updated_price
        cross join subscriber_counts
        cross join snapshotted_subscriptions
        left join public.tribe_payment_integrations price_payment_integration
          on price_payment_integration.id = updated_price.payment_integration_id
      `);

      return mapPriceMutationResult(
        (result.rows?.[0] ?? null) as SubscriptionPriceMutationRow | null,
        TRIBE_SUBSCRIPTION_PRICE_STATUS.updated
      );
    });
  }

  /**
   * Marks a price as current for new members without touching existing subscribers.
   *
   * @param command - Price identity command.
   * @returns Current price mutation result.
   */
  async makeCurrent(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionPriceMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const targetResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
          for update
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.status,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.product_key,
            tribe_subscription_prices.created_at
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status = 'active'
            and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
          limit 1
        )
        select
          case
            when not exists (select 1 from target_tribe) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            when not exists (select 1 from target_price) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            when not public.can_manage_tribe_subscription_prices((select id from target_tribe)) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.current}
          end as status_result,
          target_price.id,
          target_price.name,
          target_price.amount_cents,
          target_price.currency,
          target_price.frequency,
          target_price.status,
          target_price.is_current,
          target_price.product_key,
          target_price.created_at,
          0 as active_subscribers_count
        from (select 1) result
        left join target_price
          on true
      `);
      const targetRow = (targetResult.rows?.[0] ?? null) as
        | SubscriptionPriceMutationRow
        | null;
      const targetProductKey =
        targetRow?.product_key ?? TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership;

      if (targetRow?.status_result !== TRIBE_SUBSCRIPTION_PRICE_STATUS.current) {
        return mapPriceMutationResult(
          targetRow,
          TRIBE_SUBSCRIPTION_PRICE_STATUS.current
        );
      }

      await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        )
        update public.tribe_subscription_prices
        set is_current = false
        where tribe_subscription_prices.tribe_id = (select id from target_tribe)
          and tribe_subscription_prices.id <> ${command.priceId}
          and tribe_subscription_prices.product_key = ${targetProductKey}
          and tribe_subscription_prices.is_current = true
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
      `);

      const currentResult = await database.execute(sql`
        update public.tribe_subscription_prices
        set is_current = true
        where tribe_subscription_prices.id = ${command.priceId}
          and tribe_subscription_prices.status = 'active'
          and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
        returning
          ${TRIBE_SUBSCRIPTION_PRICE_STATUS.current} as status_result,
          id, name, amount_cents, currency, frequency, status, is_current,
          trial_frequency, trial_frequency_type, created_at,
          0 as active_subscribers_count
      `);

      const currentRow = (currentResult.rows?.[0] ?? null) as
        | SubscriptionPriceMutationRow
        | null;

      if (currentRow?.status_result !== TRIBE_SUBSCRIPTION_PRICE_STATUS.current) {
        throw new Error(
          `Tribe subscription price ${command.priceId} for tribe ${command.tribeSlug} became ineligible while marking it as current`
        );
      }

      // Only a membership price replaces the free entry; an academy price is
      // an independent product and keeps the basic free join (AC-37).
      if (targetProductKey === TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership) {
        await database.execute(sql`
          update public.tribes
          set free_join_is_current = false
          where tribes.slug = ${command.tribeSlug}
            and public.can_manage_tribe_subscription_prices(tribes.id)
        `);
      }

      return mapPriceMutationResult(
        currentRow,
        TRIBE_SUBSCRIPTION_PRICE_STATUS.current
      );
    });
  }

  /**
   * Marks the synthetic free-join option as the tribe's current offering,
   * atomically clearing any paid price flagged as current.
   *
   * @param command - Tribe identity for the free-join toggle.
   * @returns Mutation outcome reflecting permission and existence checks.
   */
  /**
   * Toggles the tokenless free open join. The write goes through the
   * leader-guarded definer because public.tribes has no leader UPDATE
   * policy; a non-leader resolves to forbidden without writing.
   */
  async setOpenFreeJoin(
    command: SetTribeOpenFreeJoinCommand
  ): Promise<TribeFreeJoinMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select public.set_tribe_open_free_join(
          ${command.tribeSlug},
          ${command.enabled}
        ) as applied
      `);
      const row = (result.rows?.[0] ?? null) as {
        applied?: boolean | null;
      } | null;

      return {
        status: row?.applied
          ? TRIBE_SUBSCRIPTION_PRICE_STATUS.current
          : TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
      };
    });
  }

  async setFreeJoinAsCurrent(
    command: SetTribeFreeJoinAsCurrentCommand
  ): Promise<TribeFreeJoinMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const validationResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
          for update
        )
        select
          case
            when not exists (select 1 from target_tribe) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            when not public.can_manage_tribe_subscription_prices((select id from target_tribe)) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.current}
          end as status_result
      `);
      const validationRow =
        (validationResult.rows?.[0] ?? null) as { status_result?: string } | null;

      if (
        validationRow?.status_result !== TRIBE_SUBSCRIPTION_PRICE_STATUS.current
      ) {
        return {
          status:
            (validationRow?.status_result as TribeFreeJoinMutationResult["status"]) ??
            TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound,
        };
      }

      await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        )
        update public.tribe_subscription_prices
        set is_current = false
        where tribe_subscription_prices.tribe_id = (select id from target_tribe)
          and tribe_subscription_prices.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
          and tribe_subscription_prices.is_current = true
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
      `);

      const updateResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        updated_tribe as (
          update public.tribes
          set free_join_is_current = true
          where tribes.id = (select id from target_tribe)
            and public.can_manage_tribe_subscription_prices(tribes.id)
          returning id
        )
        select
          case
            when exists (select 1 from updated_tribe) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.current}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
          end as status_result
      `);
      const updateRow =
        (updateResult.rows?.[0] ?? null) as { status_result?: string } | null;

      return {
        status:
          (updateRow?.status_result as TribeFreeJoinMutationResult["status"]) ??
          TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
      };
    });
  }

  /**
   * Verifies all active local prices against their Mercado Pago plan.
   *
   * @param query - Tribe slug query.
   * @returns Provider plan verification result with the refreshed price list.
   */
  async verifyProviderPlans(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeSubscriptionProviderPlansVerificationResult> {
    const verificationContext = await this.resolveProviderPlanVerificationContext(
      query.tribeSlug
    );
    const verificationFailure = this.resolveVerificationFailure(
      verificationContext
    );

    if (verificationFailure) {
      return verificationFailure;
    }

    const providerPlanPrices = await this.listProviderPlanPrices({
      tribeSlug: query.tribeSlug,
    });
    const providerPlanAccessTokens = new Map<string, string>();

    for (const providerPlanPrice of providerPlanPrices) {
      if (!providerPlanPrice.mercado_pago_preapproval_plan_id) {
        continue;
      }

      const accessToken =
        await this.resolveAccessTokenForProviderMutationWithCache(
          providerPlanPrice,
          providerPlanAccessTokens
        );

      if (!accessToken) {
        return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
      }

      providerPlanAccessTokens.set(providerPlanPrice.id, accessToken);
    }

    const canceledPriceIds = (
      await Promise.all(
        providerPlanPrices.map(async (providerPlanPrice) => {
          const providerPlanAccessToken =
            providerPlanAccessTokens.get(providerPlanPrice.id) ?? null;
          const traceContext = providerPlanPrice.mercado_pago_preapproval_plan_id
            ? buildSubscriptionPricePaymentTraceContext({
                operationKey: buildSubscriptionPriceOperationKey({
                  operation:
                    SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.verifyProviderPlan,
                  priceId: providerPlanPrice.id,
                  tribeSlug: query.tribeSlug,
                }),
                priceId: providerPlanPrice.id,
                providerPlanId:
                  providerPlanPrice.mercado_pago_preapproval_plan_id,
                requestId: this.requestId,
                tribeSlug: query.tribeSlug,
              })
            : undefined;
          const providerPlanStatus =
            providerPlanPrice.mercado_pago_preapproval_plan_id &&
            providerPlanAccessToken
              ? await this.getMercadoPagoPlanStatus({
                  accessToken: providerPlanAccessToken,
                  preapprovalPlanId:
                    providerPlanPrice.mercado_pago_preapproval_plan_id,
                  ...(traceContext ? { traceContext } : {}),
                })
              : null;

          if (providerPlanStatus === MERCADO_PAGO_PROVIDER_PLAN_STATUS.active) {
            if (
              providerPlanPrice.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.paused
            ) {
              await this.reactivatePausedProviderPlanPrice({
                priceId: providerPlanPrice.id,
              });
            }

            return null;
          }

          if (providerPlanStatus === MERCADO_PAGO_PROVIDER_PLAN_STATUS.paused) {
            await this.pauseProviderPlanPriceFromWebhook({
              priceId: providerPlanPrice.id,
            });

            return null;
          }

          const canceledPrice = await this.cancelProviderPlanPrice({
            priceId: providerPlanPrice.id,
            tribeSlug: query.tribeSlug,
          });

          return canceledPrice?.id ?? null;
        })
      )
    ).filter((priceId): priceId is string => Boolean(priceId));

    const refreshedPriceList = await this.listByTribeSlug(query);

    return {
      canceledPriceIds,
      freeJoinIsCurrent: refreshedPriceList.freeJoinIsCurrent,
      prices: refreshedPriceList.prices,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: providerPlanPrices.length,
    };
  }

  /**
   * Verifies one active local price against its Mercado Pago plan.
   *
   * @param command - Price identity command.
   * @returns Provider plan verification result.
   */
  async verifyProviderPlan(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionProviderPlanVerificationResult> {
    const verificationContext = await this.resolveProviderPlanVerificationContext(
      command.tribeSlug
    );
    const verificationFailure = this.resolveVerificationFailure(
      verificationContext
    );

    if (verificationFailure) {
      return verificationFailure;
    }

    const providerPlanPrice =
      await this.readProviderSubscriberVerificationPrice({
        priceId: command.priceId,
        tribeSlug: command.tribeSlug,
      });

    if (!providerPlanPrice) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    const providerPlanAccessToken =
      await this.resolveAccessTokenForProviderMutation(providerPlanPrice);

    if (!providerPlanAccessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    const traceContext = providerPlanPrice.mercado_pago_preapproval_plan_id
      ? buildSubscriptionPricePaymentTraceContext({
          operationKey: buildSubscriptionPriceOperationKey({
            operation:
              SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.verifyProviderPlan,
            priceId: providerPlanPrice.id,
            tribeSlug: command.tribeSlug,
          }),
          priceId: providerPlanPrice.id,
          providerPlanId: providerPlanPrice.mercado_pago_preapproval_plan_id,
          requestId: this.requestId,
          tribeSlug: command.tribeSlug,
        })
      : undefined;
    const providerPlanStatus =
      providerPlanPrice.mercado_pago_preapproval_plan_id
        ? await this.getMercadoPagoPlanStatus({
            accessToken: providerPlanAccessToken,
            preapprovalPlanId: providerPlanPrice.mercado_pago_preapproval_plan_id,
            ...(traceContext ? { traceContext } : {}),
          })
        : null;

    if (
      providerPlanStatus === MERCADO_PAGO_PROVIDER_PLAN_STATUS.active &&
      providerPlanPrice.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.paused
    ) {
      const reactivatedPrice = await this.reactivatePausedProviderPlanPrice({
        priceId: providerPlanPrice.id,
      });

      return reactivatedPrice
        ? {
            price: reactivatedPrice,
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
          }
        : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (providerPlanStatus === MERCADO_PAGO_PROVIDER_PLAN_STATUS.paused) {
      const pausedPrice = await this.pauseProviderPlanPriceFromWebhook({
        priceId: providerPlanPrice.id,
      });

      if (!pausedPrice) {
        return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
      }

      const refreshedPriceList = await this.listByTribeSlug({
        tribeSlug: command.tribeSlug,
      });

      return {
        freeJoinIsCurrent: refreshedPriceList.freeJoinIsCurrent,
        price: pausedPrice,
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      };
    }

    if (providerPlanStatus !== MERCADO_PAGO_PROVIDER_PLAN_STATUS.active) {
      const canceledPrice = await this.cancelProviderPlanPrice({
        priceId: providerPlanPrice.id,
        tribeSlug: command.tribeSlug,
      });
      const refreshedPriceList = await this.listByTribeSlug({
        tribeSlug: command.tribeSlug,
      });

      return {
        freeJoinIsCurrent: refreshedPriceList.freeJoinIsCurrent,
        price: canceledPrice ?? {
          ...mapSubscriptionPrice(providerPlanPrice),
          isCurrent: false,
          status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
        },
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      };
    }

    return {
      price: mapSubscriptionPrice(providerPlanPrice),
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    };
  }

  /**
   * Reconciles real Mercado Pago subscribers for one local price.
   *
   * @param command - Reconciliation command with price identity and trigger source.
   * @returns Provider subscriber reconciliation result with a provider-backed count.
   */
  async reconcileProviderSubscribers(
    command: TribeProviderSubscriberReconciliationCommand
  ): Promise<TribeProviderSubscriberReconciliationResult> {
    const verificationContext = await this.resolveProviderPlanVerificationContext(
      command.tribeSlug
    );
    const verificationFailure = this.resolveVerificationFailure(
      verificationContext
    );

    if (verificationFailure) {
      return verificationFailure;
    }

    const providerPlanPrice = (
      await this.listProviderPlanPrices({
        includeCanceled: true,
        priceId: command.priceId,
        tribeSlug: command.tribeSlug,
      })
    )[0];

    if (!providerPlanPrice) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    const providerPlanAccessToken =
      await this.resolveAccessTokenForProviderMutation(providerPlanPrice);

    if (!providerPlanAccessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    const providerSubscribers = await this.listProviderSubscribers({
      priceId: command.priceId,
      tribeSlug: command.tribeSlug,
    });
    const providerSubscriptionStatuses =
      await readProviderSubscriptionStatuses({
        accessToken: providerPlanAccessToken,
        getMercadoPagoSubscriptionStatus:
          this.getMercadoPagoSubscriptionStatus,
        operationKey: buildSubscriptionPriceOperationKey({
          operation:
            SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.verifyProviderSubscribers,
          priceId: command.priceId,
          source: command.source,
          tribeSlug: command.tribeSlug,
        }),
        priceId: command.priceId,
        providerSubscribers,
        requestId: this.requestId,
        tribeSlug: command.tribeSlug,
      });
    const providerSubscriberStatusUpdates =
      buildProviderSubscriberStatusUpdates({
        providerSubscribers,
        providerSubscriptionStatuses,
      });
    const activeSubscribersCount = providerSubscriptionStatuses.filter(
      (providerSubscriptionStatus) =>
        mapMercadoPagoSubscriptionStatus(providerSubscriptionStatus)
          .isAttachedToProviderPlan
    ).length;
    const reconciledPrice = await this.reconcileProviderSubscriberStatuses({
      priceId: command.priceId,
      providerSubscriberStatusUpdates,
      tribeSlug: command.tribeSlug,
    });

    if (!reconciledPrice) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    return {
      price: reconciledPrice,
      providerActiveSubscribersCount: activeSubscribersCount,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: providerSubscribers.length,
    };
  }

  /**
   * Synchronizes a Mercado Pago plan webhook into the linked local price.
   *
   * @param command - Provider plan webhook command.
   * @returns Provider plan synchronization result.
   */
  async syncProviderPlan(
    command: SyncTribeSubscriptionProviderPlanCommand
  ): Promise<TribeSubscriptionProviderPlanSyncResult> {
    const webhookContext = await this.resolveProviderPlanWebhookContext(
      command.resourceId
    );

    if (!webhookContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    const accessToken =
      await this.resolveAccessTokenForProviderMutation(webhookContext);

    if (!accessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    const operationKeyPrefix = [
      SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.syncProviderPlanWebhook,
      command.resourceId,
    ].join(":");
    const traceContext = buildSubscriptionPricePaymentTraceContext({
      operationKey: operationKeyPrefix,
      priceId: webhookContext.id,
      providerPlanId: command.resourceId,
      requestId: this.requestId,
    });
    const providerPlan = await this.getMercadoPagoPlan({
      accessToken,
      preapprovalPlanId: command.resourceId,
      ...(traceContext ? { traceContext } : {}),
    });
    const linkedPriceId = parsePriceIdFromExternalReference(
      providerPlan?.externalReference ?? null
    );

    if (linkedPriceId && linkedPriceId !== webhookContext.id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    const contentHash = buildProviderPlanContentHash(providerPlan);
    const webhookRegistration = {
      contentHash,
      providerPlanId: command.resourceId,
      resourceId: command.resourceId,
      topic: command.topic,
      tribeId: webhookContext.tribe_id,
    };
    const shouldProcessWebhook = await this.registerProviderPlanWebhook(
      webhookRegistration
    );

    if (
      !shouldProcessWebhook &&
      arePlanStatesEquivalent({ providerPlan, webhookContext })
    ) {
      return {
        price: mapSubscriptionPrice(webhookContext),
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      };
    }

    try {
      if (providerPlan?.status === MERCADO_PAGO_PROVIDER_PLAN_STATUS.paused) {
        const pausedPrice = await this.pauseProviderPlanPriceFromWebhook({
          priceId: webhookContext.id,
        });

        return pausedPrice
          ? {
              price: pausedPrice,
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
            }
          : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
      }

      if (providerPlan?.status !== MERCADO_PAGO_PROVIDER_PLAN_STATUS.active) {
        const canceledPrice = await this.cancelProviderPlanPriceFromWebhook({
          priceId: webhookContext.id,
        });

        return canceledPrice
          ? {
              price: canceledPrice,
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
            }
          : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
      }

        const updatedPrice = await this.updateLocalPriceMutableFieldsFromWebhook({
        amountCents: providerPlan.amountCents ?? webhookContext.amount_cents,
        currency:
          providerPlan.currency === TRIBE_SUBSCRIPTION_CURRENCY.ars
            ? providerPlan.currency
            : webhookContext.currency,
        frequency: webhookContext.frequency,
        name: providerPlan.reason ?? webhookContext.name,
        priceId: webhookContext.id,
        trialFrequency: providerPlan.trial?.frequency ?? null,
        trialFrequencyType: providerPlan.trial?.frequencyType ?? null,
      });

      return updatedPrice
        ? {
            price: updatedPrice,
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
          }
        : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    } catch (error) {
      if (shouldProcessWebhook) {
        await this.releaseProviderPlanWebhookRegistration(webhookRegistration);
      }

      throw error;
    }
  }

  /**
   * Resolves a local price and provider token context from a Mercado Pago plan id.
   *
   * @param providerPlanId - Mercado Pago preapproval plan identifier.
   * @returns Webhook synchronization context, or null when no linked price exists.
   */
  private async resolveProviderPlanWebhookContext(
    providerPlanId: string
  ): Promise<ProviderPlanWebhookContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          tribe_subscription_prices.id,
          tribe_subscription_prices.tribe_id,
          tribe_subscription_prices.name,
          tribe_subscription_prices.amount_cents,
          tribe_subscription_prices.currency,
          tribe_subscription_prices.frequency,
          tribe_subscription_prices.status,
          tribe_subscription_prices.is_current,
          tribe_subscription_prices.trial_frequency,
          tribe_subscription_prices.trial_frequency_type,
          tribe_subscription_prices.created_at,
          tribe_subscription_prices.mercado_pago_preapproval_plan_id,
          tribe_subscription_prices.payment_integration_id,
          0 as active_subscribers_count,
          tribe_payment_integrations.id as payment_integration_id,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from public.tribe_subscription_prices
        inner join public.tribe_payment_integrations
          on tribe_payment_integrations.id = tribe_subscription_prices.payment_integration_id
          and tribe_payment_integrations.tribe_id = tribe_subscription_prices.tribe_id
          and tribe_payment_integrations.provider = 'mercado_pago'
        where tribe_subscription_prices.mercado_pago_preapproval_plan_id = ${providerPlanId}
          and tribe_subscription_prices.status in ${MANAGEABLE_PROVIDER_PLAN_PRICE_STATUSES}
        limit 1
      `);

      return (result.rows?.[0] ?? null) as
        | ProviderPlanWebhookContextRow
        | null;
    });
  }

  /**
   * Registers a provider plan webhook for idempotent processing.
   *
   * @param input - Webhook identity and local tribe context.
   * @returns Whether the webhook was newly registered and should be processed.
   */
  private async registerProviderPlanWebhook(input: {
    contentHash: string;
    providerPlanId: string;
    resourceId: string;
    topic: string;
    tribeId: string;
  }): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const operationKey = buildProviderPlanWebhookOperationKey(input);
      const result = await database.execute(sql`
        insert into public.subscription_idempotency_operations (
          operation_key,
          operation_type,
          tribe_id,
          user_id,
          payload_hash,
          response_body
        )
        values (
          ${operationKey},
          'mercado_pago_plan_webhook',
          ${input.tribeId},
          null,
          ${input.topic + ":" + input.resourceId},
          '{}'::jsonb
        )
        on conflict (operation_key) do nothing
        returning id
      `);

      return Boolean(result.rows?.[0]);
    });
  }

  /**
   * Releases a failed provider plan webhook registration so Mercado Pago can retry it.
   *
   * @param input - Webhook identity and local tribe context.
   * @returns Promise resolved after the registration is removed.
   */
  private async releaseProviderPlanWebhookRegistration(input: {
    contentHash: string;
    providerPlanId: string;
    resourceId: string;
    topic: string;
    tribeId: string;
  }): Promise<void> {
    await this.executeWithDatabase(async (database) => {
      const operationKey = buildProviderPlanWebhookOperationKey(input);

      await database.execute(sql`
        delete from public.subscription_idempotency_operations
        where subscription_idempotency_operations.operation_key = ${operationKey}
          and subscription_idempotency_operations.operation_type = 'mercado_pago_plan_webhook'
          and subscription_idempotency_operations.tribe_id = ${input.tribeId}
          and subscription_idempotency_operations.payload_hash = ${input.topic + ":" + input.resourceId}
      `);
    });
  }

  /**
   * Updates mutable local price fields from a verified Mercado Pago webhook.
   *
   * @param input - Local price identifier and provider plan fields.
   * @returns Updated price, or null when no row was changed.
   */
  private async updateLocalPriceMutableFieldsFromWebhook(input: {
    amountCents: number;
    currency: "ARS";
    frequency: "monthly";
    name: string;
    priceId: string;
    trialFrequency: number | null;
    trialFrequencyType: "days" | "months" | null;
  }): Promise<TribeSubscriptionPriceResult | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.mercado_pago_preapproval_plan_id
          from public.tribe_subscription_prices
          where tribe_subscription_prices.id = ${input.priceId}
            and tribe_subscription_prices.status in ${LIVE_PROVIDER_PLAN_PRICE_STATUSES}
          limit 1
        ),
        snapshotted_subscriptions as (
          select public.snapshot_tribe_member_subscriptions_before_price_change(
            (select id from target_price)
          ) as updated_count
        ),
        updated_price as (
          update public.tribe_subscription_prices
          set
            name = ${input.name},
            amount_cents = ${input.amountCents},
            currency = ${input.currency},
            frequency = ${input.frequency},
            trial_frequency = ${input.trialFrequency},
            trial_frequency_type = ${input.trialFrequencyType},
            status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.active}
          where tribe_subscription_prices.id = (select id from target_price)
            and exists (select 1 from snapshotted_subscriptions)
          returning id, name, amount_cents, currency, frequency, status, is_current, payment_integration_id, trial_frequency, trial_frequency_type, created_at
        ),
        subscriber_counts as (
          select
            count(tribe_member_subscriptions.id) filter (
              where tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
            ) as active_subscribers_count
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.price_id = (select id from target_price)
        )
        select
          updated_price.id,
          updated_price.name,
          updated_price.amount_cents,
          updated_price.currency,
          updated_price.frequency,
          updated_price.status,
          updated_price.is_current,
          updated_price.payment_integration_id,
          price_payment_integration.account_label as mercado_pago_account_label,
          price_payment_integration.provider_account_email as mercado_pago_account_email,
          price_payment_integration.provider_account_id,
          updated_price.trial_frequency,
          updated_price.trial_frequency_type,
          updated_price.created_at,
          subscriber_counts.active_subscribers_count
        from updated_price
        cross join subscriber_counts
        cross join snapshotted_subscriptions
        left join public.tribe_payment_integrations price_payment_integration
          on price_payment_integration.id = updated_price.payment_integration_id
      `);
      const row = (result.rows?.[0] ?? null) as SubscriptionPriceRow | null;

      return row ? mapSubscriptionPrice(row) : null;
    });
  }

  /**
   * Cancels a local price from a verified Mercado Pago webhook.
   *
   * @param input - Local price identifier.
   * @returns Updated price, or null when no row was changed.
   */
  private async cancelProviderPlanPriceFromWebhook(input: {
    priceId: string;
  }): Promise<TribeSubscriptionPriceResult | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.tribe_id,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.product_key
          from public.tribe_subscription_prices
          where tribe_subscription_prices.id = ${input.priceId}
            and tribe_subscription_prices.status in ${LIVE_PROVIDER_PLAN_PRICE_STATUSES}
          limit 1
        ),
        updated_price as (
          update public.tribe_subscription_prices
          set
            status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled},
            is_current = false
          where tribe_subscription_prices.id = (select id from target_price)
          returning id, name, amount_cents, currency, frequency, status, is_current, trial_frequency, trial_frequency_type, created_at, 0 as active_subscribers_count
        ),
        updated_tribe as (
          update public.tribes
          set free_join_is_current = true
          where tribes.id = (select tribe_id from target_price)
            and exists (select 1 from updated_price)
            and exists (
              select 1
              from target_price
              where target_price.is_current = true
                and target_price.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            )
            and not exists (
              select 1
              from public.tribe_subscription_prices
              where tribe_subscription_prices.tribe_id = (select tribe_id from target_price)
                and tribe_subscription_prices.id <> (select id from target_price)
                and tribe_subscription_prices.is_current = true
                and tribe_subscription_prices.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
                and tribe_subscription_prices.status = 'active'
                and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
            )
          returning id
        )
        select
          updated_price.id,
          updated_price.name,
          updated_price.amount_cents,
          updated_price.currency,
          updated_price.frequency,
          updated_price.status,
          updated_price.is_current,
          updated_price.trial_frequency,
          updated_price.trial_frequency_type,
          updated_price.created_at,
          updated_price.active_subscribers_count
        from updated_price
      `);
      const row = (result.rows?.[0] ?? null) as SubscriptionPriceRow | null;

      return row ? mapSubscriptionPrice(row) : null;
    });
  }

  /**
   * Resolves authorization and token context for provider plan verification.
   *
   * @param tribeSlug - Tribe slug used to scope the verification.
   * @returns Database context required to call Mercado Pago.
   */
  private async resolveProviderPlanVerificationContext(
    tribeSlug: string
  ): Promise<PriceVerificationContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        )
        select
          (select id from target_tribe) as tribe_id,
          coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices,
          tribe_payment_integrations.id as payment_integration_id,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as PriceVerificationContextRow | null;
    });
  }

  /**
   * Resolves stable verification failures before account-specific work starts.
   *
   * @param verificationContext - Database context for the tribe integration.
   * @returns Stable failure result, or null when verification may continue.
   */
  private resolveVerificationFailure(
    verificationContext: PriceVerificationContextRow | null
  ):
    | {
        status:
          | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden
          | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound;
      }
    | null {
    if (!verificationContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!verificationContext.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    return null;
  }

  /**
   * Reads a price that can have its stored subscribers verified against Mercado Pago.
   *
   * @param input - Tribe and price identifiers used to scope the verification.
   * @returns Price row for active or canceled prices, or null when unavailable.
   */
  private async readProviderSubscriberVerificationPrice(input: {
    priceId: string;
    tribeSlug: string;
  }): Promise<SubscriptionProviderPlanRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        select
          tribe_subscription_prices.id,
          tribe_subscription_prices.name,
          tribe_subscription_prices.amount_cents,
          tribe_subscription_prices.currency,
          tribe_subscription_prices.frequency,
          tribe_subscription_prices.status,
          tribe_subscription_prices.is_current,
          tribe_subscription_prices.trial_frequency,
          tribe_subscription_prices.trial_frequency_type,
          tribe_subscription_prices.created_at,
          tribe_subscription_prices.mercado_pago_preapproval_plan_id,
          tribe_subscription_prices.payment_integration_id,
          tribe_payment_integrations.account_label as mercado_pago_account_label,
          tribe_payment_integrations.provider_account_email as mercado_pago_account_email,
          tribe_payment_integrations.provider_account_id,
          target_tribe.id as tribe_id,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
          ) as active_subscribers_count
        from public.tribe_subscription_prices
        inner join target_tribe
          on target_tribe.id = tribe_subscription_prices.tribe_id
        left join public.tribe_member_subscriptions
          on tribe_member_subscriptions.price_id = tribe_subscription_prices.id
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.id = tribe_subscription_prices.payment_integration_id
          and tribe_payment_integrations.tribe_id = target_tribe.id
          and tribe_payment_integrations.provider = 'mercado_pago'
        where tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status in ${MANAGEABLE_PROVIDER_PLAN_PRICE_STATUSES}
          and public.can_manage_tribe_subscription_prices(target_tribe.id)
        group by
          tribe_subscription_prices.id,
          target_tribe.id,
          tribe_payment_integrations.account_label,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.provider_account_email,
          tribe_payment_integrations.provider_account_id,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        limit 1
      `);

      return (result.rows?.[0] ?? null) as
        | SubscriptionProviderPlanRow
        | null;
    });
  }

  /**
   * Persists provider-backed subscriber statuses and recalculates local member access.
   *
   * @param input - Price identity and verified subscriber status updates.
   * @returns Reconciled price row with the updated association count.
   */
  private async reconcileProviderSubscriberStatuses(input: {
    priceId: string;
    providerSubscriberStatusUpdates: SubscriptionProviderSubscriberStatusUpdate[];
    tribeSlug: string;
  }): Promise<TribeSubscriptionPriceResult | null> {
    if (input.providerSubscriberStatusUpdates.length === 0) {
      const price = await this.readProviderSubscriberVerificationPrice({
        priceId: input.priceId,
        tribeSlug: input.tribeSlug,
      });

      return price ? mapSubscriptionPrice(price) : null;
    }

    const statusUpdatesJson = JSON.stringify(
      input.providerSubscriberStatusUpdates
    );

    return this.executeWithDatabase(async (database) => {
      await lockSubscriptionMembershipTribes(database,{tribeSlug:input.tribeSlug});
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.product_key,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.status,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.trial_frequency,
            tribe_subscription_prices.trial_frequency_type,
            tribe_subscription_prices.created_at
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.id = ${input.priceId}
            and tribe_subscription_prices.status in ${MANAGEABLE_PROVIDER_PLAN_PRICE_STATUSES}
            and public.can_manage_tribe_subscription_prices(target_tribe.id)
          limit 1
        ),
        provider_statuses as (
          select
            provider_statuses.provider_subscription_id,
            provider_statuses.subscription_status,
            provider_statuses.status_reason
          from jsonb_to_recordset(${statusUpdatesJson}::jsonb) as provider_statuses(
            provider_subscription_id text,
            subscription_status text,
            status_reason text
          )
        ),
        updated_subscriptions as (
          update public.tribe_member_subscriptions
          set
            status = provider_statuses.subscription_status,
            status_reason = provider_statuses.status_reason,
            updated_at = timezone('utc', now())
          from provider_statuses,
            target_price
          where tribe_member_subscriptions.price_id = target_price.id
            and tribe_member_subscriptions.mercado_pago_preapproval_id =
              provider_statuses.provider_subscription_id
          returning tribe_member_subscriptions.id,tribe_member_subscriptions.tribe_id,tribe_member_subscriptions.user_id,
            tribe_member_subscriptions.price_id,tribe_member_subscriptions.status,tribe_member_subscriptions.product_key
        ),
        ${buildReconciledSubscriptionsSql()},
        affected_members as (
          select distinct
            updated_subscriptions.tribe_id,
            updated_subscriptions.user_id
          from updated_subscriptions
          where updated_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
        ),
        updated_members as (
          ${buildSubscriptionMembershipUpdateSql()}
          returning tribe_members.user_id
        )
        select
          target_price.id,
          target_price.product_key,
          target_price.name,
          target_price.amount_cents,
          target_price.currency,
          target_price.frequency,
          target_price.status,
          target_price.is_current,
          target_price.trial_frequency,
          target_price.trial_frequency_type,
          target_price.created_at,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
          ) as active_subscribers_count
        from target_price
        left join reconciled_subscriptions tribe_member_subscriptions
          on tribe_member_subscriptions.price_id = target_price.id
        group by
          target_price.id,
          target_price.product_key,
          target_price.name,
          target_price.amount_cents,
          target_price.currency,
          target_price.frequency,
          target_price.status,
          target_price.is_current,
          target_price.trial_frequency,
          target_price.trial_frequency_type,
          target_price.created_at
      `);
      const row = (result.rows?.[0] ?? null) as SubscriptionPriceRow | null;

      return row ? mapSubscriptionPrice(row) : null;
    });
  }

  /**
   * Lists local visible prices that can be verified against Mercado Pago.
   *
   * @param input - Tribe and optional price filter.
   * @returns Price rows with provider plan identifiers.
   */
  private async listProviderPlanPrices(input: {
    includeCanceled?: boolean;
    priceId?: string;
    tribeSlug: string;
  }): Promise<SubscriptionProviderPlanRow[]> {
    const statusFilter = input.includeCanceled
      ? sql`tribe_subscription_prices.status in ${MANAGEABLE_PROVIDER_PLAN_PRICE_STATUSES}`
      : sql`tribe_subscription_prices.status in ${LIVE_PROVIDER_PLAN_PRICE_STATUSES}`;

    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        select
          tribe_subscription_prices.id,
          tribe_subscription_prices.name,
          tribe_subscription_prices.amount_cents,
          tribe_subscription_prices.currency,
          tribe_subscription_prices.frequency,
          tribe_subscription_prices.status,
          tribe_subscription_prices.is_current,
          tribe_subscription_prices.payment_integration_id,
          tribe_payment_integrations.account_label as mercado_pago_account_label,
          tribe_payment_integrations.provider_account_email as mercado_pago_account_email,
          tribe_payment_integrations.provider_account_id,
          tribe_subscription_prices.created_at,
          tribe_subscription_prices.mercado_pago_preapproval_plan_id,
          target_tribe.id as tribe_id,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
          ) as active_subscribers_count
        from public.tribe_subscription_prices
        inner join target_tribe
          on target_tribe.id = tribe_subscription_prices.tribe_id
        left join public.tribe_member_subscriptions
          on tribe_member_subscriptions.price_id = tribe_subscription_prices.id
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.id = tribe_subscription_prices.payment_integration_id
          and tribe_payment_integrations.tribe_id = target_tribe.id
          and tribe_payment_integrations.provider = 'mercado_pago'
        where ${statusFilter}
          and (${input.priceId ?? ""} = '' or tribe_subscription_prices.id::text = ${input.priceId ?? ""})
          and public.can_manage_tribe_subscription_prices(target_tribe.id)
        group by
          tribe_subscription_prices.id,
          target_tribe.id,
          tribe_payment_integrations.account_label,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.provider_account_email,
          tribe_payment_integrations.provider_account_id,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        order by tribe_subscription_prices.created_at desc
      `);

      return (result.rows ?? []) as SubscriptionProviderPlanRow[];
    });
  }

  /**
   * Lists local provider subscriber identifiers attached to a price.
   *
   * @param input - Tribe and price identifiers used to scope subscribers.
   * @returns Provider subscriber identifiers persisted for the price.
   */
  private async listProviderSubscribers(input: {
    priceId: string;
    tribeSlug: string;
  }): Promise<SubscriptionProviderSubscriberRow[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        select tribe_member_subscriptions.mercado_pago_preapproval_id
        from public.tribe_member_subscriptions
        inner join public.tribe_subscription_prices
          on tribe_subscription_prices.id = tribe_member_subscriptions.price_id
        inner join target_tribe
          on target_tribe.id = tribe_subscription_prices.tribe_id
        where tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status in ${MANAGEABLE_PROVIDER_PLAN_PRICE_STATUSES}
          and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
          and public.can_manage_tribe_subscription_prices(target_tribe.id)
      `);

      return (result.rows ?? []) as SubscriptionProviderSubscriberRow[];
    });
  }

  /**
   * Lists local provider subscriber identifiers for all visible tribe prices.
   *
   * @param input - Tribe slug used to scope subscribers.
   * @returns Provider subscriber identifiers persisted for active or canceled prices.
   */
  private async listProviderSubscribersByTribe(input: {
    tribeSlug: string;
  }): Promise<SubscriptionProviderSubscriberRow[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        select
          tribe_payment_integrations.access_token,
          tribe_member_subscriptions.mercado_pago_preapproval_id,
          tribe_payment_integrations.id as payment_integration_id,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at,
          tribe_payment_integrations.tribe_id
        from public.tribe_member_subscriptions
        left join public.tribe_subscription_prices
          on tribe_subscription_prices.id = tribe_member_subscriptions.price_id
        inner join target_tribe
          on target_tribe.id = tribe_member_subscriptions.tribe_id
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.id = coalesce(
            tribe_member_subscriptions.payment_integration_id,
            tribe_subscription_prices.payment_integration_id
          )
          and tribe_payment_integrations.tribe_id = target_tribe.id
          and tribe_payment_integrations.provider = 'mercado_pago'
          where (
            tribe_subscription_prices.status in ${MANAGEABLE_PROVIDER_PLAN_PRICE_STATUSES}
            or tribe_member_subscriptions.price_id is null
          )
          and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
          and public.can_manage_tribe_subscription_prices(target_tribe.id)
        order by tribe_member_subscriptions.created_at asc
      `);

      return (result.rows ?? []) as SubscriptionProviderSubscriberRow[];
    });
  }

  /**
   * Persists provider-backed subscriber statuses for all tribe diagnostics rows.
   *
   * @param input - Tribe slug and verified subscriber status updates.
   * @returns Promise resolved after local subscriber state is updated.
   */
  private async reconcileTribeProviderSubscriberStatuses(input: {
    providerSubscriberStatusUpdates: SubscriptionProviderSubscriberStatusUpdate[];
    tribeSlug: string;
  }): Promise<void> {
    if (input.providerSubscriberStatusUpdates.length === 0) {
      return;
    }

    const statusUpdatesJson = JSON.stringify(
      input.providerSubscriberStatusUpdates
    );

    await this.executeWithDatabase(async (database) => {
      await lockSubscriptionMembershipTribes(database,{tribeSlug:input.tribeSlug});
      await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        ),
        provider_statuses as (
          select
            provider_statuses.provider_subscription_id,
            provider_statuses.subscription_status,
            provider_statuses.status_reason
          from jsonb_to_recordset(${statusUpdatesJson}::jsonb) as provider_statuses(
            provider_subscription_id text,
            subscription_status text,
            status_reason text
          )
        ),
        updated_subscriptions as (
          update public.tribe_member_subscriptions
          set
            status = provider_statuses.subscription_status,
            status_reason = provider_statuses.status_reason,
            updated_at = timezone('utc', now())
          from provider_statuses,
            target_tribe
          where tribe_member_subscriptions.tribe_id = target_tribe.id
            and tribe_member_subscriptions.mercado_pago_preapproval_id =
              provider_statuses.provider_subscription_id
            and public.can_manage_tribe_subscription_prices(target_tribe.id)
          returning tribe_member_subscriptions.id,tribe_member_subscriptions.tribe_id,tribe_member_subscriptions.user_id,
            tribe_member_subscriptions.price_id,tribe_member_subscriptions.status,tribe_member_subscriptions.product_key
        ),
        ${buildReconciledSubscriptionsSql()},
        affected_members as (
          select distinct
            updated_subscriptions.tribe_id,
            updated_subscriptions.user_id
          from updated_subscriptions
          where updated_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
        )
        ${buildSubscriptionMembershipUpdateSql()}
      `);
    });
  }

  /**
   * Cancels a local price after provider plan verification proves it is gone.
   *
   * @param input - Tribe slug and price identifier.
   * @returns Updated price, or null when no row was updated.
   */
  private async cancelProviderPlanPrice(input: {
    priceId: string;
    tribeSlug: string;
  }): Promise<TribeSubscriptionPriceResult | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.tribe_id,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.product_key
          from public.tribe_subscription_prices
          where tribe_subscription_prices.tribe_id = (select id from target_tribe)
            and tribe_subscription_prices.id = ${input.priceId}
            and tribe_subscription_prices.status in ${LIVE_PROVIDER_PLAN_PRICE_STATUSES}
          limit 1
        ),
        updated_price as (
        update public.tribe_subscription_prices
        set
          status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled},
          is_current = false
        where tribe_subscription_prices.id = (select id from target_price)
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
        returning id, name, amount_cents, currency, frequency, status, is_current, trial_frequency, trial_frequency_type, created_at
        ),
        updated_tribe as (
          update public.tribes
          set free_join_is_current = true
          where tribes.id = (select id from target_tribe)
            and exists (select 1 from updated_price)
            and exists (
              select 1
              from target_price
              where target_price.is_current = true
                and target_price.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            )
            and not exists (
              select 1
              from public.tribe_subscription_prices
              where tribe_subscription_prices.tribe_id = (select id from target_tribe)
                and tribe_subscription_prices.id <> (select id from target_price)
                and tribe_subscription_prices.is_current = true
                and tribe_subscription_prices.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
                and tribe_subscription_prices.status = 'active'
                and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
            )
          returning id
        )
        select
          updated_price.id,
          updated_price.name,
          updated_price.amount_cents,
          updated_price.currency,
          updated_price.frequency,
          updated_price.status,
          updated_price.is_current,
          updated_price.trial_frequency,
          updated_price.trial_frequency_type,
          updated_price.created_at,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
          ) as active_subscribers_count
        from updated_price
        left join public.tribe_member_subscriptions
          on tribe_member_subscriptions.price_id = updated_price.id
        group by
          updated_price.id,
          updated_price.name,
          updated_price.amount_cents,
          updated_price.currency,
          updated_price.frequency,
          updated_price.status,
          updated_price.is_current,
          updated_price.trial_frequency,
          updated_price.trial_frequency_type,
          updated_price.created_at
      `);

      const row = (result.rows?.[0] ?? null) as SubscriptionPriceRow | null;

      return row ? mapSubscriptionPrice(row) : null;
    });
  }

  /**
   * Cancels a provider plan and marks the local price as canceled.
   *
   * @param command - Price identity command.
   * @returns Price cancellation result.
   */
  async delete(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionPriceMutationResult> {
    const updateContext = await this.resolvePriceUpdateContext(command);

    if (!updateContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!updateContext.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    if (updateContext.status !== TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    const linkedInvitationIds = await this.listLinkedActiveInvitationIds(
      command.priceId
    );

    if (linkedInvitationIds.length > 0) {
      return {
        linkedInvitationIds,
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.hasLinkedInvitations,
      };
    }

    const hasProviderPlanLink = Boolean(
      updateContext.mercado_pago_preapproval_plan_id
    );

    if (!hasProviderPlanLink) {
      const wasDeleted = await this.deleteCanceledProviderPlanPrice(command);

      return wasDeleted
        ? { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted }
        : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    const accessToken = await this.resolveAccessTokenForProviderMutation(
      updateContext
    );

    if (!accessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    if (updateContext.mercado_pago_preapproval_plan_id) {
      const traceContext = buildSubscriptionPricePaymentTraceContext({
        operationKey: buildSubscriptionPriceOperationKey({
          operation:
            SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.deleteProviderPlanPrice,
          priceId: command.priceId,
          tribeSlug: command.tribeSlug,
        }),
        priceId: command.priceId,
        providerPlanId: updateContext.mercado_pago_preapproval_plan_id,
        requestId: this.requestId,
        tribeSlug: command.tribeSlug,
      });
      const providerPlanStatus = await this.getMercadoPagoPlanStatus({
        accessToken,
        preapprovalPlanId: updateContext.mercado_pago_preapproval_plan_id,
        ...(traceContext ? { traceContext } : {}),
      });

      if (isLiveProviderPlanStatus(providerPlanStatus)) {
        return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
      }
    }

    const wasDeleted = await this.deleteCanceledProviderPlanPrice(command);

    return wasDeleted
      ? { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted }
      : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
  }

  /**
   * Temporarily removes a price from checkout selection before provider cancellation.
   *
   * @param command - Price identity command.
   * @returns Cancellation reservation context, or null when no row is available.
   */
  private async reserveProviderPlanPriceCancellation(
    command: TribeSubscriptionPriceIdentity
  ): Promise<PriceCancellationReservationRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.tribe_id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.status,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.created_at,
            tribe_subscription_prices.mercado_pago_preapproval_plan_id
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status in ${LIVE_PROVIDER_PLAN_PRICE_STATUSES}
          limit 1
          for update
        ),
        associated_members as (
          select tribe_member_subscriptions.id
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.price_id = (select id from target_price)
          limit 1
        ),
        reserved_price as (
          update public.tribe_subscription_prices
          set is_current = false
          where tribe_subscription_prices.id = (select id from target_price)
            and not exists (select 1 from associated_members)
            and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
          returning
            id,
            tribe_id,
            name,
            amount_cents,
            currency,
            frequency,
            status,
            is_current,
            created_at,
            mercado_pago_preapproval_plan_id
        )
        select
          coalesce(reserved_price.id, target_price.id) as id,
          coalesce(reserved_price.tribe_id, target_price.tribe_id) as tribe_id,
          coalesce(reserved_price.name, target_price.name) as name,
          coalesce(reserved_price.amount_cents, target_price.amount_cents) as amount_cents,
          coalesce(reserved_price.currency, target_price.currency) as currency,
          coalesce(reserved_price.frequency, target_price.frequency) as frequency,
          coalesce(reserved_price.status, target_price.status) as status,
          coalesce(reserved_price.is_current, target_price.is_current) as is_current,
          target_price.is_current as was_current,
          coalesce(reserved_price.created_at, target_price.created_at) as created_at,
          coalesce(
            reserved_price.mercado_pago_preapproval_plan_id,
            target_price.mercado_pago_preapproval_plan_id
          ) as mercado_pago_preapproval_plan_id,
          case when exists (select 1 from associated_members) then 1 else 0 end as active_subscribers_count,
          coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        left join target_price
          on true
        left join reserved_price
          on true
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as
        | PriceCancellationReservationRow
        | null;
    });
  }

  /**
   * Restores current price selection after a provider cancellation failure.
   *
   * @param input - Price identity and previous current state.
   * @returns Promise resolved after the local reservation is restored.
   */
  private async restoreProviderPlanPriceCancellationReservation(input: {
    priceId: string;
    tribeSlug: string;
    wasCurrent: boolean;
  }): Promise<void> {
    if (!input.wasCurrent) {
      return;
    }

    await this.executeWithDatabase(async (database) => {
      await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        update public.tribe_subscription_prices
        set is_current = true
        where tribe_subscription_prices.tribe_id = (select id from target_tribe)
          and tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status = 'active'
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
          and not exists (
            select 1
            from public.tribe_subscription_prices existing_current_price
            where existing_current_price.tribe_id = tribe_subscription_prices.tribe_id
              and existing_current_price.product_key = tribe_subscription_prices.product_key
              and existing_current_price.status = 'active'
              and existing_current_price.is_current = true
          )
      `);
    });
  }

  private async listLinkedActiveInvitationIds(priceId: string): Promise<string[]> {
    return this.executeWithDatabase(async (database) => {
      return this.listLinkedActiveInvitationIdsWithDatabase(database, priceId);
    }).catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        ((error as { code?: string }).code ===
          POSTGRES_ERROR_CODE.undefinedColumn ||
          (error as { code?: string }).code ===
            POSTGRES_ERROR_CODE.undefinedTable)
      ) {
        return [];
      }

      throw error;
    });
  }

  /**
   * Reactivates a local price after Mercado Pago reports the provider plan active again.
   *
   * @param input - Local price identifier.
   * @returns Updated price, or null when no row was changed.
   */
  private async reactivatePausedProviderPlanPrice(input: {
    priceId: string;
  }): Promise<TribeSubscriptionPriceResult | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        update public.tribe_subscription_prices
        set status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.active}
        where tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status = 'paused'
        returning id, name, amount_cents, currency, frequency, status, is_current, trial_frequency, trial_frequency_type, created_at, 0 as active_subscribers_count
      `);
      const row = (result.rows?.[0] ?? null) as SubscriptionPriceRow | null;

      return row ? mapSubscriptionPrice(row) : null;
    });
  }

  /**
   * Pauses a local price after Mercado Pago pauses the linked provider plan.
   *
   * @param input - Local price identifier.
   * @returns Updated price, or null when no row was changed.
   */
  private async pauseProviderPlanPriceFromWebhook(input: {
    priceId: string;
  }): Promise<TribeSubscriptionPriceResult | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.tribe_id,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.product_key
          from public.tribe_subscription_prices
          where tribe_subscription_prices.id = ${input.priceId}
            and tribe_subscription_prices.status in ${LIVE_PROVIDER_PLAN_PRICE_STATUSES}
          limit 1
        ),
        updated_price as (
          update public.tribe_subscription_prices
          set
            status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.paused},
            is_current = false
          where tribe_subscription_prices.id = (select id from target_price)
          returning id, name, amount_cents, currency, frequency, status, is_current, trial_frequency, trial_frequency_type, created_at, 0 as active_subscribers_count
        ),
        updated_tribe as (
          update public.tribes
          set free_join_is_current = true
          where tribes.id = (select tribe_id from target_price)
            and exists (select 1 from updated_price)
            and exists (
              select 1
              from target_price
              where target_price.is_current = true
                and target_price.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            )
            and not exists (
              select 1
              from public.tribe_subscription_prices
              where tribe_subscription_prices.tribe_id = (select tribe_id from target_price)
                and tribe_subscription_prices.id <> (select id from target_price)
                and tribe_subscription_prices.is_current = true
                and tribe_subscription_prices.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
                and tribe_subscription_prices.status = 'active'
                and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
            )
          returning id
        )
        select
          updated_price.id,
          updated_price.name,
          updated_price.amount_cents,
          updated_price.currency,
          updated_price.frequency,
          updated_price.status,
          updated_price.is_current,
          updated_price.trial_frequency,
          updated_price.trial_frequency_type,
          updated_price.created_at,
          updated_price.active_subscribers_count
        from updated_price
      `);
      const row = (result.rows?.[0] ?? null) as SubscriptionPriceRow | null;

      return row ? mapSubscriptionPrice(row) : null;
    });
  }

  private async listLinkedActiveInvitationIdsWithDatabase(
    database: RequestDatabase,
    priceId: string
  ): Promise<string[]> {
    const result = await database.execute(sql`
      select tribe_invitations.id
      from public.tribe_invitations
      where tribe_invitations.subscription_price_id = ${priceId}
        and tribe_invitations.status = 'active'
      order by tribe_invitations.created_at asc
    `);

    return ((result.rows ?? []) as { id: string }[]).map((row) => row.id);
  }

  async deleteWithInvitationActions(
    command: DeleteTribeSubscriptionPriceWithInvitationActionsCommand
  ): Promise<TribeSubscriptionPriceMutationResult> {
    const updateContext = await this.resolvePriceUpdateContext({
      priceId: command.priceId,
      tribeSlug: command.tribeSlug,
    });

    if (!updateContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!updateContext.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    if (updateContext.status !== TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    const validatedActions = await this.validateInvitationActions(
      command.priceId,
      updateContext.tribe_id,
      command.invitationActions
    );

    if (!validatedActions.valid) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput };
    }

    const providerPrecheckStatus = await this.runDeleteProviderPrecheck(
      command,
      updateContext
    );

    if (providerPrecheckStatus) {
      return providerPrecheckStatus;
    }

    return this.executeWithDatabase(async (database) => {
      const transactionValidatedActions =
        await this.validateInvitationActionsWithDatabase(
          database,
          command.priceId,
          updateContext.tribe_id,
          command.invitationActions
        );

      if (!transactionValidatedActions.valid) {
        return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput };
      }

      for (const action of command.invitationActions) {
        if (action.action === SUBSCRIPTION_PRICE_INVITATION_ACTION.revoke) {
          await database.execute(sql`
            update public.tribe_invitations
            set status = 'revoked',
                revoked_at = timezone('utc', now())
            where tribe_invitations.id = ${action.invitationId}
              and tribe_invitations.subscription_price_id = ${command.priceId}
              and tribe_invitations.status = 'active'
              and public.can_manage_tribe_invitations(tribe_invitations.tribe_id)
          `);
          continue;
        }

        if (action.action === SUBSCRIPTION_PRICE_INVITATION_ACTION.switchToCurrent) {
          await database.execute(sql`
            update public.tribe_invitations
            set subscription_association_type = 'current',
                subscription_price_id = null
            where tribe_invitations.id = ${action.invitationId}
              and tribe_invitations.subscription_price_id = ${command.priceId}
              and tribe_invitations.status = 'active'
              and public.can_manage_tribe_invitations(tribe_invitations.tribe_id)
          `);
          continue;
        }

        await database.execute(sql`
          update public.tribe_invitations
          set subscription_association_type = 'specific',
              subscription_price_id = ${action.targetPriceId}
          where tribe_invitations.id = ${action.invitationId}
            and tribe_invitations.subscription_price_id = ${command.priceId}
            and tribe_invitations.status = 'active'
            and public.can_manage_tribe_invitations(tribe_invitations.tribe_id)
        `);
      }

      const stillLinkedResult = await database.execute(sql`
        select count(*)::int as remaining
        from public.tribe_invitations
        where tribe_invitations.subscription_price_id = ${command.priceId}
          and tribe_invitations.status = 'active'
      `);
      const remaining = Number(
        (stillLinkedResult.rows?.[0] as { remaining?: number | string } | undefined)
          ?.remaining ?? 0
      );

      if (remaining > 0) {
        throw new Error(
          "Linked invitations remain after applying provided actions"
        );
      }

      const wasDeleted = await this.deleteCanceledProviderPlanPriceWithDatabase(
        database,
        command
      );

      if (!wasDeleted) {
        throw new Error("Failed to soft-delete subscription price");
      }

      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted };
    });
  }

  private async validateInvitationActions(
    priceId: string,
    tribeId: string,
    actions: DeleteTribeSubscriptionPriceInvitationAction[]
  ): Promise<{ valid: boolean }> {
    return this.executeWithDatabase((database) =>
      this.validateInvitationActionsWithDatabase(
        database,
        priceId,
        tribeId,
        actions
      )
    );
  }

  private async validateInvitationActionsWithDatabase(
    database: RequestDatabase,
    priceId: string,
    tribeId: string,
    actions: DeleteTribeSubscriptionPriceInvitationAction[]
  ): Promise<{ valid: boolean }> {
    const linkedInvitationIds = await this.listLinkedActiveInvitationIdsWithDatabase(
      database,
      priceId
    );
    const linkedSet = new Set(linkedInvitationIds);
    const actionInvitationIds = new Set<string>();

    for (const action of actions) {
      if (!linkedSet.has(action.invitationId)) {
        return { valid: false };
      }

      if (actionInvitationIds.has(action.invitationId)) {
        return { valid: false };
      }

      actionInvitationIds.add(action.invitationId);

      if (action.action === SUBSCRIPTION_PRICE_INVITATION_ACTION.switchToSpecific) {
        if (
          !action.targetPriceId ||
          action.targetPriceId === priceId
        ) {
          return { valid: false };
        }

        const targetIsValid = await this.isCandidateReassignmentPriceWithDatabase(
          database,
          tribeId,
          action.targetPriceId
        );

        if (!targetIsValid) {
          return { valid: false };
        }
      }
    }

    if (actionInvitationIds.size !== linkedSet.size) {
      return { valid: false };
    }

    return { valid: true };
  }

  private async isCandidateReassignmentPrice(
    tribeId: string,
    candidatePriceId: string
  ): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      return this.isCandidateReassignmentPriceWithDatabase(
        database,
        tribeId,
        candidatePriceId
      );
    });
  }

  private async isCandidateReassignmentPriceWithDatabase(
    database: RequestDatabase,
    tribeId: string,
    candidatePriceId: string
  ): Promise<boolean> {
    const result = await database.execute(sql`
      select 1
      from public.tribe_subscription_prices
      where tribe_subscription_prices.id = ${candidatePriceId}
        and tribe_subscription_prices.tribe_id = ${tribeId}
        and tribe_subscription_prices.status = 'active'
        and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
      limit 1
    `);

    return (result.rows ?? []).length > 0;
  }

  private async runDeleteProviderPrecheck(
    command: TribeSubscriptionPriceIdentity,
    updateContext: PriceUpdateContextRow
  ): Promise<TribeSubscriptionPriceMutationResult | null> {
    const hasProviderPlanLink = Boolean(
      updateContext.mercado_pago_preapproval_plan_id
    );

    if (!hasProviderPlanLink) {
      return null;
    }

    const accessToken = await this.resolveAccessTokenForProviderMutation(
      updateContext
    );

    if (!accessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    if (updateContext.mercado_pago_preapproval_plan_id) {
      const traceContext = buildSubscriptionPricePaymentTraceContext({
        operationKey: buildSubscriptionPriceOperationKey({
          operation:
            SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.deleteProviderPlanPrice,
          priceId: command.priceId,
          tribeSlug: command.tribeSlug,
        }),
        priceId: command.priceId,
        providerPlanId: updateContext.mercado_pago_preapproval_plan_id,
        requestId: this.requestId,
        tribeSlug: command.tribeSlug,
      });
      const providerPlanStatus = await this.getMercadoPagoPlanStatus({
        accessToken,
        preapprovalPlanId: updateContext.mercado_pago_preapproval_plan_id,
        ...(traceContext ? { traceContext } : {}),
      });

      if (isLiveProviderPlanStatus(providerPlanStatus)) {
        return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
      }
    }

    return null;
  }

  private async deleteCanceledProviderPlanPrice(
    command: TribeSubscriptionPriceIdentity
  ): Promise<boolean> {
    return this.executeWithDatabase((database) =>
      this.deleteCanceledProviderPlanPriceWithDatabase(database, command)
    );
  }

  /**
   * Soft-deletes a canceled price and snapshots attached subscriptions in one database unit.
   *
   * @param database - Request-scoped database client.
   * @param command - Price identity command.
   * @returns Whether the price was soft-deleted.
   */
  private async deleteCanceledProviderPlanPriceWithDatabase(
    database: RequestDatabase,
    command: TribeSubscriptionPriceIdentity
  ): Promise<boolean> {
    const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.mercado_pago_preapproval_plan_id
          from public.tribe_subscription_prices
          where tribe_subscription_prices.tribe_id = (select id from target_tribe)
            and tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled}
            and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
          limit 1
        ),
        target_subscriptions as (
          select tribe_member_subscriptions.id
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.price_id = (select id from target_price)
        ),
        detached_subscriptions as (
          select public.detach_tribe_member_subscriptions_from_deleted_price(
            (select id from target_price)
          ) as updated_count
        ),
        deleted_price as (
          update public.tribe_subscription_prices
          set
            status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted},
            is_current = false,
            deleted_at = timezone('utc', now())
          where tribe_subscription_prices.id = (select id from target_price)
            and (select count(*) from target_subscriptions) = (
              select updated_count from detached_subscriptions
            )
          returning id
        )
        select
          exists (select 1 from deleted_price) as was_deleted,
          (select updated_count from detached_subscriptions) as detached_subscriptions_count
      `);

    return Boolean(
      (
        result.rows?.[0] as
          | {
              was_deleted?: boolean;
            }
          | undefined
      )?.was_deleted
    );
  }
}
