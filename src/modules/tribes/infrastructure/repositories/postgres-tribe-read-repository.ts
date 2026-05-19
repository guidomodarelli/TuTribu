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
  visibility: string | null;
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

const TRIBE_VISIBILITY = {
  private: "private",
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
    status === TRIBE_MEMBERSHIP_STATUS.ownerRead ||
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

function normalizeTribeVisibility(visibility: string | null): Tribe["visibility"] | null {
  return visibility === TRIBE_VISIBILITY.private ? visibility : null;
}

function mapReadableTribeRow(
  row: PostgresMembershipAccessWithTribeRow
): Tribe | null {
  const visibility = normalizeTribeVisibility(row.visibility);

  if (!row.id || !row.name || !row.slug || !visibility) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    visibility,
  };
}

export class PostgresTribeReadRepository implements TribeReadRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async findBySlug(slug: string): Promise<Tribe | null> {
    return this.executeWithDatabase(async (database) => {
      const data = await database.kysely
        .selectFrom("tribes")
        .select(["id", "name", "slug", "visibility"])
        .where("slug", "=", slug)
        .limit(1)
        .executeTakeFirst();

      if (!data) {
        return null;
      }

      const visibility = normalizeTribeVisibility(data.visibility);

      if (!visibility) {
        return null;
      }

      return {
        id: data.id,
        name: data.name,
        slug: data.slug,
        visibility,
      };
    });
  }

  async findCurrentMembershipAccessWithTribeBySlug(
    slug: string
  ): Promise<TribeMembershipAccessWithTribe | null> {
    return this.executeWithDatabase(async (database) => {
      const data = await database.kysely
        .selectFrom((expressionBuilder) =>
          expressionBuilder.fn<PostgresMembershipAccessRow>(
            "public.get_current_tribe_membership_by_slug",
            [expressionBuilder.val(slug)]
          ).as("membership_access")
        )
        .leftJoin("tribes", (join) => join.on("tribes.slug", "=", slug))
        .select([
          "membership_access.status",
          "membership_access.status_reason",
          "tribes.id",
          "tribes.name",
          "tribes.slug",
          "tribes.visibility",
        ])
        .limit(1)
        .executeTakeFirst();
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
      const data = await database.kysely
        .selectFrom((expressionBuilder) =>
          expressionBuilder.fn<PostgresMembershipAccessRow>(
            "public.get_current_tribe_membership_by_slug",
            [expressionBuilder.val(slug)]
          ).as("membership_access")
        )
        .select(["status", "status_reason"])
        .executeTakeFirst();
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
      const rows = await database.kysely
        .selectFrom("tribes")
        .leftJoin("tribe_members", (join) =>
          join
            .onRef("tribe_members.tribe_id", "=", "tribes.id")
            .on(
              "tribe_members.user_id",
              "=",
              (expressionBuilder) =>
                expressionBuilder.fn<string>("public.current_app_user_id")
            )
        )
        .select((expressionBuilder) => [
          "tribes.id as tribe_id",
          "tribes.id as tribe_row_id",
          "tribes.name",
          "tribes.slug",
          expressionBuilder
            .case()
            .when(expressionBuilder("tribe_members.role", "is", null))
            .then(TRIBE_MEMBER_ROLE.tribemate)
            .else(expressionBuilder.ref("tribe_members.role"))
            .end()
            .as("role"),
        ])
        .where((expressionBuilder) =>
          expressionBuilder.or([
            expressionBuilder.fn<boolean>("public.is_app_owner"),
            expressionBuilder("tribe_members.status", "in", [
              TRIBE_MEMBERSHIP_STATUS.active,
              TRIBE_MEMBERSHIP_STATUS.muted,
            ]),
          ])
        )
        .orderBy("tribes.name", "asc")
        .execute();

      return rows.reduce<MemberTribeListItemResult[]>((membershipTribes, row) => {
        if (row.name && row.slug) {
          membershipTribes.push({
            tribeId: row.tribe_row_id ?? row.tribe_id,
            name: row.name,
            role: normalizeTribeMemberRole(row.role),
            slug: row.slug,
          });
        }

        return membershipTribes;
      }, []);
    });
  }

  async listVisibleTribeMembersBySlug(slug: string): Promise<TribeMemberResult[]> {
    return this.executeWithDatabase(async (database) => {
      const rows = await database.kysely
        .selectFrom((expressionBuilder) =>
          expressionBuilder.fn<PostgresTribeMemberRow>(
            "public.list_visible_tribe_members_by_slug",
            [expressionBuilder.val(slug)]
          ).as("visible_tribe_members")
        )
        .select(["member_id", "role", "name", "email", "image"])
        .execute();

      return rows.map(mapTribeMemberRow);
    });
  }
}
