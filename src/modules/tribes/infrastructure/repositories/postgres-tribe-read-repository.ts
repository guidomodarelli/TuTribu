import { sql } from "drizzle-orm";

import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import type {
  TribeMemberResult,
  TribeMemberRole,
} from "@/src/modules/tribes/application/results/tribe-member-result";
import type { Tribe } from "@/src/modules/tribes/domain/entities/tribe";
import type {
  TribeMembershipAccess,
  TribeMembershipAccessWithTribe,
  TribeMembershipStatus,
  TribeMembershipStatusReason,
  TribeReadRepository,
} from "@/src/modules/tribes/domain/repositories/tribe-read-repository";
import {
  TRIBE_MEMBERSHIP_STATUS,
  TRIBE_MEMBERSHIP_STATUS_REASON,
} from "@/src/modules/tribes/constants/tribe-page-access";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type PostgresTribeRow = {
  id: string;
  name: string;
  slug: string;
  visibility: "private";
};

type PostgresMembershipTribeRow = {
  membership_status: "active" | "muted";
  tribe_id: string;
  role: "guardian" | "tribemate" | "leader";
  tribes: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

type PostgresTribeMemberRow = {
  email: string;
  image: string | null;
  member_id: string;
  name: string | null;
  role: string | null;
};

type PostgresMembershipAccessRow = {
  status: string | null;
  status_reason: string | null;
};

type PostgresMembershipAccessWithTribeRow = PostgresMembershipAccessRow & {
  id: string | null;
  name: string | null;
  slug: string | null;
  visibility: "private" | null;
};

const TRIBE_MEMBER_DEFAULTS = {
  fallbackPartCount: 2,
  unknownFallback: "??",
  unknownName: "Integrante",
} as const;

const TRIBE_MEMBER_ROLE = {
  guardian: "guardian",
  leader: "leader",
  tribemate: "tribemate",
} as const;

function createTribeMemberAvatarFallback(name: string): string {
  const fallback = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, TRIBE_MEMBER_DEFAULTS.fallbackPartCount)
    .map((namePart) => namePart.charAt(0).toUpperCase())
    .join("");

  return fallback || TRIBE_MEMBER_DEFAULTS.unknownFallback;
}

function normalizeTribeMemberRole(role: string | null): TribeMemberRole {
  if (
    role === TRIBE_MEMBER_ROLE.leader ||
    role === TRIBE_MEMBER_ROLE.guardian ||
    role === TRIBE_MEMBER_ROLE.tribemate
  ) {
    return role;
  }

  return TRIBE_MEMBER_ROLE.tribemate;
}

function normalizeMembershipStatus(
  status: string | null
): TribeMembershipStatus | null {
  return status === TRIBE_MEMBERSHIP_STATUS.active ||
    status === TRIBE_MEMBERSHIP_STATUS.muted ||
    status === TRIBE_MEMBERSHIP_STATUS.blocked ||
    status === TRIBE_MEMBERSHIP_STATUS.removed
    ? status
    : null;
}

function normalizeMembershipStatusReason(
  statusReason: string | null
): TribeMembershipStatusReason {
  if (
    statusReason === TRIBE_MEMBERSHIP_STATUS_REASON.conductBlocked ||
    statusReason === TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked ||
    statusReason === TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive
  ) {
    return statusReason;
  }

  return TRIBE_MEMBERSHIP_STATUS_REASON.none;
}

function mapTribeMemberRow(row: PostgresTribeMemberRow): TribeMemberResult {
  const name = row.name || TRIBE_MEMBER_DEFAULTS.unknownName;

  return {
    avatarFallback: createTribeMemberAvatarFallback(name),
    email: row.email,
    id: row.member_id,
    image: row.image,
    name,
    role: normalizeTribeMemberRole(row.role),
  };
}

function mapTribeRow(row: PostgresTribeRow): Tribe {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    visibility: row.visibility,
  };
}

