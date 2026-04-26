import { sql } from "drizzle-orm";

import type {
  CommunityFeedCommentResult,
  CommunityFeedPostResult,
  CommunityFeedResult,
  CommunityPostCategoryResult,
  PostMembershipStatus,
} from "@/src/modules/posts/application/results/community-feed-result";
import { POST_MEMBERSHIP_STATUS } from "@/src/modules/posts/constants/post-feed";
import type {
  ListCommunityFeedQuery,
  PostFeedReadRepository,
} from "@/src/modules/posts/domain/repositories/post-feed-read-repository";
import {
  createCommunityFeedAuthor,
  createCommunityPostCategory,
  formatPostDateTimeValue,
} from "@/src/modules/posts/infrastructure/mappers/community-feed-view-model-mapper";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type PostFeedRow = {
  author_id: string | null;
  author_image: string | null;
  author_name: string | null;
  author_role: string | null;
  category_access_scope: string | null;
  category_emoji: string | null;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  category_sort_order: number | string | null;
  comment_author_id: string | null;
  comment_author_image: string | null;
  comment_author_name: string | null;
  comment_author_role: string | null;
  comment_content: string | null;
  comment_created_at: Date | string | null;
  comment_id: string | null;
  like_count: number | string;
  liked_by_viewer: boolean;
  post_content: string | null;
  post_created_at: Date | string | null;
  post_id: string | null;
  post_title: string | null;
  viewer_membership_status: string | null;
};

type PostCategoryRow = {
  access_scope: string | null;
  emoji: string | null;
  id: string;
  name: string | null;
  slug: string | null;
  sort_order: number | string | null;
};

function normalizeMembershipStatus(status: string | null): PostMembershipStatus | null {
  if (
    status === POST_MEMBERSHIP_STATUS.active ||
    status === POST_MEMBERSHIP_STATUS.muted ||
    status === POST_MEMBERSHIP_STATUS.blocked
  ) {
    return status;
  }

  return null;
}

function createComment(row: PostFeedRow): CommunityFeedCommentResult | null {
  if (
    !row.comment_id ||
    !row.comment_author_id ||
    !row.comment_content ||
    !row.comment_created_at
  ) {
    return null;
  }

  return {
    author: createCommunityFeedAuthor({
      id: row.comment_author_id,
      image: row.comment_author_image,
      name: row.comment_author_name,
      role: row.comment_author_role,
    }),
    content: row.comment_content,
    createdAt: formatPostDateTimeValue(row.comment_created_at),
    id: row.comment_id,
  };
}

function createPermissions(status: PostMembershipStatus | null) {
  const canParticipate = status === POST_MEMBERSHIP_STATUS.active;

  return {
    canComment: canParticipate,
    canCreatePost: canParticipate,
    canReact: canParticipate,
  };
}

function mapRowsToCategories(rows: PostCategoryRow[]): CommunityPostCategoryResult[] {
  return rows.map((row) =>
    createCommunityPostCategory({
      accessScope: row.access_scope,
      emoji: row.emoji,
      id: row.id,
      name: row.name,
      slug: row.slug,
      sortOrder: row.sort_order,
    })
  );
}

function mapRowsToFeed(
  rows: PostFeedRow[],
  categories: CommunityPostCategoryResult[]
): CommunityFeedResult {
  const firstRow = rows[0];
  const postsById = new Map<string, CommunityFeedPostResult>();

  rows.forEach((row) => {
    if (!row.post_id || !row.author_id || !row.post_content || !row.post_created_at) {
      return;
    }

    const existingPost = postsById.get(row.post_id);

    if (!existingPost && row.category_id) {
      postsById.set(row.post_id, {
        author: createCommunityFeedAuthor({
          id: row.author_id,
          image: row.author_image,
          name: row.author_name,
          role: row.author_role,
        }),
        category: createCommunityPostCategory({
          accessScope: row.category_access_scope,
          emoji: row.category_emoji,
          id: row.category_id,
          name: row.category_name,
          slug: row.category_slug,
          sortOrder: row.category_sort_order,
        }),
        comments: [],
        content: row.post_content,
        createdAt: formatPostDateTimeValue(row.post_created_at),
        id: row.post_id,
        likedByViewer: row.liked_by_viewer,
        likeCount: Number(row.like_count),
        title: row.post_title,
      });
    }

    const comment = createComment(row);
    const post = postsById.get(row.post_id);

    if (comment && post) {
      post.comments.push(comment);
    }
  });

  return {
    activeCategoryId: null,
    categories,
    posts: [...postsById.values()],
    viewerPermissions: createPermissions(
      normalizeMembershipStatus(firstRow?.viewer_membership_status ?? null)
    ),
  };
}

