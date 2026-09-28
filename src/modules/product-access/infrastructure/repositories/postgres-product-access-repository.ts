/**
 * Postgres adapter of the academy product access.
 *
 * The runtime role bypasses RLS, so every statement repeats the authorization
 * rules in SQL (active leader for configuration and bonuses, active leader or
 * guardian for the member list, own rows for the member snapshot). Mutations
 * lock the actor membership `FOR SHARE` in their own statement first: a
 * concurrent demotion, block or removal waits for the mutation to commit, and
 * one committed while waiting is seen by the following statements, so a
 * revoked permission is never used after its transactional check (AC-35).
 *
 * @module postgres-product-access-repository
 */

import { sql } from "drizzle-orm";

import {
  ACCESS_GRANT_SOURCE_TYPE,
  PRODUCT_KEY,
  TRIBE_ACCESS_MODEL,
  type AccessGrantSourceType,
  type TribeAccessModel,
} from "@/src/modules/product-access/constants/product-access";
import type {
  ActivateAcademyCommand,
  ActivateAcademyResult,
  AcademyGrantView,
  AcademyMemberAccessRow,
  AcademyPublicOffer,
  AcademySettings,
  AcademySettingsMutationResult,
  GrantAcademyBonusCommand,
  GrantAcademyBonusResult,
  ListAcademyMembersQuery,
  ListAcademyMembersResult,
  OwnAcademyAccessSnapshot,
  ProductAccessRepository,
  RevokeAcademyBonusCommand,
  RevokeAcademyBonusResult,
  SaveAcademyOfferCommand,
  SetAcademyAvailabilityCommand,
  TribeSlugQuery,
} from "@/src/modules/product-access/domain/repositories/product-access-repository";
import {
  insertAcademyGrantWithEnrollment,
  recordAcademyAuditEvent,
} from "@/src/modules/product-access/infrastructure/repositories/academy-access-sql";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

export const ACADEMY_AUDIT_ACTION = {
  availabilityChanged: "academy_availability_changed",
  bonusGranted: "academy_bonus_granted",
  bonusRevoked: "academy_bonus_revoked",
  offerSaved: "academy_offer_saved",
} as const;

export const ACADEMY_AUDIT_ENTITY = {
  grant: "member_access_grant",
  settings: "tribe_academy_settings",
} as const;

const BONUS_SOURCE_KEY_PREFIX = "bonus:";
const UNVERIFIED_EXCEPTION_STATE = "granted_unverified_exception";
const GRANTED_STATE = "granted";
const REVOKED_STATE = "revoked";
const ACADEMY_RENEWAL_LIVE_STATUS = {
  active: "active",
  paused: "paused",
  pending: "pending",
} as const;

type GrantJsonRow = {
  ends_at: string | null;
  id: string;
  revoked_at: string | null;
  source_type: AccessGrantSourceType;
  starts_at: string;
};

type SettingsRow = {
  access_model: TribeAccessModel;
  admission_enabled: boolean;
  benefits: unknown;
  config_version: number;
  description: string;
  offer_version: number;
  sales_enabled: boolean;
  title: string;
};

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function toOptionalDate(value: string | Date | null): Date | null {
  return value === null ? null : toDate(value);
}

function mapGrant(row: GrantJsonRow): AcademyGrantView {
  return {
    endsAt: toOptionalDate(row.ends_at),
    id: row.id,
    revokedAt: toOptionalDate(row.revoked_at),
    sourceType: row.source_type,
    startsAt: toDate(row.starts_at),
  };
}

function readBenefits(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((benefit): benefit is string => typeof benefit === "string")
    : [];
}

function mapSettings(row: SettingsRow): AcademySettings {
  return {
    accessModel: row.access_model,
    admissionEnabled: row.admission_enabled,
    benefits: readBenefits(row.benefits),
    configVersion: Number(row.config_version),
    description: row.description,
    offerVersion: Number(row.offer_version),
    salesEnabled: row.sales_enabled,
    title: row.title,
  };
}

/**
 * Locks the current user's membership for the rest of the transaction and
 * tells whether it is an active leader of the tribe.
 */
