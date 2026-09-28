/**
 * Postgres adapter of member verifications.
 *
 * The runtime role bypasses RLS, so each statement repeats the rules: the
 * member only touches their own relation, reviewers must be an active leader
 * or guardian, providers are managed by the active leader, and every id is
 * resolved inside the tribe of the slug (an id of another tribe behaves as
 * not found). Decisions use compare-and-swap on `version` and lock the
 * reviewer membership `FOR SHARE` first, so a concurrent demotion or block is
 * never bypassed.
 *
 * @module postgres-member-verification-repository
 */

import { sql } from "drizzle-orm";

import {
  MEMBER_VERIFICATION_STATUS,
  VERIFICATION_PROVIDER_LIMITS,
  type MemberVerificationStatus,
} from "@/src/modules/member-verifications/constants/member-verifications";
import type {
  ListReviewQueueQuery,
  MemberVerificationRepository,
  OwnMemberVerification,
  RequestMemberVerificationCommand,
  RequestMemberVerificationResult,
  ReviewMemberVerificationCommand,
  ReviewMemberVerificationResult,
  ReviewQueueItem,
  ReviewQueuePage,
  SaveVerificationProviderCommand,
  SaveVerificationProviderResult,
  VerificationProvider,
} from "@/src/modules/member-verifications/domain/repositories/member-verification-repository";
import {
  resolveVerificationRequestTransition,
  resolveVerificationReviewTransition,
} from "@/src/modules/member-verifications/domain/services/member-verification-transitions";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

/** Audit writer injected by the composition root (product-access SQL). */
export type VerificationAuditWriter = (
  database: RequestDatabase,
  event: {
    action: string;
    actorUserId: string | null;
    correlationId: string | null;
    entityId: string;
    entityType: string;
    fromState: string | null;
    reason: string | null;
    subjectUserId: string | null;
    toState: string | null;
    tribeId: string;
  }
) => Promise<void>;

export const VERIFICATION_AUDIT_ACTION = {
  decided: "member_verification_decided",
  providerSaved: "verification_provider_saved",
  requested: "member_verification_requested",
} as const;

const VERIFICATION_AUDIT_ENTITY = {
  provider: "verification_provider",
  verification: "member_verification",
} as const;

const POSTGRES_UNIQUE_VIOLATION = "23505";

type VerificationRow = {
  declared_email: string | null;
  decision_reason: string | null;
  id: string;
  member_display_name?: string | null;
  provider_display_name: string;
  provider_id: string;
  reviewed_at?: string | Date | null;
  status: MemberVerificationStatus;
  updated_at: string | Date;
  user_id?: string;
  version: number;
};

type ProviderRow = {
  display_name: string;
  id: string;
  instructions: string;
  is_active: boolean;
  key: string;
  link_url: string | null;
};

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapOwnVerification(row: VerificationRow): OwnMemberVerification {
  const isNegative =
    row.status === MEMBER_VERIFICATION_STATUS.rejected ||
    row.status === MEMBER_VERIFICATION_STATUS.revoked;

  return {
    declaredEmail: row.declared_email,
    decisionReason: isNegative ? row.decision_reason : null,
    id: row.id,
    providerDisplayName: row.provider_display_name,
    providerId: row.provider_id,
    status: row.status,
    updatedAt: toDate(row.updated_at),
    version: Number(row.version),
  };
}

function mapQueueItem(row: VerificationRow): ReviewQueueItem {
  return {
    ...mapOwnVerification(row),
    decisionReason: row.decision_reason,
    memberDisplayName: row.member_display_name ?? "",
    memberUserId: row.user_id ?? "",
    reviewedAt: row.reviewed_at ? toDate(row.reviewed_at) : null,
  };
}

function mapProvider(row: ProviderRow): VerificationProvider {
  return {
    displayName: row.display_name,
    id: row.id,
    instructions: row.instructions,
    isActive: row.is_active,
    key: row.key,
    linkUrl: row.link_url,
  };
}

function readPostgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as { cause?: { code?: string }; code?: string };

  return candidate.code ?? candidate.cause?.code;
}

async function resolveTribeId(
  database: RequestDatabase,
  tribeSlug: string
): Promise<string | null> {
  const result = await database.execute(sql`
    select tribes.id from public.tribes where tribes.slug = ${tribeSlug} limit 1
  `);

  return (result.rows?.[0] as { id: string } | undefined)?.id ?? null;
}

/**
 * Locks the current user's membership row for the transaction.
 */
