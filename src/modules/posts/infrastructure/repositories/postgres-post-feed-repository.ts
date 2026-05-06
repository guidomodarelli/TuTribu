import { sql } from "drizzle-orm";

import type {
  TribeFeedCommentResult,
  TribeFeedPostResult,
  TribeFeedResult,
  TribeChannelResult,
  PostMembershipStatus,
} from "@/src/modules/posts/application/results/tribe-feed-result";
import { POST_MEMBERSHIP_STATUS } from "@/src/modules/posts/constants/post-feed";
import type {
  ListTribeFeedQuery,
  PostFeedReadRepository,
} from "@/src/modules/posts/domain/repositories/post-feed-read-repository";
import {
  createTribeFeedAuthor,
  createTribeChannel,
  formatPostDateTimeValue,
} from "@/src/modules/posts/infrastructure/mappers/tribe-feed-view-model-mapper";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type PostFeedRow = {
  author_id: string | null;
  author_image: string | null;
  author_name: string | null;
  author_role: string | null;
  channel_access_scope: string | null;
  channel_emoji: string | null;
  channel_id: string | null;
  channel_name: string | null;
  channel_slug: string | null;
  channel_sort_order: number | string | null;
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

type TribeChannelRow = {
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

function createComment(row: PostFeedRow): TribeFeedCommentResult | null {
  if (
    !row.comment_id ||
    !row.comment_author_id ||
    !row.comment_content ||
    !row.comment_created_at
  ) {
    return null;
  }

  return {
    author: createTribeFeedAuthor({
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

function mapRowsToChannels(rows: TribeChannelRow[]): TribeChannelResult[] {
  return rows.map((row) =>
    createTribeChannel({
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
  channels: TribeChannelResult[]
): TribeFeedResult {
  const firstRow = rows[0];
  const postsById = new Map<string, TribeFeedPostResult>();

  rows.forEach((row) => {
    if (!row.post_id || !row.author_id || !row.post_content || !row.post_created_at) {
      return;
    }

    const existingPost = postsById.get(row.post_id);

    if (!existingPost && row.channel_id) {
      postsById.set(row.post_id, {
        author: createTribeFeedAuthor({
          id: row.author_id,
          image: row.author_image,
          name: row.author_name,
          role: row.author_role,
        }),
        channel: createTribeChannel({
          accessScope: row.channel_access_scope,
          emoji: row.channel_emoji,
          id: row.channel_id,
          name: row.channel_name,
          slug: row.channel_slug,
          sortOrder: row.channel_sort_order,
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
    activeChannelId: null,
    channels,
    posts: [...postsById.values()],
    viewerPermissions: createPermissions(
      normalizeMembershipStatus(firstRow?.viewer_membership_status ?? null)
    ),
  };
}

export class PostgresPostFeedRepository implements PostFeedReadRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async listByTribeSlug({
    tribeSlug,
    viewerId,
  }: ListTribeFeedQuery): Promise<TribeFeedResult> {
    return this.executeWithDatabase(async (database) => {
      const channelsResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        )
        select
          tribe_channels.id,
          tribe_channels.name,
          tribe_channels.slug,
          tribe_channels.emoji,
          tribe_channels.sort_order,
          tribe_channels.access_scope
        from public.tribe_channels
        inner join target_tribe
          on target_tribe.id = tribe_channels.tribe_id
        order by tribe_channels.sort_order asc, tribe_channels.name asc
      `);
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        ),
        post_like_counts as (
          select
            post_reactions.post_id,
            count(*) as like_count
          from public.post_reactions
          inner join public.posts liked_posts
            on liked_posts.id = post_reactions.post_id
          inner join target_tribe
            on target_tribe.id = liked_posts.tribe_id
          where post_reactions.type = 'like'
          group by post_reactions.post_id
        )
        select
          posts.id as post_id,
          posts.title as post_title,
          posts.content as post_content,
          posts.created_at as post_created_at,
          tribe_channels.id as channel_id,
          tribe_channels.name as channel_name,
          tribe_channels.slug as channel_slug,
          tribe_channels.emoji as channel_emoji,
          tribe_channels.sort_order as channel_sort_order,
          tribe_channels.access_scope as channel_access_scope,
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
        from target_tribe
        inner join public.tribe_members viewer_members
          on viewer_members.tribe_id = target_tribe.id
          and viewer_members.user_id = ${viewerId}
        left join public.posts
          on posts.tribe_id = target_tribe.id
          and posts.channel_id is not null
          and exists (
            select 1
            from public.tribe_channels channel_matches
            where channel_matches.id = posts.channel_id
              and channel_matches.tribe_id = target_tribe.id
          )
        left join public.tribe_channels
          on tribe_channels.id = posts.channel_id
        left join public."user" post_authors
          on post_authors.id = posts.author_id
        left join public.tribe_members post_members
          on post_members.tribe_id = posts.tribe_id
          and post_members.user_id = posts.author_id
        left join post_like_counts
          on post_like_counts.post_id = posts.id
        left join public.post_comments
          on post_comments.post_id = posts.id
        left join public."user" comment_authors
          on comment_authors.id = post_comments.author_id
        left join public.tribe_members comment_members
          on comment_members.tribe_id = posts.tribe_id
          and comment_members.user_id = post_comments.author_id
        where viewer_members.status in ('active', 'muted')
        group by
          posts.id,
          tribe_channels.id,
          tribe_channels.name,
          tribe_channels.slug,
          tribe_channels.emoji,
          tribe_channels.sort_order,
          tribe_channels.access_scope,
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
        mapRowsToChannels((channelsResult.rows ?? []) as TribeChannelRow[])
      );
    });
  }
}