async function lockActiveLeader(
  database: RequestDatabase,
  tribeSlug: string
): Promise<{ tribeId: string | null; actorUserId: string | null; isLeader: boolean }> {
  const tribeResult = await database.execute(sql`
    select tribes.id as tribe_id
    from public.tribes
    where tribes.slug = ${tribeSlug}
    limit 1
  `);
  const tribeId =
    (tribeResult.rows?.[0] as { tribe_id: string } | undefined)?.tribe_id ?? null;

  if (!tribeId) {
    return { actorUserId: null, isLeader: false, tribeId: null };
  }

  const membershipResult = await database.execute(sql`
    select
      tribe_members.user_id as actor_user_id,
      (tribe_members.role = 'leader' and tribe_members.status = 'active') as is_leader
    from public.tribe_members
    where tribe_members.tribe_id = ${tribeId}
      and tribe_members.user_id = public.current_app_user_id()
    for share of tribe_members
  `);
  const membership = (membershipResult.rows?.[0] ?? null) as {
    actor_user_id: string;
    is_leader: boolean | null;
  } | null;

  return {
    actorUserId: membership?.actor_user_id ?? null,
    isLeader: membership?.is_leader === true,
    tribeId,
  };
}

export class PostgresProductAccessRepository implements ProductAccessRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async activateAcademy(command: ActivateAcademyCommand): Promise<ActivateAcademyResult> {
    return this.executeWithDatabase(async (database) => {
      // The definer function checks the active leader, locks the tribe and the
      // memberships, preserves every current member and writes the audit, all
      // in this transaction.
      const result = await database.execute(sql`
        select public.academy_activate_by_leader(
          ${command.tribeSlug},
          ${command.expectedConfigVersion}
        ) as status
      `);
      const status = (result.rows?.[0] as { status: string } | undefined)?.status;

      if (status === "forbidden" || status === "not_found") {
        return { status };
      }

      const tribeResult = await database.execute(sql`
        select tribes.id from public.tribes where tribes.slug = ${command.tribeSlug} limit 1
      `);
      const tribeId = (tribeResult.rows?.[0] as { id: string }).id;
      const settings = await this.readSettingsInTransaction(database, tribeId);

      if (status === "activated" || status === "already_academy") {
        return { settings, status };
      }

      return { settings, status: "conflict" };
    });
  }

  async readOwnAccessSnapshot({
    tribeSlug,
  }: TribeSlugQuery): Promise<OwnAcademyAccessSnapshot | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        ),
        viewer_membership as (
          select tribe_members.role, tribe_members.status
          from public.tribe_members
          inner join target_tribe
            on target_tribe.id = tribe_members.tribe_id
          where tribe_members.user_id = public.current_app_user_id()
          limit 1
        ),
        settings as (
          select tribe_academy_settings.*
          from public.tribe_academy_settings
          inner join target_tribe
            on target_tribe.id = tribe_academy_settings.tribe_id
        )
        select
          (select id from target_tribe) as tribe_id,
          coalesce((select access_model from settings), ${TRIBE_ACCESS_MODEL.legacy}) as access_model,
          coalesce((select admission_enabled from settings), false) as admission_enabled,
          coalesce((select sales_enabled from settings), false) as sales_enabled,
          (select role from viewer_membership) as membership_role,
          (select status from viewer_membership) as membership_status,
          (
            select member_product_enrollments.first_activated_at
            from public.member_product_enrollments
            where member_product_enrollments.tribe_id = (select id from target_tribe)
              and member_product_enrollments.user_id = public.current_app_user_id()
              and member_product_enrollments.product_key = ${PRODUCT_KEY.academy}
          ) as first_activated_at,
          (
            coalesce((select sales_enabled from settings), false)
            and exists (
              select 1
              from public.tribe_subscription_prices
              where tribe_subscription_prices.tribe_id = (select id from target_tribe)
                and tribe_subscription_prices.product_key = ${PRODUCT_KEY.academy}
                and tribe_subscription_prices.status = 'active'
                and tribe_subscription_prices.is_current = true
                and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
            )
          ) as offer_purchasable,
          (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'ends_at', member_access_grants.ends_at,
                  'id', member_access_grants.id,
                  'revoked_at', member_access_grants.revoked_at,
                  'source_type', member_access_grants.source_type,
                  'starts_at', member_access_grants.starts_at
                )
              ),
              '[]'::jsonb
            )
            from public.member_access_grants
            where member_access_grants.tribe_id = (select id from target_tribe)
              and member_access_grants.user_id = public.current_app_user_id()
              and member_access_grants.product_key = ${PRODUCT_KEY.academy}
          ) as grants
      `);
      const row = (result.rows?.[0] ?? null) as {
        access_model: TribeAccessModel;
        admission_enabled: boolean;
        first_activated_at: string | Date | null;
        grants: GrantJsonRow[] | null;
        membership_role: string | null;
        membership_status: string | null;
        offer_purchasable: boolean | null;
        sales_enabled: boolean;
        tribe_id: string | null;
      } | null;

      // A private legacy tribe never reveals itself to a non-member.
      if (
        !row?.tribe_id ||
        (!row.membership_status && row.access_model !== TRIBE_ACCESS_MODEL.academy)
      ) {
        return null;
      }

      return {
        accessModel: row.access_model,
        admissionEnabled: row.admission_enabled,
        firstActivatedAt: toOptionalDate(row.first_activated_at),
        grants: (row.grants ?? []).map((grant) => {
          const view = mapGrant(grant);

          return {
            endsAt: view.endsAt,
            revokedAt: view.revokedAt,
            sourceType: view.sourceType,
            startsAt: view.startsAt,
          };
        }),
        membership:
          row.membership_role && row.membership_status
            ? { role: row.membership_role, status: row.membership_status }
            : null,
        offerPurchasable: row.offer_purchasable === true,
        salesEnabled: row.sales_enabled,
      };
    });
  }

  async getPublicOffer({ tribeSlug }: TribeSlugQuery): Promise<AcademyPublicOffer | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select *
        from public.tribe_academy_public_offer(${tribeSlug})
      `);
      const row = (result.rows?.[0] ?? null) as {
        admission_enabled: boolean;
        benefits: unknown;
        description: string;
        offer_version: number;
        price_amount_cents: number | null;
        price_currency: string | null;
        price_frequency: string | null;
        sales_enabled: boolean;
        title: string;
        tribe_name: string;
      } | null;

      if (!row) {
        return null;
      }

      return {
        admissionEnabled: row.admission_enabled,
        benefits: readBenefits(row.benefits),
        description: row.description,
        offerVersion: Number(row.offer_version),
        price:
          row.price_amount_cents !== null && row.price_currency && row.price_frequency
            ? {
                amountCents: Number(row.price_amount_cents),
                currency: row.price_currency,
                frequency: row.price_frequency,
              }
            : null,
        salesEnabled: row.sales_enabled,
        title: row.title,
        tribeName: row.tribe_name,
      };
    });
  }

  async getAcademySettings({ tribeSlug }: TribeSlugQuery): Promise<AcademySettings | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          coalesce(tribe_academy_settings.access_model, ${TRIBE_ACCESS_MODEL.legacy}) as access_model,
          coalesce(tribe_academy_settings.admission_enabled, false) as admission_enabled,
          coalesce(tribe_academy_settings.sales_enabled, false) as sales_enabled,
          coalesce(tribe_academy_settings.title, '') as title,
          coalesce(tribe_academy_settings.description, '') as description,
          coalesce(tribe_academy_settings.benefits, '[]'::jsonb) as benefits,
          coalesce(tribe_academy_settings.offer_version, 1) as offer_version,
          coalesce(tribe_academy_settings.config_version, 0) as config_version
        from public.tribes
        left join public.tribe_academy_settings
          on tribe_academy_settings.tribe_id = tribes.id
        where tribes.slug = ${tribeSlug}
          and public.can_manage_tribe_settings(tribes.id)
        limit 1
      `);
      const row = (result.rows?.[0] ?? null) as SettingsRow | null;

      return row ? mapSettings(row) : null;
    });
  }

  async saveOffer(command: SaveAcademyOfferCommand): Promise<AcademySettingsMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const actor = await lockActiveLeader(database, command.tribeSlug);

      if (!actor.tribeId) {
        return { status: "not_found" };
      }

      if (!actor.isLeader) {
        return { status: "forbidden" };
      }

      // config_version 0 means "no row yet": the first save creates it.
      const result = await database.execute(sql`
        with upserted as (
          insert into public.tribe_academy_settings (
            tribe_id, title, description, benefits, updated_by
          )
          select
            ${actor.tribeId},
            ${command.title},
            ${command.description},
            ${JSON.stringify(command.benefits)}::jsonb,
            ${actor.actorUserId}
          where ${command.expectedConfigVersion} = 0
          on conflict (tribe_id) do nothing
          returning *
        ),
        updated as (
          update public.tribe_academy_settings
          set
            title = ${command.title},
            description = ${command.description},
            benefits = ${JSON.stringify(command.benefits)}::jsonb,
            offer_version = tribe_academy_settings.offer_version + 1,
            config_version = tribe_academy_settings.config_version + 1,
            updated_by = ${actor.actorUserId},
            updated_at = timezone('utc', now())
          where tribe_academy_settings.tribe_id = ${actor.tribeId}
            and tribe_academy_settings.config_version = ${command.expectedConfigVersion}
          returning *
        )
        select * from upserted
        union all
        select * from updated
      `);
      const row = (result.rows?.[0] ?? null) as SettingsRow | null;

      if (!row) {
        const current = await this.readSettingsInTransaction(database, actor.tribeId);

        return { settings: current, status: "conflict" };
      }

      await recordAcademyAuditEvent(database, {
        action: ACADEMY_AUDIT_ACTION.offerSaved,
        actorUserId: actor.actorUserId,
        correlationId: command.correlationId,
        entityId: actor.tribeId,
        entityType: ACADEMY_AUDIT_ENTITY.settings,
        fromState: null,
        reason: null,
        subjectUserId: null,
        toState: String(row.offer_version),
        tribeId: actor.tribeId,
      });

      return { settings: mapSettings(row), status: "updated" };
    });
  }

  async setAvailability(
    command: SetAcademyAvailabilityCommand
  ): Promise<AcademySettingsMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const actor = await lockActiveLeader(database, command.tribeSlug);

      if (!actor.tribeId) {
        return { status: "not_found" };
      }

      if (!actor.isLeader) {
        return { status: "forbidden" };
      }

      const current = await this.readSettingsInTransaction(database, actor.tribeId);

      if (current.accessModel !== TRIBE_ACCESS_MODEL.academy) {
        return { status: "not_academy" };
      }

      const result = await database.execute(sql`
        update public.tribe_academy_settings
        set
          admission_enabled = ${command.admissionEnabled},
          sales_enabled = ${command.salesEnabled},
          config_version = tribe_academy_settings.config_version + 1,
          updated_by = ${actor.actorUserId},
          updated_at = timezone('utc', now())
        where tribe_academy_settings.tribe_id = ${actor.tribeId}
          and tribe_academy_settings.config_version = ${command.expectedConfigVersion}
          and tribe_academy_settings.access_model = ${TRIBE_ACCESS_MODEL.academy}
        returning *
      `);
      const row = (result.rows?.[0] ?? null) as SettingsRow | null;

      if (!row) {
        return {
          settings: await this.readSettingsInTransaction(database, actor.tribeId),
          status: "conflict",
        };
      }

      await recordAcademyAuditEvent(database, {
        action: ACADEMY_AUDIT_ACTION.availabilityChanged,
        actorUserId: actor.actorUserId,
        correlationId: command.correlationId,
        entityId: actor.tribeId,
        entityType: ACADEMY_AUDIT_ENTITY.settings,
        fromState: `admission=${current.admissionEnabled};sales=${current.salesEnabled}`,
        reason: null,
        subjectUserId: null,
        toState: `admission=${row.admission_enabled};sales=${row.sales_enabled}`,
        tribeId: actor.tribeId,
      });

      return { settings: mapSettings(row), status: "updated" };
    });
  }

  async grantBonus(command: GrantAcademyBonusCommand): Promise<GrantAcademyBonusResult> {
    return this.executeWithDatabase(async (database) => {
      const actor = await lockActiveLeader(database, command.tribeSlug);

      if (!actor.tribeId) {
        return { status: "not_found" };
      }

      if (!actor.isLeader || !actor.actorUserId) {
        return { status: "forbidden" };
      }

      const settings = await this.readSettingsInTransaction(database, actor.tribeId);

      if (settings.accessModel !== TRIBE_ACCESS_MODEL.academy) {
        return { status: "not_academy" };
      }

      // Lock the recipient membership too: a concurrent block or removal waits
      // for this grant or is seen by it (moderation always prevails).
      const recipientResult = await database.execute(sql`
        select
          tribe_members.status,
          public.is_member_verified_for_academy(${actor.tribeId}, tribe_members.user_id) as is_verified
        from public.tribe_members
        where tribe_members.tribe_id = ${actor.tribeId}
          and tribe_members.user_id = ${command.recipientUserId}
        limit 1
        for share of tribe_members
      `);
      const recipient = (recipientResult.rows?.[0] ?? null) as {
        is_verified: boolean | null;
        status: string;
      } | null;

      if (!recipient) {
        // Unknown ids and members of other tribes look the same.
        return { status: "not_found" };
      }

      if (recipient.status !== "active" && recipient.status !== "muted") {
        return { status: "recipient_not_eligible" };
      }

      if (recipient.is_verified !== true && !command.allowUnverifiedRecipient) {
        return { status: "recipient_not_verified" };
      }

      const sourceKey = `${BONUS_SOURCE_KEY_PREFIX}${command.idempotencyKey}`;
      const replayResult = await database.execute(sql`
        select id, user_id, starts_at, ends_at, revoked_at, source_type
        from public.member_access_grants
        where tribe_id = ${actor.tribeId}
          and product_key = ${PRODUCT_KEY.academy}
          and source_type = ${ACCESS_GRANT_SOURCE_TYPE.manualBonus}
          and source_key = ${sourceKey}
        limit 1
      `);
      const replay = (replayResult.rows?.[0] ?? null) as (GrantJsonRow & {
        user_id: string;
      }) | null;

      if (replay) {
        return replay.user_id === command.recipientUserId
          ? {
              grant: mapGrant(replay),
              hasActiveRenewal: await this.hasLiveAcademyRenewal(
                database,
                actor.tribeId,
                command.recipientUserId
              ),
              status: "replayed",
            }
          : { status: "idempotency_conflict" };
      }

      if (command.replacesGrantId) {
        const replaced = await database.execute(sql`
          update public.member_access_grants
          set revoked_at = now(), revoked_by = ${actor.actorUserId}
          where id = ${command.replacesGrantId}
            and tribe_id = ${actor.tribeId}
            and user_id = ${command.recipientUserId}
            and source_type = ${ACCESS_GRANT_SOURCE_TYPE.manualBonus}
            and revoked_at is null
          returning id
        `);

        if ((replaced.rows ?? []).length === 0) {
          return { status: "replaced_grant_not_found" };
        }

        await recordAcademyAuditEvent(database, {
          action: ACADEMY_AUDIT_ACTION.bonusRevoked,
          actorUserId: actor.actorUserId,
          correlationId: command.correlationId,
          entityId: command.replacesGrantId,
          entityType: ACADEMY_AUDIT_ENTITY.grant,
          fromState: GRANTED_STATE,
          reason: command.reason,
          subjectUserId: command.recipientUserId,
          toState: REVOKED_STATE,
          tribeId: actor.tribeId,
        });
      }

      const inserted = await insertAcademyGrantWithEnrollment(database, {
        createdBy: actor.actorUserId,
        endsAt: command.endsAt,
        sourceKey,
        sourceType: ACCESS_GRANT_SOURCE_TYPE.manualBonus,
        startsAt: null,
        tribeId: actor.tribeId,
        userId: command.recipientUserId,
      });

      await recordAcademyAuditEvent(database, {
        action: ACADEMY_AUDIT_ACTION.bonusGranted,
        actorUserId: actor.actorUserId,
        correlationId: command.correlationId,
        entityId: inserted.grantId,
        entityType: ACADEMY_AUDIT_ENTITY.grant,
        fromState: null,
        reason: command.reason,
        subjectUserId: command.recipientUserId,
        toState:
          recipient.is_verified === true ? GRANTED_STATE : UNVERIFIED_EXCEPTION_STATE,
        tribeId: actor.tribeId,
      });

      const grantResult = await database.execute(sql`
        select id, starts_at, ends_at, revoked_at, source_type
        from public.member_access_grants
        where id = ${inserted.grantId}
      `);

      return {
        grant: mapGrant(grantResult.rows?.[0] as GrantJsonRow),
        hasActiveRenewal: await this.hasLiveAcademyRenewal(
          database,
          actor.tribeId,
          command.recipientUserId
        ),
        status: inserted.inserted ? "created" : "replayed",
      };
    });
  }

  async revokeBonus(command: RevokeAcademyBonusCommand): Promise<RevokeAcademyBonusResult> {
    return this.executeWithDatabase(async (database) => {
      const actor = await lockActiveLeader(database, command.tribeSlug);

      if (!actor.tribeId) {
        return { status: "not_found" };
      }

      if (!actor.isLeader) {
        return { status: "forbidden" };
      }

      // Only leader bonuses are revoked here: paid periods follow the ledger.
      const result = await database.execute(sql`
        with target_grant as (
          select id, user_id, revoked_at
          from public.member_access_grants
          where id = ${command.grantId}
            and tribe_id = ${actor.tribeId}
            and source_type = ${ACCESS_GRANT_SOURCE_TYPE.manualBonus}
          for update
        ),
        revoked as (
          update public.member_access_grants
          set revoked_at = now(), revoked_by = ${actor.actorUserId}
          from target_grant
          where member_access_grants.id = target_grant.id
            and target_grant.revoked_at is null
          returning member_access_grants.id
        )
        select
          (select user_id from target_grant) as user_id,
          exists (select 1 from target_grant) as found,
          exists (select 1 from revoked) as revoked
      `);
      const row = (result.rows?.[0] ?? null) as {
        found: boolean;
        revoked: boolean;
        user_id: string | null;
      } | null;

      if (!row?.found) {
        return { status: "not_found" };
      }

      if (!row.revoked) {
        return { status: "already_revoked" };
      }

      await recordAcademyAuditEvent(database, {
        action: ACADEMY_AUDIT_ACTION.bonusRevoked,
        actorUserId: actor.actorUserId,
        correlationId: command.correlationId,
        entityId: command.grantId,
        entityType: ACADEMY_AUDIT_ENTITY.grant,
        fromState: GRANTED_STATE,
        reason: command.reason,
        subjectUserId: row.user_id,
        toState: REVOKED_STATE,
        tribeId: actor.tribeId,
      });

      return { status: "revoked" };
    });
  }

  async listMembers(query: ListAcademyMembersQuery): Promise<ListAcademyMembersResult> {
    return this.executeWithDatabase(async (database) => {
      const viewerResult = await database.execute(sql`
        select
          tribes.id as tribe_id,
          case
            when public.can_manage_tribe_settings(tribes.id) then 'leader'
            when public.can_review_member_verifications(tribes.id) then 'guardian'
            else null
          end as viewer_role
        from public.tribes
        where tribes.slug = ${query.tribeSlug}
        limit 1
      `);
      const viewer = (viewerResult.rows?.[0] ?? null) as {
        tribe_id: string;
        viewer_role: "guardian" | "leader" | null;
      } | null;

      if (!viewer) {
        return { status: "not_found" };
      }

      if (!viewer.viewer_role) {
        return { status: "forbidden" };
      }

      const isLeader = viewer.viewer_role === "leader";
      const searchPattern = query.search
        ? `%${query.search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
        : null;
      const offset = (query.page - 1) * query.pageSize;
      const result = await database.execute(sql`
        with members as (
          select
            tribe_members.user_id,
            tribe_members.role,
            tribe_members.status,
            coalesce("user".name, '') as display_name
          from public.tribe_members
          inner join public."user"
            on "user".id = tribe_members.user_id
          where tribe_members.tribe_id = ${viewer.tribe_id}
            and tribe_members.status in ('active', 'muted', 'blocked')
            and (${searchPattern}::text is null or "user".name ilike ${searchPattern})
        )
        select
          members.*,
          count(*) over () as total_count,
          public.is_member_verified_for_academy(${viewer.tribe_id}, members.user_id) as is_verified,
          public.has_active_product_grant(${viewer.tribe_id}, members.user_id, ${PRODUCT_KEY.academy}) as has_academy_access,
          (
            select tribe_member_subscriptions.status
            from public.tribe_member_subscriptions
            where tribe_member_subscriptions.tribe_id = ${viewer.tribe_id}
              and tribe_member_subscriptions.user_id = members.user_id
              and tribe_member_subscriptions.product_key = ${PRODUCT_KEY.academy}
              and tribe_member_subscriptions.status in (
                ${ACADEMY_RENEWAL_LIVE_STATUS.active},
                ${ACADEMY_RENEWAL_LIVE_STATUS.pending},
                ${ACADEMY_RENEWAL_LIVE_STATUS.paused}
              )
            order by tribe_member_subscriptions.created_at desc
            limit 1
          ) as renewal_status,
          case when ${isLeader} then (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'ends_at', member_access_grants.ends_at,
                  'id', member_access_grants.id,
                  'note', (
                    select academy_audit_events.reason
                    from public.academy_audit_events
                    where academy_audit_events.tribe_id = member_access_grants.tribe_id
                      and academy_audit_events.entity_type = ${ACADEMY_AUDIT_ENTITY.grant}
                      and academy_audit_events.entity_id = member_access_grants.id::text
                      and academy_audit_events.action = ${ACADEMY_AUDIT_ACTION.bonusGranted}
                    order by academy_audit_events.created_at desc
                    limit 1
                  ),
                  'revoked_at', member_access_grants.revoked_at,
                  'source_type', member_access_grants.source_type,
                  'starts_at', member_access_grants.starts_at
                )
                order by member_access_grants.starts_at desc
              ),
              '[]'::jsonb
            )
            from public.member_access_grants
            where member_access_grants.tribe_id = ${viewer.tribe_id}
              and member_access_grants.user_id = members.user_id
              and member_access_grants.product_key = ${PRODUCT_KEY.academy}
          ) else '[]'::jsonb end as grants
        from members
        order by
          case members.role when 'leader' then 1 when 'guardian' then 2 else 3 end,
          members.display_name asc,
          members.user_id asc
        limit ${query.pageSize}
        offset ${offset}
      `);
      const rows = (result.rows ?? []) as Array<{
        display_name: string;
        grants: Array<GrantJsonRow & { note: string | null }> | null;
        has_academy_access: boolean | null;
        is_verified: boolean | null;
        renewal_status: string | null;
        role: string;
        status: string;
        total_count: number | string;
        user_id: string;
      }>;
      const members: AcademyMemberAccessRow[] = rows.map((row) => ({
        displayName: row.display_name,
        grants: (row.grants ?? []).map((grant) => ({
          ...mapGrant(grant),
          note: isLeader && grant.source_type === ACCESS_GRANT_SOURCE_TYPE.manualBonus
            ? grant.note
            : null,
        })),
        hasAcademyAccess: row.has_academy_access === true,
        isVerified: row.is_verified === true,
        membershipStatus: row.status,
        renewalStatus: row.renewal_status,
        role: row.role,
        userId: row.user_id,
      }));

      return {
        page: {
          members,
          total: Number(rows[0]?.total_count ?? 0),
          viewerRole: viewer.viewer_role,
        },
        status: "ok",
      };
    });
  }

  private async readSettingsInTransaction(
    database: RequestDatabase,
    tribeId: string
  ): Promise<AcademySettings> {
    const result = await database.execute(sql`
      select
        coalesce(tribe_academy_settings.access_model, ${TRIBE_ACCESS_MODEL.legacy}) as access_model,
        coalesce(tribe_academy_settings.admission_enabled, false) as admission_enabled,
        coalesce(tribe_academy_settings.sales_enabled, false) as sales_enabled,
        coalesce(tribe_academy_settings.title, '') as title,
        coalesce(tribe_academy_settings.description, '') as description,
        coalesce(tribe_academy_settings.benefits, '[]'::jsonb) as benefits,
        coalesce(tribe_academy_settings.offer_version, 1) as offer_version,
        coalesce(tribe_academy_settings.config_version, 0) as config_version
      from (select ${tribeId}::uuid as tribe_id) as target
      left join public.tribe_academy_settings
        on tribe_academy_settings.tribe_id = target.tribe_id
    `);

    return mapSettings(result.rows?.[0] as SettingsRow);
  }

  private async hasLiveAcademyRenewal(
    database: RequestDatabase,
    tribeId: string,
    userId: string
  ): Promise<boolean> {
    const result = await database.execute(sql`
      select exists (
        select 1
        from public.tribe_member_subscriptions
        where tribe_member_subscriptions.tribe_id = ${tribeId}
          and tribe_member_subscriptions.user_id = ${userId}
          and tribe_member_subscriptions.product_key = ${PRODUCT_KEY.academy}
          and tribe_member_subscriptions.status = ${ACADEMY_RENEWAL_LIVE_STATUS.active}
          and tribe_member_subscriptions.cancel_requested_at is null
      ) as has_active_renewal
    `);

    return (result.rows?.[0] as { has_active_renewal: boolean } | undefined)
      ?.has_active_renewal === true;
  }
}