function mapReadableTribeRow(
  row: PostgresMembershipAccessWithTribeRow
): Tribe | null {
  if (!row.id || !row.name || !row.slug || !row.visibility) {
    return null;
  }

  return mapTribeRow({
    id: row.id,
    name: row.name,
    slug: row.slug,
    visibility: row.visibility,
  });
}

export class PostgresTribeReadRepository implements TribeReadRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async findBySlug(slug: string): Promise<Tribe | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select id, name, slug, visibility
        from public.tribes
        where slug = ${slug}
        limit 1
      `);
      const data = (result.rows?.[0] ?? null) as PostgresTribeRow | null;

      if (!data) {
        return null;
      }

      return mapTribeRow(data);
    });
  }

  async findCurrentMembershipAccessWithTribeBySlug(
    slug: string
  ): Promise<TribeMembershipAccessWithTribe | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with membership_access as (
          select status, status_reason
          from public.get_current_tribe_membership_by_slug(${slug})
        )
        select
          membership_access.status,
          membership_access.status_reason,
          tribes.id,
          tribes.name,
          tribes.slug,
          tribes.visibility
        from membership_access
        left join public.tribes
          on tribes.slug = ${slug}
        limit 1
      `);
      const data = (result.rows?.[0] ?? null) as
        | PostgresMembershipAccessWithTribeRow
        | null;
      const status = normalizeMembershipStatus(data?.status ?? null);

      if (!data || !status) {
        return null;
      }

      return {
        membershipAccess: {
          status,
          statusReason: normalizeMembershipStatusReason(data.status_reason),
        },
        tribe: mapReadableTribeRow(data),
      };
    });
  }

  async findCurrentMembershipAccessBySlug(
    slug: string
  ): Promise<TribeMembershipAccess | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select status, status_reason
        from public.get_current_tribe_membership_by_slug(${slug})
      `);
      const data = (result.rows?.[0] ?? null) as PostgresMembershipAccessRow | null;
      const status = normalizeMembershipStatus(data?.status ?? null);

      if (!status) {
        return null;
      }

      return {
        status,
        statusReason: normalizeMembershipStatusReason(data?.status_reason ?? null),
      };
    });
  }

  async findCurrentMembershipStatusBySlug(
    slug: string
  ): Promise<TribeMembershipStatus | null> {
    const membershipAccess = await this.findCurrentMembershipAccessBySlug(slug);

    return membershipAccess?.status ?? null;
  }

  async listVisibleMembershipTribes(): Promise<MemberTribeListItemResult[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          tribe_members.status as membership_status,
          tribe_members.tribe_id,
          tribe_members.role,
          tribes.id as tribe_row_id,
          tribes.name,
          tribes.slug
        from public.tribe_members
        inner join public.tribes
          on tribes.id = tribe_members.tribe_id
        where tribe_members.status in (
          ${TRIBE_MEMBERSHIP_STATUS.active},
          ${TRIBE_MEMBERSHIP_STATUS.muted}
        )
          and tribe_members.user_id = public.current_app_user_id()
        order by tribes.name asc
      `);

      return ((result.rows ?? []) as Array<
        PostgresMembershipTribeRow & {
          tribe_row_id?: string | null;
          name?: string | null;
          slug?: string | null;
        }
      >).reduce<MemberTribeListItemResult[]>((membershipTribes, row) => {
        if (row.name && row.slug) {
          membershipTribes.push({
            tribeId: row.tribe_row_id ?? row.tribe_id,
            membershipStatus: row.membership_status,
            name: row.name,
            role: row.role,
            slug: row.slug,
          });
        }

        return membershipTribes;
      }, []);
    });
  }

  async listVisibleTribeMembersBySlug(slug: string): Promise<TribeMemberResult[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select member_id, role, name, email, image
        from public.list_visible_tribe_members_by_slug(${slug})
      `);

      return ((result.rows ?? []) as PostgresTribeMemberRow[]).map(
        mapTribeMemberRow
      );
    });
  }
}
