import { createHash } from "crypto";
import { sql } from "drizzle-orm";

import {
  TRIBE_INVITATION_STATUS,
  TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE,
  TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS,
} from "@/src/modules/tribes/constants/tribe-invitations";
import {
  decryptInvitationToken,
  encryptInvitationToken,
} from "@/src/modules/tribes/infrastructure/encryption/tribe-invitation-token-cipher";
import type {
  AcceptTribeInvitationCommand,
  CreateTribeInvitationCommand,
  ListTribeInvitationsByPriceQuery,
  ListTribeInvitationsQuery,
  RevokeTribeInvitationCommand,
  TribeInvitationRepository,
  UpdateTribeInvitationReferralMetadataCommand,
  UpdateTribeInvitationSubscriptionAssociationCommand,
} from "@/src/modules/tribes/domain/repositories/tribe-invitation-repository";
import type {
  TribeInvitationAcceptanceResult,
  TribeInvitationAssociatedPlanResult,
  TribeInvitationCreationResult,
  TribeInvitationConversionMetricResult,
  TribeInvitationListItemResult,
  TribeInvitationReferralMetadataUpdateResult,
  TribeInvitationRevocationResult,
  TribeInvitationSubscriptionAssociationResult,
  TribeInvitationSubscriptionAssociationUpdateResult,
  TribeInvitationSubscriptionOfferResult,
  TribeInvitationsByPriceResult,
} from "@/src/modules/tribes/application/results/tribe-invitation-result";
import type { TribeInvitationSubscriptionAssociation } from "@/src/modules/tribes/domain/value-objects/tribe-invitation-subscription-association";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const TRIBE_INVITATION_REPOSITORY_LOG = {
  decryptFailureMessage:
    "Failed to decrypt stored tribe invitation token; falling back to null invitationUrl",
  feature: "tribes",
  operation: "list-tribe-invitations",
} as const;

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type AssociatedPlanRow = {
  associated_plan_amount_cents: number | null;
  associated_plan_currency: string | null;
  associated_plan_frequency: string | null;
  associated_plan_id: string | null;
  associated_plan_mercado_pago_account_email: string | null;
  associated_plan_mercado_pago_account_label: string | null;
  associated_plan_name: string | null;
  associated_plan_status: "active" | "canceled" | "deleted" | null;
  associated_plan_trial_frequency: number | null;
  associated_plan_trial_frequency_type: string | null;
};

type InvitationRow = AssociatedPlanRow & {
  campaign_name: string | null;
  channel: string | null;
  created_at: Date | string;
  created_by_name: string | null;
  id: string;
  referrer_handle: string | null;
  subscription_association_type: string;
  subscription_price_id: string | null;
};

type InvitationListRow = InvitationRow & {
  token_encrypted: string | null;
};

type InvitationCreationRow = InvitationRow & {
  status: string | null;
};

type InvitationStatusRow = {
  status: string | null;
};

type InvitationSubscriptionOfferRow = {
  amount_cents: number;
  currency: string;
  frequency: string;
  name: string;
};

type InvitationConversionMetricRow = {
  campaign_name: string | null;
  channel: string | null;
  clicks: null;
  invitation_id: string;
  mercado_pago_account_email: string | null;
  mercado_pago_account_label: string | null;
  paid_active: number | string | null;
  payment_integration_id: string | null;
  referrer_handle: string | null;
  revenue_cents: number | string | null;
  signups: number | string | null;
};

const INVITATION_ROUTE = {
  inviteSegment: "/invitar/",
} as const;

const INVITATION_DATABASE_CONTEXT_SETTING = {
  currentInvitationHash: "app.current_invitation_hash",
} as const;

const POSTGRES_ERROR_CODE = {
  undefinedColumn: "42703",
  undefinedFunction: "42883",
  undefinedTable: "42P01",
} as const;

