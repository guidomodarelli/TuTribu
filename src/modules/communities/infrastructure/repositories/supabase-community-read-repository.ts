import type { MemberCommunityListItemResult } from "@/src/modules/communities/application/results/member-community-list-item-result";
import type { Community } from "@/src/modules/communities/domain/entities/community";
import type { CommunityReadRepository } from "@/src/modules/communities/domain/repositories/community-read-repository";
import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

type RecoverableSupabaseError = {
  message: string;
};

type SupabaseCommunityRow = {
  id: string;
  name: string;
  slug: string;
  visibility: "private";
};

type SupabaseMembershipCommunityRow = {
  community_id: string;
  communities: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

type SupabaseDatabaseClient = {
  from: (table: string) => unknown;
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{
    data: string | null;
    error: RecoverableSupabaseError | null;
  }>;
};

type SupabaseDatabaseClientFactory = () => Promise<SupabaseDatabaseClient>;

export class SupabaseCommunityReadRepository implements CommunityReadRepository {
  constructor(
    private readonly createClient: SupabaseDatabaseClientFactory =
      createServerSupabaseClient
  ) {}

  async findBySlug(slug: string): Promise<Community | null> {
    const supabase = await this.createClient();
    const communitiesTable = supabase.from("communities") as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: SupabaseCommunityRow | null;
            error: RecoverableSupabaseError | null;
          }>;
        };
      };
    };
    const { data, error } = await communitiesTable
      .select("id, name, slug, visibility")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      visibility: data.visibility,
    };
  }

  async findCurrentMembershipStatusBySlug(
    slug: string
  ): Promise<"active" | "muted" | "blocked" | null> {
    const supabase = await this.createClient();
    const { data, error } = await supabase.rpc(
      "get_current_community_membership_status_by_slug",
      {
        target_slug: slug,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    return data === "active" || data === "muted" || data === "blocked" ? data : null;
  }

  async listVisibleMembershipCommunities(): Promise<MemberCommunityListItemResult[]> {
    const supabase = await this.createClient();
    const communityMembersTable = supabase.from("community_members") as {
      select: (columns: string) => {
        in: (column: string, values: string[]) => {
          order: (
            column: string,
            options: {
              ascending: boolean;
              referencedTable?: string;
            }
          ) => Promise<{
            data: SupabaseMembershipCommunityRow[] | null;
            error: RecoverableSupabaseError | null;
          }>;
        };
      };
    };
    const { data, error } = await communityMembersTable
      .select("community_id, communities!inner(id, name, slug)")
      .in("status", ["active", "muted"])
      .order("name", {
        ascending: true,
        referencedTable: "communities",
      });

    if (error) {
      throw new Error(error.message);
    }

    return ((data ?? []) as SupabaseMembershipCommunityRow[])
      .filter((row) => row.communities)
      .map((row) => ({
        communityId: row.communities!.id ?? row.community_id,
        name: row.communities!.name,
        slug: row.communities!.slug,
      }));
  }
}