async function lockOwnMembership(
  database: RequestDatabase,
  tribeId: string
): Promise<{ role: string; status: string; userId: string } | null> {
  const result = await database.execute(sql`
    select tribe_members.role, tribe_members.status, tribe_members.user_id
    from public.tribe_members
    where tribe_members.tribe_id = ${tribeId}
      and tribe_members.user_id = public.current_app_user_id()
    for share of tribe_members
  `);
  const row = (result.rows?.[0] ?? null) as {
    role: string;
    status: string;
    user_id: string;
  } | null;

  return row ? { role: row.role, status: row.status, userId: row.user_id } : null;
}

const VERIFICATION_SELECT = sql`
  member_verifications.id,
  member_verifications.user_id,
  member_verifications.provider_id,
  member_verifications.status,
  member_verifications.declared_email,
  member_verifications.decision_reason,
  member_verifications.version,
  member_verifications.reviewed_at,
  member_verifications.updated_at,
  verification_providers.display_name as provider_display_name,
  coalesce("user".name, '') as member_display_name
`;

export class PostgresMemberVerificationRepository implements MemberVerificationRepository {
  constructor(
    private readonly executeWithDatabase: DatabaseExecutor,
    private readonly recordAuditEvent: VerificationAuditWriter
  ) {}

  async listProviders({
    includeInactive,
    tribeSlug,
  }: {
    includeInactive: boolean;
    tribeSlug: string;
  }): Promise<VerificationProvider[] | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id from public.tribes where tribes.slug = ${tribeSlug} limit 1
        ),
        viewer as (
          select
            exists (
              select 1 from public.tribe_members
              where tribe_members.tribe_id = (select id from target_tribe)
                and tribe_members.user_id = public.current_app_user_id()
                and tribe_members.status in ('active', 'muted')
            ) as is_member,
            coalesce(public.can_manage_tribe_settings((select id from target_tribe)), false) as is_leader
        )
        select
          (select is_member from viewer) as is_member,
          verification_providers.id,
          verification_providers.key,
          verification_providers.display_name,
          verification_providers.instructions,
          verification_providers.link_url,
          verification_providers.is_active
        from (select 1) as anchor
        left join public.verification_providers
          on verification_providers.tribe_id = (select id from target_tribe)
          and (select is_member from viewer)
          and (
            verification_providers.is_active = true
            or (${includeInactive} and (select is_leader from viewer))
          )
        order by verification_providers.display_name asc nulls last
      `);
      const rows = (result.rows ?? []) as Array<ProviderRow & { is_member: boolean }>;

      if (!rows[0]?.is_member) {
        return null;
      }

      return rows.filter((row) => row.id).map(mapProvider);
    });
  }

  async saveProvider(
    command: SaveVerificationProviderCommand
  ): Promise<SaveVerificationProviderResult> {
    return this.executeWithDatabase(async (database) => {
      const tribeId = await resolveTribeId(database, command.tribeSlug);

      if (!tribeId) {
        return { status: "not_found" };
      }

      const actor = await lockOwnMembership(database, tribeId);

      if (!actor || actor.role !== "leader" || actor.status !== "active") {
        return { status: "forbidden" };
      }

      try {
        let row: ProviderRow | null;

        if (command.providerId) {
          const result = await database.execute(sql`
            update public.verification_providers
            set
              key = ${command.key},
              display_name = ${command.displayName},
              instructions = ${command.instructions},
              link_url = ${command.linkUrl},
              is_active = ${command.isActive},
              updated_at = timezone('utc', now())
            where verification_providers.id = ${command.providerId}
              and verification_providers.tribe_id = ${tribeId}
            returning id, key, display_name, instructions, link_url, is_active
          `);
          row = (result.rows?.[0] ?? null) as ProviderRow | null;

          if (!row) {
            return { status: "not_found" };
          }
        } else {
          const result = await database.execute(sql`
            insert into public.verification_providers (
              tribe_id, key, display_name, instructions, link_url, is_active, created_by
            )
            select
              ${tribeId},
              ${command.key},
              ${command.displayName},
              ${command.instructions},
              ${command.linkUrl},
              ${command.isActive},
              ${actor.userId}
            where (
              select count(*) from public.verification_providers
              where verification_providers.tribe_id = ${tribeId}
            ) < ${VERIFICATION_PROVIDER_LIMITS.maxProvidersPerTribe}
            returning id, key, display_name, instructions, link_url, is_active
          `);
          row = (result.rows?.[0] ?? null) as ProviderRow | null;

          if (!row) {
            return { status: "limit_reached" };
          }
        }

        await this.recordAuditEvent(database, {
          action: VERIFICATION_AUDIT_ACTION.providerSaved,
          actorUserId: actor.userId,
          correlationId: command.correlationId,
          entityId: row.id,
          entityType: VERIFICATION_AUDIT_ENTITY.provider,
          fromState: null,
          reason: null,
          subjectUserId: null,
          toState: row.is_active ? "active" : "inactive",
          tribeId,
        });

        return {
          provider: mapProvider(row),
          status: command.providerId ? "updated" : "created",
        };
      } catch (error) {
        if (readPostgresErrorCode(error) === POSTGRES_UNIQUE_VIOLATION) {
          return { status: "duplicate_key" };
        }

        throw error;
      }
    });
  }

  async listOwn({ tribeSlug }: { tribeSlug: string }): Promise<OwnMemberVerification[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select ${VERIFICATION_SELECT}
        from public.member_verifications
        inner join public.tribes
          on tribes.id = member_verifications.tribe_id
        inner join public.verification_providers
          on verification_providers.id = member_verifications.provider_id
        left join public."user"
          on "user".id = member_verifications.user_id
        where tribes.slug = ${tribeSlug}
          and member_verifications.user_id = public.current_app_user_id()
        order by verification_providers.display_name asc
      `);

      return ((result.rows ?? []) as VerificationRow[]).map(mapOwnVerification);
    });
  }

  async request(
    command: RequestMemberVerificationCommand
  ): Promise<RequestMemberVerificationResult> {
    return this.executeWithDatabase(async (database) => {
      const tribeId = await resolveTribeId(database, command.tribeSlug);

      if (!tribeId) {
        return { status: "not_found" };
      }

      const member = await lockOwnMembership(database, tribeId);

      if (!member || (member.status !== "active" && member.status !== "muted")) {
        return { status: "forbidden" };
      }

      const providerResult = await database.execute(sql`
        select verification_providers.id
        from public.verification_providers
        where verification_providers.id = ${command.providerId}
          and verification_providers.tribe_id = ${tribeId}
          and verification_providers.is_active = true
      `);

      if ((providerResult.rows ?? []).length === 0) {
        return { status: "provider_unavailable" };
      }

      // Idempotent first request: concurrent inserts collapse on the unique
      // (tribe, user, provider) key; a new statement then sees the winner.
      const inserted = await database.execute(sql`
        insert into public.member_verifications (
          tribe_id, user_id, provider_id, status, declared_email
        )
        values (
          ${tribeId},
          ${member.userId},
          ${command.providerId},
          ${MEMBER_VERIFICATION_STATUS.pending},
          ${command.declaredEmail}
        )
        on conflict (tribe_id, user_id, provider_id) do nothing
        returning id
      `);
      const insertedId = (inserted.rows?.[0] as { id: string } | undefined)?.id;

      if (insertedId) {
        await this.recordAuditEvent(database, {
          action: VERIFICATION_AUDIT_ACTION.requested,
          actorUserId: member.userId,
          correlationId: command.correlationId,
          entityId: insertedId,
          entityType: VERIFICATION_AUDIT_ENTITY.verification,
          fromState: null,
          reason: null,
          subjectUserId: member.userId,
          toState: MEMBER_VERIFICATION_STATUS.pending,
          tribeId,
        });

        return {
          status: "created",
          verification: await this.readOwnById(database, insertedId),
        };
      }

      const currentResult = await database.execute(sql`
        select id, status, declared_email
        from public.member_verifications
        where tribe_id = ${tribeId}
          and user_id = ${member.userId}
          and provider_id = ${command.providerId}
        for update
      `);
      const current = currentResult.rows?.[0] as {
        declared_email: string | null;
        id: string;
        status: MemberVerificationStatus;
      };
      const transition = resolveVerificationRequestTransition(
        current.status,
        (current.declared_email ?? null) !== command.declaredEmail
      );

      if (transition.kind === "unchanged") {
        return {
          status: "unchanged",
          verification: await this.readOwnById(database, current.id),
        };
      }

      await database.execute(sql`
        update public.member_verifications
        set
          status = ${MEMBER_VERIFICATION_STATUS.pending},
          declared_email = ${command.declaredEmail},
          decision_reason = null,
          reviewed_by = null,
          reviewed_at = null,
          version = member_verifications.version + 1,
          updated_at = timezone('utc', now())
        where member_verifications.id = ${current.id}
      `);
      await this.recordAuditEvent(database, {
        action: VERIFICATION_AUDIT_ACTION.requested,
        actorUserId: member.userId,
        correlationId: command.correlationId,
        entityId: current.id,
        entityType: VERIFICATION_AUDIT_ENTITY.verification,
        fromState: current.status,
        reason: null,
        subjectUserId: member.userId,
        toState: MEMBER_VERIFICATION_STATUS.pending,
        tribeId,
      });

      return {
        status: "reopened",
        verification: await this.readOwnById(database, current.id),
      };
    });
  }

  async listReviewQueue(
    query: ListReviewQueueQuery
  ): Promise<ReviewQueuePage | { status: "forbidden" | "not_found" }> {
    return this.executeWithDatabase(async (database) => {
      const tribeId = await resolveTribeId(database, query.tribeSlug);

      if (!tribeId) {
        return { status: "not_found" };
      }

      const reviewerResult = await database.execute(sql`
        select public.can_review_member_verifications(${tribeId}) as can_review
      `);

      if ((reviewerResult.rows?.[0] as { can_review: boolean }).can_review !== true) {
        return { status: "forbidden" };
      }

      const searchPattern = query.search
        ? `%${query.search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
        : null;
      const result = await database.execute(sql`
        select
          ${VERIFICATION_SELECT},
          count(*) over () as total_count
        from public.member_verifications
        inner join public.verification_providers
          on verification_providers.id = member_verifications.provider_id
        left join public."user"
          on "user".id = member_verifications.user_id
        where member_verifications.tribe_id = ${tribeId}
          and (${query.status}::text is null or member_verifications.status = ${query.status})
          and (${searchPattern}::text is null or "user".name ilike ${searchPattern})
        order by member_verifications.created_at asc, member_verifications.id asc
        limit ${query.pageSize}
        offset ${(query.page - 1) * query.pageSize}
      `);
      const rows = (result.rows ?? []) as Array<VerificationRow & { total_count: string | number }>;

      return {
        items: rows.map(mapQueueItem),
        total: Number(rows[0]?.total_count ?? 0),
      };
    });
  }

  async review(command: ReviewMemberVerificationCommand): Promise<ReviewMemberVerificationResult> {
    return this.executeWithDatabase(async (database) => {
      const tribeId = await resolveTribeId(database, command.tribeSlug);

      if (!tribeId) {
        return { status: "not_found" };
      }

      const reviewer = await lockOwnMembership(database, tribeId);

      if (
        !reviewer ||
        reviewer.status !== "active" ||
        (reviewer.role !== "leader" && reviewer.role !== "guardian")
      ) {
        return { status: "forbidden" };
      }

      const currentResult = await database.execute(sql`
        select id, status, version, user_id
        from public.member_verifications
        where member_verifications.id = ${command.verificationId}
          and member_verifications.tribe_id = ${tribeId}
        for update
      `);
      const current = (currentResult.rows?.[0] ?? null) as {
        id: string;
        status: MemberVerificationStatus;
        user_id: string;
        version: number;
      } | null;

      if (!current) {
        return { status: "not_found" };
      }

      if (Number(current.version) !== command.expectedVersion) {
        return { status: "conflict", verification: await this.readQueueItem(database, current.id) };
      }

      const transition = resolveVerificationReviewTransition(
        current.status,
        command.decision,
        command.reason
      );

      if (transition.kind === "reason_required") {
        return { status: "reason_required" };
      }

      if (transition.kind === "invalid_transition") {
        return {
          status: "invalid_transition",
          verification: await this.readQueueItem(database, current.id),
        };
      }

      await database.execute(sql`
        update public.member_verifications
        set
          status = ${transition.nextStatus},
          decision_reason = ${command.reason},
          reviewed_by = ${reviewer.userId},
          reviewed_at = timezone('utc', now()),
          version = member_verifications.version + 1,
          updated_at = timezone('utc', now())
        where member_verifications.id = ${current.id}
          and member_verifications.version = ${command.expectedVersion}
      `);
      await this.recordAuditEvent(database, {
        action: VERIFICATION_AUDIT_ACTION.decided,
        actorUserId: reviewer.userId,
        correlationId: command.correlationId,
        entityId: current.id,
        entityType: VERIFICATION_AUDIT_ENTITY.verification,
        fromState: current.status,
        reason: command.reason,
        subjectUserId: current.user_id,
        toState: transition.nextStatus,
        tribeId,
      });

      return { status: "updated", verification: await this.readQueueItem(database, current.id) };
    });
  }

  private async readOwnById(
    database: RequestDatabase,
    verificationId: string
  ): Promise<OwnMemberVerification> {
    return mapOwnVerification(await this.readRow(database, verificationId));
  }

  private async readQueueItem(
    database: RequestDatabase,
    verificationId: string
  ): Promise<ReviewQueueItem> {
    return mapQueueItem(await this.readRow(database, verificationId));
  }

  private async readRow(
    database: RequestDatabase,
    verificationId: string
  ): Promise<VerificationRow> {
    const result = await database.execute(sql`
      select ${VERIFICATION_SELECT}
      from public.member_verifications
      inner join public.verification_providers
        on verification_providers.id = member_verifications.provider_id
      left join public."user"
        on "user".id = member_verifications.user_id
      where member_verifications.id = ${verificationId}
    `);

    return result.rows?.[0] as VerificationRow;
  }
}