export class PostgresPostFeedRepository implements PostFeedReadRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async listByCommunitySlug({
    communitySlug,
    viewerId,
  }: ListCommunityFeedQuery): Promise<CommunityFeedResult> {
    return this.executeWithDatabase(async (database) => {
      const categoriesResult = await database.execute(sql`
        with target_community as (
          select communities.id
          from public.communities
          where communities.slug = ${communitySlug}
          limit 1
        )
        select
          community_post_categories.id,
          community_post_categories.name,
          community_post_categories.slug,
          community_post_categories.emoji,
          community_post_categories.sort_order,
          community_post_categories.access_scope
        from public.community_post_categories
        inner join target_community
          on target_community.id = community_post_categories.community_id
        order by community_post_categories.sort_order asc, community_post_categories.name asc
      `);
      const result = await database.execute(sql`
        with target_community as (
          select communities.id
          from public.communities
          where communities.slug = ${communitySlug}
          limit 1
        ),
        post_like_counts as (
          select
            post_reactions.post_id,
            count(*) as like_count
          from public.post_reactions
          inner join public.posts liked_posts
            on liked_posts.id = post_reactions.post_id
          inner join target_community
            on target_community.id = liked_posts.community_id
          where post_reactions.type = 'like'
          group by post_reactions.post_id
        )
        select
          posts.id as post_id,
          posts.title as post_title,
          posts.content as post_content,
          posts.created_at as post_created_at,
          community_post_categories.id as category_id,
          community_post_categories.name as category_name,
          community_post_categories.slug as category_slug,
          community_post_categories.emoji as category_emoji,
          community_post_categories.sort_order as category_sort_order,
          community_post_categories.access_scope as category_access_scope,
          post_authors.id as author_id,
          post_authors.name as author_name,
          post_authors.image as author_image,
          post_members.role as author_role,
          coalesce(post_like_counts.like_count, 0) as like_count,
          exists (
            select 1
            from public.post_reactions viewer_reactions
            where viewer_reactions.post_id = posts.id
              and viewer_reactions.user_id = ${viewerId}
              and viewer_reactions.type = 'like'
          ) as liked_by_viewer,
          post_comments.id as comment_id,
          post_comments.content as comment_content,
          post_comments.created_at as comment_created_at,
          comment_authors.id as comment_author_id,
          comment_authors.name as comment_author_name,
          comment_authors.image as comment_author_image,
          comment_members.role as comment_author_role,
          viewer_members.status as viewer_membership_status
        from target_community
        inner join public.community_members viewer_members
          on viewer_members.community_id = target_community.id
          and viewer_members.user_id = ${viewerId}
        left join public.posts
          on posts.community_id = target_community.id
          and posts.category_id is not null
          and exists (
            select 1
            from public.community_post_categories category_matches
            where category_matches.id = posts.category_id
              and category_matches.community_id = target_community.id
          )
        left join public.community_post_categories
          on community_post_categories.id = posts.category_id
        left join public."user" post_authors
          on post_authors.id = posts.author_id
        left join public.community_members post_members
          on post_members.community_id = posts.community_id
          and post_members.user_id = posts.author_id
        left join post_like_counts
          on post_like_counts.post_id = posts.id
        left join public.post_comments
          on post_comments.post_id = posts.id
        left join public."user" comment_authors
          on comment_authors.id = post_comments.author_id
        left join public.community_members comment_members
          on comment_members.community_id = posts.community_id
          and comment_members.user_id = post_comments.author_id
        where viewer_members.status in ('active', 'muted')
        group by
          posts.id,
          community_post_categories.id,
          community_post_categories.name,
          community_post_categories.slug,
          community_post_categories.emoji,
          community_post_categories.sort_order,
          community_post_categories.access_scope,
          post_like_counts.like_count,
          post_authors.id,
          post_members.role,
          post_comments.id,
          comment_authors.id,
          comment_members.role,
          viewer_members.status
        order by posts.created_at desc, post_comments.created_at asc
      `);

      return mapRowsToFeed(
        (result.rows ?? []) as PostFeedRow[],
        mapRowsToCategories((categoriesResult.rows ?? []) as PostCategoryRow[])
      );
    });
  }
}
