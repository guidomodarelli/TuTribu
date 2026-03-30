import { sql } from "drizzle-orm";

import type { MemberCommunityListItemResult } from "@/src/modules/communities/application/results/member-community-list-item-result";
import type { Community } from "@/src/modules/communities/domain/entities/community";
import type { CommunityReadRepository } from "@/src/modules/communities/domain/repositories/community-read-repository";
import { COMMUNITY_MEMBERSHIP_STATUS } from "@/src/modules/communities/constants/community-page-access";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type PostgresCommunityRow = {
  id: string;
  name: string;
  slug: string;
  visibility: "private";
};

type PostgresMembershipCommunityRow = {
  community_id: string;
  communities: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

export class PostgresCommunityReadRepository implements CommunityReadRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async findBySlug(slug: string): Promise<Community | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select id, name, slug, visibility
        from public.communities
        where slug = ${slug}
        limit 1
      `);
      const data = (result.rows?.[0] ?? null) as PostgresCommunityRow | null;

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
        select public.get_current_community_membership_status_by_slug(${slug}) as status
      `);
      const data = result.rows?.[0]?.status;

      return data === COMMUNITY_MEMBERSHIP_STATUS.active ||
        data === COMMUNITY_MEMBERSHIP_STATUS.muted ||
        data === COMMUNITY_MEMBERSHIP_STATUS.blocked
        ? data
        : null;
    });
  }

  async listVisibleMembershipCommunities(): Promise<MemberCommunityListItemResult[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          community_members.community_id,
          communities.id as community_row_id,
          communities.name,
          communities.slug
        from public.community_members
        inner join public.communities
          on communities.id = community_members.community_id
        where community_members.status in (
          ${COMMUNITY_MEMBERSHIP_STATUS.active},
          ${COMMUNITY_MEMBERSHIP_STATUS.muted}
        )
        order by communities.name asc
      `);

      return ((result.rows ?? []) as Array<
        PostgresMembershipCommunityRow & {
          community_row_id?: string | null;
          name?: string | null;
          slug?: string | null;
        }
      >)
        .filter((row) => row.name && row.slug)
        .map((row) => ({
          communityId: row.community_row_id ?? row.community_id,
          name: row.name!,
          slug: row.slug!,
        }));
    });
  }
}