const POSTGRES_INTEGRITY_ERROR_CODE = {
  checkViolation: "23514",
  foreignKeyViolation: "23503",
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isValidInvitationId(invitationId: string): boolean {
  return UUID_PATTERN.test(invitationId);
}

function createInvitationUrl(baseUrl: string, tribeSlug: string, token: string): string {
  return new URL(
    `/${tribeSlug}${INVITATION_ROUTE.inviteSegment}${token}`,
    baseUrl
  ).toString();
}

function resolveInvitationUrlFromRow(
  row: InvitationListRow,
  baseUrl: string,
  tribeSlug: string
): string | null {
  if (!row.token_encrypted) {
    return null;
  }

  try {
    const token = decryptInvitationToken(row.token_encrypted);

    return createInvitationUrl(baseUrl, tribeSlug, token);
  } catch (error) {
    createServerLogger({
      feature: TRIBE_INVITATION_REPOSITORY_LOG.feature,
      operation: TRIBE_INVITATION_REPOSITORY_LOG.operation,
      requestId: "",
    }).error({
      message: TRIBE_INVITATION_REPOSITORY_LOG.decryptFailureMessage,
      error,
      metadata: {
        invitationId: row.id,
        tribeSlug,
      },
    });

    return null;
  }
}

const TRIAL_FREQUENCY_TYPE = {
  days: "days",
  months: "months",
} as const;

function mapAssociatedPlanTrial(
  row: AssociatedPlanRow
): TribeInvitationAssociatedPlanResult["trial"] {
  if (
    row.associated_plan_trial_frequency === null ||
    row.associated_plan_trial_frequency_type === null
  ) {
    return null;
  }

  if (
    row.associated_plan_trial_frequency_type !== TRIAL_FREQUENCY_TYPE.days &&
    row.associated_plan_trial_frequency_type !== TRIAL_FREQUENCY_TYPE.months
  ) {
    return null;
  }

  return {
    frequency: row.associated_plan_trial_frequency,
    frequencyType: row.associated_plan_trial_frequency_type,
  };
}

function mapAssociatedPlan(
  row: AssociatedPlanRow
): TribeInvitationAssociatedPlanResult | null {
  if (
    row.associated_plan_id === null ||
    row.associated_plan_amount_cents === null ||
    row.associated_plan_currency === null ||
    row.associated_plan_frequency === null ||
    row.associated_plan_name === null ||
    row.associated_plan_status === null
  ) {
    return null;
  }

  return {
    amountCents: row.associated_plan_amount_cents,
    currency: row.associated_plan_currency,
    frequency: row.associated_plan_frequency,
    id: row.associated_plan_id,
    mercadoPagoAccountEmail: row.associated_plan_mercado_pago_account_email,
    mercadoPagoAccountLabel: row.associated_plan_mercado_pago_account_label,
    name: row.associated_plan_name,
    status: row.associated_plan_status,
    trial: mapAssociatedPlanTrial(row),
  };
}

function mapSubscriptionAssociation(
  row: InvitationRow
): TribeInvitationSubscriptionAssociationResult {
  if (
    row.subscription_association_type ===
      TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific &&
    row.subscription_price_id
  ) {
    return {
      plan: mapAssociatedPlan(row),
      priceId: row.subscription_price_id,
      type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific,
    };
  }

  if (
    row.subscription_association_type ===
    TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.free
  ) {
    return { type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.free };
  }

  return { type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current };
}

function mapInvitation(
  row: InvitationRow,
  invitationUrl: string | null = null
): TribeInvitationListItemResult {
  return {
    campaignName: row.campaign_name,
    channel: row.channel,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    createdByName: row.created_by_name,
    id: row.id,
    invitationUrl,
    referrerHandle: row.referrer_handle,
    subscriptionAssociation: mapSubscriptionAssociation(row),
  };
}

function mapConversionMetric(
  row: InvitationConversionMetricRow
): TribeInvitationConversionMetricResult {
  return {
    campaignName: row.campaign_name,
    channel: row.channel,
    clicks: null,
    invitationId: row.invitation_id,
    mercadoPagoAccountEmail: row.mercado_pago_account_email,
    mercadoPagoAccountLabel: row.mercado_pago_account_label,
    paidActive: Number(row.paid_active ?? 0),
    paymentIntegrationId: row.payment_integration_id,
    referrerHandle: row.referrer_handle,
    revenueCents: Number(row.revenue_cents ?? 0),
    signups: Number(row.signups ?? 0),
  };
}

function mapCreationResult(
  row: InvitationCreationRow | null,
  invitationUrl: string
): TribeInvitationCreationResult {
  if (row?.status === TRIBE_INVITATION_STATUS.created) {
    return {
      invitation: mapInvitation(row, invitationUrl),
      invitationUrl,
      status: row.status,
    };
  }

  if (row?.status === TRIBE_INVITATION_STATUS.notFound) {
    return { status: TRIBE_INVITATION_STATUS.notFound };
  }

  if (row?.status === TRIBE_INVITATION_STATUS.invalid) {
    return { status: TRIBE_INVITATION_STATUS.invalid };
  }

  return { status: TRIBE_INVITATION_STATUS.forbidden };
}

function mapRevocationResult(row: InvitationStatusRow | null): TribeInvitationRevocationResult {
  if (
    row?.status === TRIBE_INVITATION_STATUS.revoked ||
    row?.status === TRIBE_INVITATION_STATUS.notFound
  ) {
    return { status: row.status };
  }

  return { status: TRIBE_INVITATION_STATUS.forbidden };
}

function mapAcceptanceResult(row: InvitationStatusRow | null): TribeInvitationAcceptanceResult {
  if (
    row?.status === TRIBE_INVITATION_STATUS.accepted ||
    row?.status === TRIBE_INVITATION_STATUS.blocked ||
    row?.status === TRIBE_INVITATION_STATUS.invalid ||
    row?.status === TRIBE_INVITATION_STATUS.revoked ||
    row?.status === TRIBE_INVITATION_STATUS.subscriptionRequired
  ) {
    return { status: row.status };
  }

  return { status: TRIBE_INVITATION_STATUS.invalid };
}

function mapSubscriptionOfferResult(
  row: InvitationSubscriptionOfferRow | null
): TribeInvitationSubscriptionOfferResult {
  return row
    ? {
        price: {
          amountCents: row.amount_cents,
          currency: row.currency,
          frequency: row.frequency,
          name: row.name,
        },
        status: TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS.available,
      }
    : {
        status: TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS.unavailable,
      };
}

function isMissingInvitationStorageError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgresError = error as { cause?: unknown; code?: string };
  const directCode = postgresError.code;
  const causeCode =
    postgresError.cause &&
    typeof postgresError.cause === "object" &&
    "code" in postgresError.cause
      ? (postgresError.cause as { code?: string }).code
      : undefined;

  return (
    directCode === POSTGRES_ERROR_CODE.undefinedColumn ||
    directCode === POSTGRES_ERROR_CODE.undefinedTable ||
    directCode === POSTGRES_ERROR_CODE.undefinedFunction ||
    causeCode === POSTGRES_ERROR_CODE.undefinedColumn ||
    causeCode === POSTGRES_ERROR_CODE.undefinedTable ||
    causeCode === POSTGRES_ERROR_CODE.undefinedFunction
  );
}

function isIntegrityViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgresError = error as { cause?: unknown; code?: string };
  const directCode = postgresError.code;
  const causeCode =
    postgresError.cause &&
    typeof postgresError.cause === "object" &&
    "code" in postgresError.cause
      ? (postgresError.cause as { code?: string }).code
      : undefined;

  return (
    directCode === POSTGRES_INTEGRITY_ERROR_CODE.checkViolation ||
    directCode === POSTGRES_INTEGRITY_ERROR_CODE.foreignKeyViolation ||
    causeCode === POSTGRES_INTEGRITY_ERROR_CODE.checkViolation ||
    causeCode === POSTGRES_INTEGRITY_ERROR_CODE.foreignKeyViolation
  );
}

function resolveAssociationColumns(
  subscriptionAssociation: TribeInvitationSubscriptionAssociation
): { subscriptionAssociationType: string; subscriptionPriceId: string | null } {
  if (
    subscriptionAssociation.type ===
    TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific
  ) {
    return {
      subscriptionAssociationType:
        TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific,
      subscriptionPriceId: subscriptionAssociation.priceId,
    };
  }

  return {
    subscriptionAssociationType: subscriptionAssociation.type,
    subscriptionPriceId: null,
  };
}

function resolveReferralMetadataColumns(
  command:
    | CreateTribeInvitationCommand
    | UpdateTribeInvitationReferralMetadataCommand
): {
  campaignName: string | null;
  channel: string | null;
  referrerHandle: string | null;
} {
  return {
    campaignName: command.referralMetadata?.campaignName ?? null,
    channel: command.referralMetadata?.channel ?? null,
    referrerHandle: command.referralMetadata?.referrerHandle ?? null,
  };
}

