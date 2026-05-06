import { sql } from "drizzle-orm";

import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import type {
  TribeMemberResult,
  TribeMemberRole,
} from "@/src/modules/tribes/application/results/tribe-member-result";
import type { Tribe } from "@/src/modules/tribes/domain/entities/tribe";
import type { TribeReadRepository } from "@/src/modules/tribes/domain/repositories/tribe-read-repository";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
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
  tribe_id: string;
  role: "guardian" | "tribemate" | "leader";
  tribes: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

type PostgresTribeMemberRow = {
  image: string | null;
  member_id: string;
  name: string | null;
  role: string | null;
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

function mapTribeMemberRow(row: PostgresTribeMemberRow): TribeMemberResult {
  const name = row.name || TRIBE_MEMBER_DEFAULTS.unknownName;

  return {
    avatarFallback: createTribeMemberAvatarFallback(name),
    id: row.member_id,
    image: row.image,
    name,
    role: normalizeTribeMemberRole(row.role),
  };
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

      return {
        id: data.id,
        name: data.name,
        slug: data.slug,
        visibility: data.visibility,
      };
    });
  }

  async findCurrentMembershipStatusBySlug(
    slug: string
  ): Promise<"active" | "muted" | "blocked" | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select public.get_current_tribe_membership_status_by_slug(${slug}) as status
      `);
      const data = result.rows?.[0]?.status;

      return data === TRIBE_MEMBERSHIP_STATUS.active ||
        data === TRIBE_MEMBERSHIP_STATUS.muted ||
        data === TRIBE_MEMBERSHIP_STATUS.blocked
        ? data
        : null;
    });
  }

  async listVisibleMembershipTribes(): Promise<MemberTribeListItemResult[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
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
      >)
        .filter((row) => row.name && row.slug)
        .map((row) => ({
          tribeId: row.tribe_row_id ?? row.tribe_id,
          name: row.name!,
          role: row.role,
          slug: row.slug!,
        }));
    });
  }

  async listVisibleTribeMembersBySlug(slug: string): Promise<TribeMemberResult[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select member_id, role, name, image
        from public.list_visible_tribe_members_by_slug(${slug})
      `);

      return ((result.rows ?? []) as PostgresTribeMemberRow[]).map(
        mapTribeMemberRow
      );
    });
  }
}