export class PostgresTribeInvitationRepository implements TribeInvitationRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async listByTribeSlug({
    baseUrl,
    tribeSlug,
  }: ListTribeInvitationsQuery): Promise<TribeInvitationListItemResult[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        )
        select
          tribe_invitations.id,
          tribe_invitations.channel,
          tribe_invitations.campaign_name,
          tribe_invitations.referrer_handle,
          tribe_invitations.created_at,
          tribe_invitations.token_encrypted,
          tribe_invitations.subscription_association_type,
          tribe_invitations.subscription_price_id,
          invitation_creators.name as created_by_name,
          associated_price.id as associated_plan_id,
          associated_price.name as associated_plan_name,
          associated_price.amount_cents as associated_plan_amount_cents,
          associated_price.currency as associated_plan_currency,
          associated_price.frequency as associated_plan_frequency,
          associated_price.status as associated_plan_status,
          associated_price.trial_frequency as associated_plan_trial_frequency,
          associated_price.trial_frequency_type as associated_plan_trial_frequency_type,
          associated_plan_integration.account_label as associated_plan_mercado_pago_account_label,
          associated_plan_integration.provider_account_email as associated_plan_mercado_pago_account_email
        from public.tribe_invitations
        inner join target_tribe
          on target_tribe.id = tribe_invitations.tribe_id
        left join public."user" invitation_creators
          on invitation_creators.id = tribe_invitations.created_by
        left join public.tribe_subscription_prices associated_price
          on associated_price.id = tribe_invitations.subscription_price_id
        left join public.tribe_payment_integrations associated_plan_integration
          on associated_plan_integration.id = associated_price.payment_integration_id
        where tribe_invitations.status = ${TRIBE_INVITATION_STATUS.active}
          and public.can_manage_tribe_invitations(target_tribe.id)
        order by tribe_invitations.created_at desc
      `);

      return ((result.rows ?? []) as InvitationListRow[]).map((row) =>
        mapInvitation(row, resolveInvitationUrlFromRow(row, baseUrl, tribeSlug))
      );
    }).catch((error: unknown) => {
      if (isMissingInvitationStorageError(error)) {
        return [];
      }

      throw error;
    });
  }

  async listByPriceId({
    baseUrl,
    priceId,
    tribeSlug,
  }: ListTribeInvitationsByPriceQuery): Promise<TribeInvitationsByPriceResult> {
    if (!isValidInvitationId(priceId)) {
      return { invitations: [] };
    }

    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        )
        select
          tribe_invitations.id,
          tribe_invitations.channel,
          tribe_invitations.campaign_name,
          tribe_invitations.referrer_handle,
          tribe_invitations.created_at,
          tribe_invitations.token_encrypted,
          tribe_invitations.subscription_association_type,
          tribe_invitations.subscription_price_id,
          invitation_creators.name as created_by_name,
          associated_price.id as associated_plan_id,
          associated_price.name as associated_plan_name,
          associated_price.amount_cents as associated_plan_amount_cents,
          associated_price.currency as associated_plan_currency,
          associated_price.frequency as associated_plan_frequency,
          associated_price.status as associated_plan_status,
          associated_price.trial_frequency as associated_plan_trial_frequency,
          associated_price.trial_frequency_type as associated_plan_trial_frequency_type,
          associated_plan_integration.account_label as associated_plan_mercado_pago_account_label,
          associated_plan_integration.provider_account_email as associated_plan_mercado_pago_account_email
        from public.tribe_invitations
        inner join target_tribe
          on target_tribe.id = tribe_invitations.tribe_id
        left join public."user" invitation_creators
          on invitation_creators.id = tribe_invitations.created_by
        left join public.tribe_subscription_prices associated_price
          on associated_price.id = tribe_invitations.subscription_price_id
        left join public.tribe_payment_integrations associated_plan_integration
          on associated_plan_integration.id = associated_price.payment_integration_id
        where tribe_invitations.status = ${TRIBE_INVITATION_STATUS.active}
          and tribe_invitations.subscription_price_id = ${priceId}
          and public.can_manage_tribe_invitations(target_tribe.id)
        order by tribe_invitations.created_at desc
      `);

      return {
        invitations: ((result.rows ?? []) as InvitationListRow[]).map((row) =>
          mapInvitation(row, resolveInvitationUrlFromRow(row, baseUrl, tribeSlug))
        ),
      };
    }).catch((error: unknown) => {
      if (isMissingInvitationStorageError(error)) {
        return { invitations: [] };
      }

      throw error;
    });
  }

  async create(
    command: CreateTribeInvitationCommand
  ): Promise<TribeInvitationCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const tokenHash = hashInvitationToken(command.token);
      const tokenEncrypted = encryptInvitationToken(command.token);
      const invitationUrl = createInvitationUrl(
        command.baseUrl,
        command.tribeSlug,
        command.token
      );
      const { subscriptionAssociationType, subscriptionPriceId } =
        resolveAssociationColumns(command.subscriptionAssociation);
      const referralMetadata = resolveReferralMetadataColumns(command);
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_price as (
          select tribe_subscription_prices.id
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.id = ${subscriptionPriceId}
            and tribe_subscription_prices.status = 'active'
            and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
          limit 1
        ),
        inserted_invitation as (
          insert into public.tribe_invitations (
            id,
            tribe_id,
            token_hash,
            token_encrypted,
            channel,
            campaign_name,
            referrer_handle,
            created_by,
            status,
            subscription_association_type,
            subscription_price_id,
            created_at
          )
          select
            ${command.invitationId},
            target_tribe.id,
            ${tokenHash},
            ${tokenEncrypted},
            ${referralMetadata.channel},
            ${referralMetadata.campaignName},
            ${referralMetadata.referrerHandle},
            public.current_app_user_id(),
            ${TRIBE_INVITATION_STATUS.active},
            ${subscriptionAssociationType},
            ${subscriptionPriceId},
            timezone('utc', now())
          from target_tribe
          where public.can_manage_tribe_invitations(target_tribe.id)
            and (
              ${subscriptionAssociationType} = ${TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current}
              or public.can_manage_tribe_subscription_prices(target_tribe.id)
            )
            and (
              ${subscriptionPriceId}::uuid is null
              or exists (select 1 from target_price)
            )
          returning id, channel, campaign_name, referrer_handle, created_at, created_by, subscription_association_type, subscription_price_id
        )
        select
          case
            when exists (select 1 from inserted_invitation) then ${TRIBE_INVITATION_STATUS.created}
            when not exists (select 1 from target_tribe) then ${TRIBE_INVITATION_STATUS.notFound}
            when ${subscriptionPriceId}::uuid is not null
              and not exists (select 1 from target_price) then ${TRIBE_INVITATION_STATUS.invalid}
            else ${TRIBE_INVITATION_STATUS.forbidden}
          end as status,
          inserted_invitation.id,
          inserted_invitation.channel,
          inserted_invitation.campaign_name,
          inserted_invitation.referrer_handle,
          inserted_invitation.created_at,
          inserted_invitation.subscription_association_type,
          inserted_invitation.subscription_price_id,
          invitation_creators.name as created_by_name,
          associated_price.id as associated_plan_id,
          associated_price.name as associated_plan_name,
          associated_price.amount_cents as associated_plan_amount_cents,
          associated_price.currency as associated_plan_currency,
          associated_price.frequency as associated_plan_frequency,
          associated_price.status as associated_plan_status,
          associated_price.trial_frequency as associated_plan_trial_frequency,
          associated_price.trial_frequency_type as associated_plan_trial_frequency_type,
          associated_plan_integration.account_label as associated_plan_mercado_pago_account_label,
          associated_plan_integration.provider_account_email as associated_plan_mercado_pago_account_email
        from (select 1) result
        left join inserted_invitation
          on true
        left join public."user" invitation_creators
          on invitation_creators.id = inserted_invitation.created_by
        left join public.tribe_subscription_prices associated_price
          on associated_price.id = inserted_invitation.subscription_price_id
        left join public.tribe_payment_integrations associated_plan_integration
          on associated_plan_integration.id = associated_price.payment_integration_id
      `);

      return mapCreationResult(
        (result.rows?.[0] ?? null) as InvitationCreationRow | null,
        invitationUrl
      );
    }).catch((error: unknown) => {
      if (isMissingInvitationStorageError(error)) {
        return { status: TRIBE_INVITATION_STATUS.setupRequired };
      }

      if (isIntegrityViolation(error)) {
        return { status: TRIBE_INVITATION_STATUS.invalid };
      }

      throw error;
    });
  }

  async updateSubscriptionAssociation(
    command: UpdateTribeInvitationSubscriptionAssociationCommand
  ): Promise<TribeInvitationSubscriptionAssociationUpdateResult> {
    if (!isValidInvitationId(command.invitationId)) {
      return { status: TRIBE_INVITATION_STATUS.notFound };
    }

    return this.executeWithDatabase(async (database) => {
      const { subscriptionAssociationType, subscriptionPriceId } =
        resolveAssociationColumns(command.subscriptionAssociation);
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_invitation as (
          select tribe_invitations.id, tribe_invitations.tribe_id
          from public.tribe_invitations
          inner join target_tribe
            on target_tribe.id = tribe_invitations.tribe_id
          where tribe_invitations.id = ${command.invitationId}
            and tribe_invitations.status = ${TRIBE_INVITATION_STATUS.active}
          limit 1
        ),
        target_price as (
          select tribe_subscription_prices.id
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.id = ${subscriptionPriceId}
            and tribe_subscription_prices.status = 'active'
            and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
          limit 1
        ),
        updated_invitation as (
          update public.tribe_invitations
          set
            subscription_association_type = ${subscriptionAssociationType},
            subscription_price_id = ${subscriptionPriceId}
          where tribe_invitations.id = (select id from target_invitation)
            and public.can_manage_tribe_invitations(tribe_invitations.tribe_id)
            and (
              ${subscriptionAssociationType} = ${TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current}
              or public.can_manage_tribe_subscription_prices(tribe_invitations.tribe_id)
            )
            and (
              ${subscriptionPriceId}::uuid is null
              or exists (select 1 from target_price)
            )
          returning
            tribe_invitations.id,
            tribe_invitations.channel,
            tribe_invitations.campaign_name,
            tribe_invitations.referrer_handle,
            tribe_invitations.created_at,
            tribe_invitations.created_by,
            tribe_invitations.token_encrypted,
            tribe_invitations.subscription_association_type,
            tribe_invitations.subscription_price_id
        )
        select
          case
            when exists (select 1 from updated_invitation) then ${TRIBE_INVITATION_STATUS.updated}
            when not exists (select 1 from target_tribe) then ${TRIBE_INVITATION_STATUS.notFound}
            when not exists (select 1 from target_invitation) then ${TRIBE_INVITATION_STATUS.notFound}
            when ${subscriptionPriceId}::uuid is not null
              and not exists (select 1 from target_price) then ${TRIBE_INVITATION_STATUS.invalid}
            else ${TRIBE_INVITATION_STATUS.forbidden}
          end as status,
          updated_invitation.id,
          updated_invitation.channel,
          updated_invitation.campaign_name,
          updated_invitation.referrer_handle,
          updated_invitation.created_at,
          updated_invitation.token_encrypted,
          updated_invitation.subscription_association_type,
          updated_invitation.subscription_price_id,
          invitation_creators.name as created_by_name,
          associated_price.id as associated_plan_id,
          associated_price.name as associated_plan_name,
          associated_price.amount_cents as associated_plan_amount_cents,
          associated_price.currency as associated_plan_currency,
          associated_price.frequency as associated_plan_frequency,
          associated_price.status as associated_plan_status,
          associated_price.trial_frequency as associated_plan_trial_frequency,
          associated_price.trial_frequency_type as associated_plan_trial_frequency_type,
          associated_plan_integration.account_label as associated_plan_mercado_pago_account_label,
          associated_plan_integration.provider_account_email as associated_plan_mercado_pago_account_email
        from (select 1) result
        left join updated_invitation
          on true
        left join public."user" invitation_creators
          on invitation_creators.id = updated_invitation.created_by
        left join public.tribe_subscription_prices associated_price
          on associated_price.id = updated_invitation.subscription_price_id
        left join public.tribe_payment_integrations associated_plan_integration
          on associated_plan_integration.id = associated_price.payment_integration_id
      `);

      const row = (result.rows?.[0] ?? null) as
        | (InvitationListRow & { status: string | null })
        | null;

      if (row?.status === TRIBE_INVITATION_STATUS.updated) {
        return {
          invitation: mapInvitation(
            row,
            resolveInvitationUrlFromRow(row, command.baseUrl, command.tribeSlug)
          ),
          status: TRIBE_INVITATION_STATUS.updated,
        };
      }

      if (row?.status === TRIBE_INVITATION_STATUS.notFound) {
        return { status: TRIBE_INVITATION_STATUS.notFound };
      }

      if (row?.status === TRIBE_INVITATION_STATUS.invalid) {
        return { status: TRIBE_INVITATION_STATUS.invalid };
      }

      return { status: TRIBE_INVITATION_STATUS.forbidden };
    }).catch((error: unknown) => {
      if (isIntegrityViolation(error)) {
        return { status: TRIBE_INVITATION_STATUS.invalid };
      }

      throw error;
    });
  }

  async updateReferralMetadata(
    command: UpdateTribeInvitationReferralMetadataCommand
  ): Promise<TribeInvitationReferralMetadataUpdateResult> {
    if (!isValidInvitationId(command.invitationId)) {
      return { status: TRIBE_INVITATION_STATUS.notFound };
    }

    return this.executeWithDatabase(async (database) => {
      const referralMetadata = resolveReferralMetadataColumns(command);
      const result = await database.execute(sql`
        with updated_invitation as (
          select *
          from public.update_tribe_invitation_referral_metadata(
            ${command.invitationId},
            ${command.tribeSlug},
            ${referralMetadata.channel},
            ${referralMetadata.campaignName},
            ${referralMetadata.referrerHandle}
          )
        )
        select
          updated_invitation.status,
          updated_invitation.id,
          updated_invitation.channel,
          updated_invitation.campaign_name,
          updated_invitation.referrer_handle,
          updated_invitation.created_at,
          updated_invitation.token_encrypted,
          updated_invitation.subscription_association_type,
          updated_invitation.subscription_price_id,
          invitation_creators.name as created_by_name,
          associated_price.id as associated_plan_id,
          associated_price.name as associated_plan_name,
          associated_price.amount_cents as associated_plan_amount_cents,
          associated_price.currency as associated_plan_currency,
          associated_price.frequency as associated_plan_frequency,
          associated_price.status as associated_plan_status,
          associated_price.trial_frequency as associated_plan_trial_frequency,
          associated_price.trial_frequency_type as associated_plan_trial_frequency_type,
          associated_plan_integration.account_label as associated_plan_mercado_pago_account_label,
          associated_plan_integration.provider_account_email as associated_plan_mercado_pago_account_email
        from (select 1) result
        left join updated_invitation
          on true
        left join public."user" invitation_creators
          on invitation_creators.id = updated_invitation.created_by
        left join public.tribe_subscription_prices associated_price
          on associated_price.id = updated_invitation.subscription_price_id
        left join public.tribe_payment_integrations associated_plan_integration
          on associated_plan_integration.id = associated_price.payment_integration_id
      `);

      const row = (result.rows?.[0] ?? null) as
        | (InvitationListRow & { status: string | null })
        | null;

      if (row?.status === TRIBE_INVITATION_STATUS.updated) {
        return {
          invitation: mapInvitation(
            row,
            resolveInvitationUrlFromRow(row, command.baseUrl, command.tribeSlug)
          ),
          status: TRIBE_INVITATION_STATUS.updated,
        };
      }

      if (row?.status === TRIBE_INVITATION_STATUS.notFound) {
        return { status: TRIBE_INVITATION_STATUS.notFound };
      }

      return { status: TRIBE_INVITATION_STATUS.forbidden };
    }).catch((error: unknown) => {
      if (isIntegrityViolation(error)) {
        return { status: TRIBE_INVITATION_STATUS.invalid };
      }

      throw error;
    });
  }

  async getConversionMetrics(query: {
    tribeSlug: string;
  }): Promise<TribeInvitationConversionMetricResult[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select *
        from public.get_tribe_invitation_conversion_metrics(${query.tribeSlug})
      `);

      return ((result.rows ?? []) as InvitationConversionMetricRow[]).map(
        mapConversionMetric
      );
    }).catch((error: unknown) => {
      if (isMissingInvitationStorageError(error)) {
        return [];
      }

      throw error;
    });
  }

  async revoke(
    command: RevokeTribeInvitationCommand
  ): Promise<TribeInvitationRevocationResult> {
    if (!isValidInvitationId(command.invitationId)) {
      return { status: TRIBE_INVITATION_STATUS.notFound };
    }

    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_invitation as (
          select tribe_invitations.id
          from public.tribe_invitations
          inner join target_tribe
            on target_tribe.id = tribe_invitations.tribe_id
          where tribe_invitations.id = ${command.invitationId}
            and tribe_invitations.status = ${TRIBE_INVITATION_STATUS.active}
          limit 1
        ),
        revoked_invitation as (
          update public.tribe_invitations
          set
            status = ${TRIBE_INVITATION_STATUS.revoked},
            revoked_at = timezone('utc', now())
          where tribe_invitations.id = (select id from target_invitation)
            and public.can_manage_tribe_invitations(tribe_invitations.tribe_id)
          returning tribe_invitations.id
        )
        select
          case
            when exists (select 1 from revoked_invitation) then ${TRIBE_INVITATION_STATUS.revoked}
            when not exists (select 1 from target_tribe) then ${TRIBE_INVITATION_STATUS.notFound}
            when not public.can_manage_tribe_invitations((select id from target_tribe)) then ${TRIBE_INVITATION_STATUS.forbidden}
            when not exists (select 1 from target_invitation) then ${TRIBE_INVITATION_STATUS.notFound}
            else ${TRIBE_INVITATION_STATUS.forbidden}
          end as status
      `);

      return mapRevocationResult((result.rows?.[0] ?? null) as InvitationStatusRow | null);
    });
  }

  async accept(
    command: AcceptTribeInvitationCommand
  ): Promise<TribeInvitationAcceptanceResult> {
    return this.executeWithDatabase(async (database) => {
      const tokenHash = hashInvitationToken(command.token);
      const result = await database.execute(sql`
        with invitation_acceptance_context as (
          select
            set_config(
              ${INVITATION_DATABASE_CONTEXT_SETTING.currentInvitationHash},
              ${tokenHash},
              true
            )
        ),
        target_invitation as (
          select
            tribe_invitations.id,
            tribe_invitations.status,
            tribe_invitations.tribe_id,
            tribe_invitations.subscription_association_type,
            tribe_invitations.subscription_price_id
          from public.tribe_invitations
          cross join invitation_acceptance_context
          where tribe_invitations.token_hash = ${tokenHash}
          limit 1
        ),
        target_tribe as (
          select
            tribes.id,
            tribes.free_join_is_current
          from public.tribes
          inner join target_invitation
            on target_invitation.tribe_id = tribes.id
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        existing_membership as (
          select
            tribe_members.status,
            tribe_members.status_reason
          from public.tribe_members
          inner join target_tribe
            on target_tribe.id = tribe_members.tribe_id
          where tribe_members.user_id = public.current_app_user_id()
          limit 1
        ),
        invitation_offer_price as (
          select tribe_subscription_prices.id
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          inner join target_invitation
            on true
          where tribe_subscription_prices.status = 'active'
            and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
            and (
              (
                target_invitation.subscription_association_type = ${TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific}
                and tribe_subscription_prices.id = target_invitation.subscription_price_id
              )
              or (
                target_invitation.subscription_association_type = ${TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current}
                and target_tribe.free_join_is_current = false
                and tribe_subscription_prices.is_current = true
              )
            )
          limit 1
        ),
        invitation_grants_free_access as (
          select 1
          from target_invitation, target_tribe
          where (
            target_invitation.subscription_association_type = ${TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.free}
          )
          or (
            target_invitation.subscription_association_type = ${TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current}
            and target_tribe.free_join_is_current = true
          )
        ),
        inserted_membership as (
          insert into public.tribe_members (
            tribe_id,
            user_id,
            role,
            status,
            joined_via_invitation_id,
            joined_via,
            created_at
          )
          select
            target_tribe.id,
            public.current_app_user_id(),
            'tribemate',
            'active',
            target_invitation.id,
            'free_invitation',
            timezone('utc', now())
          from target_tribe
          cross join target_invitation
          cross join invitation_acceptance_context
          where target_invitation.status = ${TRIBE_INVITATION_STATUS.active}
            and public.current_app_user_id() <> ''
            and exists (select 1 from invitation_grants_free_access)
            and not exists (select 1 from existing_membership)
          on conflict (tribe_id, user_id) do nothing
          returning id
        ),
        reactivated_membership as (
          update public.tribe_members
          set
            status = 'active',
            status_reason = 'none',
            joined_via_invitation_id = target_invitation.id,
            joined_via = 'free_invitation'
          from target_tribe,
            target_invitation,
            invitation_acceptance_context
          where tribe_members.tribe_id = target_tribe.id
            and tribe_members.user_id = public.current_app_user_id()
            and target_invitation.status = ${TRIBE_INVITATION_STATUS.active}
            and public.current_app_user_id() <> ''
            and exists (select 1 from invitation_grants_free_access)
            and exists (
              select 1 from existing_membership
              where (
                status = 'blocked'
                and status_reason = 'payment_blocked'
              )
              or (
                status = 'removed'
                and status_reason = 'subscription_inactive'
              )
            )
          returning tribe_members.id
        ),
        post_insert_membership as (
          select tribe_members.status
          from public.tribe_members
          inner join target_tribe
            on target_tribe.id = tribe_members.tribe_id
          where tribe_members.user_id = public.current_app_user_id()
          limit 1
        )
        select
          case
            when exists (
              select 1 from existing_membership
              where status = 'blocked'
                and status_reason <> 'payment_blocked'
            ) then ${TRIBE_INVITATION_STATUS.blocked}
            when exists (
              select 1 from invitation_offer_price
            ) and exists (
              select 1 from target_invitation where status = ${TRIBE_INVITATION_STATUS.active}
            ) and not exists (
              select 1 from existing_membership where status in ('active', 'muted')
            ) then ${TRIBE_INVITATION_STATUS.subscriptionRequired}
            when exists (
              select 1 from existing_membership where status in ('active', 'muted')
            ) then ${TRIBE_INVITATION_STATUS.accepted}
            when exists (select 1 from inserted_membership) then ${TRIBE_INVITATION_STATUS.accepted}
            when exists (select 1 from reactivated_membership) then ${TRIBE_INVITATION_STATUS.accepted}
            when exists (
              select 1 from post_insert_membership where status in ('active', 'muted')
            ) then ${TRIBE_INVITATION_STATUS.accepted}
            when exists (
              select 1 from target_invitation where status = ${TRIBE_INVITATION_STATUS.revoked}
            ) then ${TRIBE_INVITATION_STATUS.revoked}
            when not exists (select 1 from target_invitation) then ${TRIBE_INVITATION_STATUS.invalid}
            else ${TRIBE_INVITATION_STATUS.invalid}
          end as status
      `);

      return mapAcceptanceResult((result.rows?.[0] ?? null) as InvitationStatusRow | null);
    });
  }

  async getSubscriptionOffer(command: {
    token: string;
    tribeSlug: string;
  }): Promise<TribeInvitationSubscriptionOfferResult> {
    return this.executeWithDatabase(async (database) => {
      const tokenHash = hashInvitationToken(command.token);
      const result = await database.execute(sql`
        with invitation_offer_context as (
          select
            set_config(
              ${INVITATION_DATABASE_CONTEXT_SETTING.currentInvitationHash},
              ${tokenHash},
              true
            )
        ),
        target_invitation as (
          select
            tribe_invitations.status,
            tribe_invitations.tribe_id,
            tribe_invitations.subscription_association_type,
            tribe_invitations.subscription_price_id
          from public.tribe_invitations
          cross join invitation_offer_context
          where tribe_invitations.token_hash = ${tokenHash}
          limit 1
        ),
        target_tribe as (
          select
            tribes.id,
            tribes.free_join_is_current
          from public.tribes
          inner join target_invitation
            on target_invitation.tribe_id = tribes.id
          where tribes.slug = ${command.tribeSlug}
          limit 1
        )
        select
          tribe_subscription_prices.amount_cents,
          tribe_subscription_prices.currency,
          tribe_subscription_prices.frequency,
          tribe_subscription_prices.name
        from public.tribe_subscription_prices
        inner join target_tribe
          on target_tribe.id = tribe_subscription_prices.tribe_id
        inner join target_invitation
          on true
        where tribe_subscription_prices.status = 'active'
          and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
          and target_invitation.status = ${TRIBE_INVITATION_STATUS.active}
          and (
            (
              target_invitation.subscription_association_type = ${TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific}
              and tribe_subscription_prices.id = target_invitation.subscription_price_id
            )
            or (
              target_invitation.subscription_association_type = ${TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current}
              and target_tribe.free_join_is_current = false
              and tribe_subscription_prices.is_current = true
            )
          )
        limit 1
      `);

      return mapSubscriptionOfferResult(
        (result.rows?.[0] ?? null) as InvitationSubscriptionOfferRow | null
      );
    });
  }
}
