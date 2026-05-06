import { sql } from "drizzle-orm";

import type {
  CreateTribePostCommand,
  CreatePostCommentCommand,
  TogglePostLikeCommand,
} from "@/src/modules/posts/application/commands/tribe-post-command";
import type {
  PostCommentCreationResult,
  PostCreationResult,
  PostLikeToggleResult,
} from "@/src/modules/posts/application/results/post-mutation-result";
import {
  POST_MUTATION_STATUS,
  POST_REACTION_TYPE,
} from "@/src/modules/posts/constants/post-feed";
import type { PostCommentRepository } from "@/src/modules/posts/domain/repositories/post-comment-repository";
import type { PostCreationRepository } from "@/src/modules/posts/domain/repositories/post-creation-repository";
import type { PostReactionRepository } from "@/src/modules/posts/domain/repositories/post-reaction-repository";
import {
  createTribeFeedComment,
  createTribeFeedPost,
} from "@/src/modules/posts/infrastructure/mappers/tribe-feed-view-model-mapper";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type MutationStatusRow = {
  status: string | null;
};

type CreatedPostRow = MutationStatusRow & {
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
  post_content: string | null;
  post_created_at: Date | string | null;
  post_id: string | null;
  post_title: string | null;
};

type CreatedCommentRow = MutationStatusRow & {
  comment_author_id: string | null;
  comment_author_image: string | null;
  comment_author_name: string | null;
  comment_author_role: string | null;
  comment_content: string | null;
  comment_created_at: Date | string | null;
  comment_id: string | null;
};

type LikeCountRow = {
  like_count: number | string | null;
};

type TargetPostRow = {
  can_write: boolean;
  tribe_id: string;
  post_id: string;
};

type DeletedReactionRow = {
  id: string;
};

function mapFallbackCreationStatus(status: string | null): PostCreationResult {
  if (status === POST_MUTATION_STATUS.invalidChannel) {
    return {
      status,
    };
  }

  return {
    status:
      status === POST_MUTATION_STATUS.notFound
        ? POST_MUTATION_STATUS.notFound
        : POST_MUTATION_STATUS.forbidden,
  };
}

function mapFallbackCommentCreationStatus(
  status: string | null
): PostCommentCreationResult {
  return {
    status:
      status === POST_MUTATION_STATUS.notFound
        ? POST_MUTATION_STATUS.notFound
        : POST_MUTATION_STATUS.forbidden,
  };
}

function mapCreatedPost(row: CreatedPostRow | null): PostCreationResult {
  if (
    row?.status === POST_MUTATION_STATUS.created &&
    row.post_id &&
    row.author_id &&
    row.channel_id &&
    row.post_content &&
    row.post_created_at
  ) {
    return {
      post: createTribeFeedPost({
        id: row.post_id,
        author: {
          id: row.author_id,
          image: row.author_image,
          name: row.author_name,
          role: row.author_role,
        },
        channel: {
          accessScope: row.channel_access_scope,
          emoji: row.channel_emoji,
          id: row.channel_id,
          name: row.channel_name,
          slug: row.channel_slug,
          sortOrder: row.channel_sort_order,
        },
        content: row.post_content,
        createdAt: row.post_created_at,
        likedByViewer: false,
        likeCount: 0,
        title: row.post_title,
      }),
      status: row.status,
    };
  }

  return mapFallbackCreationStatus(row?.status ?? null);
}

function mapCreatedComment(row: CreatedCommentRow | null): PostCommentCreationResult {
  if (
    row?.status === POST_MUTATION_STATUS.created &&
    row.comment_id &&
    row.comment_author_id &&
    row.comment_content &&
    row.comment_created_at
  ) {
    return {
      comment: createTribeFeedComment({
        id: row.comment_id,
        author: {
          id: row.comment_author_id,
          image: row.comment_author_image,
          name: row.comment_author_name,
          role: row.comment_author_role,
        },
        content: row.comment_content,
        createdAt: row.comment_created_at,
      }),
      status: row.status,
    };
  }

  return mapFallbackCommentCreationStatus(row?.status ?? null);
}

export class PostgresPostMutationRepository
  implements PostCreationRepository, PostCommentRepository, PostReactionRepository
{
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async create(command: CreateTribePostCommand): Promise<PostCreationResult>;
  async create(command: CreatePostCommentCommand): Promise<PostCommentCreationResult>;
  async create(
    command: CreateTribePostCommand | CreatePostCommentCommand
  ): Promise<PostCreationResult | PostCommentCreationResult> {
    if ("postId" in command) {
      return this.createComment(command);
    }

    return this.createPost(command);
  }

  async toggle(command: TogglePostLikeCommand): Promise<PostLikeToggleResult> {
    return this.executeWithDatabase(async (database) => {
      const targetPostResult = await database.execute(sql`
        select
          posts.id as post_id,
          posts.tribe_id,
          public.is_active_tribe_member(posts.tribe_id) as can_write
        from public.posts
        inner join public.tribes
          on tribes.id = posts.tribe_id
        where posts.id = ${command.postId}
          and tribes.slug = ${command.tribeSlug}
        limit 1
      `);
      const targetPost = (targetPostResult.rows?.[0] ?? null) as TargetPostRow | null;

      if (!targetPost) {
        return {
          likedByViewer: false,
          likeCount: 0,
          status: POST_MUTATION_STATUS.notFound,
        };
      }

      if (!targetPost.can_write) {
        return {
          likedByViewer: false,
          likeCount: 0,
          status: POST_MUTATION_STATUS.forbidden,
        };
      }

      const deletedReactionResult = await database.execute(sql`
        delete from public.post_reactions
        where post_reactions.post_id = ${targetPost.post_id}
          and post_reactions.user_id = ${command.userId}
          and post_reactions.type = ${POST_REACTION_TYPE.like}
        returning post_reactions.id
      `);
      const deletedReaction = (deletedReactionResult.rows?.[0] ?? null) as
        | DeletedReactionRow
        | null;
      let status: typeof POST_MUTATION_STATUS.liked | typeof POST_MUTATION_STATUS.unliked;

      if (deletedReaction) {
        status = POST_MUTATION_STATUS.unliked;
      } else {
        await database.execute(sql`
          insert into public.post_reactions (post_id, tribe_id, user_id, type, created_at)
          values (
            ${targetPost.post_id},
            ${targetPost.tribe_id},
            ${command.userId},
            ${POST_REACTION_TYPE.like},
            timezone('utc', now())
          )
          on conflict (post_id, user_id) do nothing
          returning id
        `);
        status = POST_MUTATION_STATUS.liked;
      }

      const likeCountResult = await database.execute(sql`
        select count(*) as like_count
        from public.post_reactions
        where post_reactions.post_id = ${targetPost.post_id}
          and post_reactions.type = ${POST_REACTION_TYPE.like}
      `);
      const likeCount = Number(
        ((likeCountResult.rows?.[0] ?? null) as LikeCountRow | null)?.like_count ?? 0
      );

      if (status === POST_MUTATION_STATUS.liked) {
        return {
          likedByViewer: true,
          likeCount,
          status,
        };
      }

      if (status === POST_MUTATION_STATUS.unliked) {
        return {
          likedByViewer: false,
          likeCount,
          status,
        };
      }

      return {
        likedByViewer: false,
        likeCount,
        status: POST_MUTATION_STATUS.forbidden,
      };
    });
  }

  private async createPost(
    command: CreateTribePostCommand
  ): Promise<PostCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_channel as (
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
          where tribe_channels.id = ${command.channelId}
          limit 1
        ),
        inserted_post as (
          insert into public.posts (tribe_id, channel_id, author_id, title, content, created_at, updated_at)
          select target_tribe.id, target_channel.id, ${command.authorId}, ${command.title}, ${command.content}, timezone('utc', now()), timezone('utc', now())
          from target_tribe
          inner join target_channel
            on true
          where public.is_active_tribe_member(target_tribe.id)
          returning id, tribe_id, channel_id, author_id, title, content, created_at
        ),
        created_post as (
          select
            inserted_post.id as post_id,
            target_channel.id as channel_id,
            target_channel.name as channel_name,
            target_channel.slug as channel_slug,
            target_channel.emoji as channel_emoji,
            target_channel.sort_order as channel_sort_order,
            target_channel.access_scope as channel_access_scope,
            inserted_post.title as post_title,
            inserted_post.content as post_content,
            inserted_post.created_at as post_created_at,
            post_authors.id as author_id,
            post_authors.name as author_name,
            post_authors.image as author_image,
            post_members.role as author_role
          from inserted_post
          inner join target_channel
            on target_channel.id = inserted_post.channel_id
          inner join public."user" post_authors
            on post_authors.id = inserted_post.author_id
          left join public.tribe_members post_members
            on post_members.tribe_id = inserted_post.tribe_id
            and post_members.user_id = inserted_post.author_id
        )
        select
          case
            when exists (select 1 from inserted_post) then ${POST_MUTATION_STATUS.created}
            when not exists (select 1 from target_tribe) then ${POST_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_channel) then ${POST_MUTATION_STATUS.invalidChannel}
            else ${POST_MUTATION_STATUS.forbidden}
          end as status,
          created_post.post_id,
          created_post.channel_id,
          created_post.channel_name,
          created_post.channel_slug,
          created_post.channel_emoji,
          created_post.channel_sort_order,
          created_post.channel_access_scope,
          created_post.post_title,
          created_post.post_content,
          created_post.post_created_at,
          created_post.author_id,
          created_post.author_name,
          created_post.author_image,
          created_post.author_role
        from (select 1) result
        left join created_post
          on true
      `);

      return mapCreatedPost((result.rows?.[0] ?? null) as CreatedPostRow | null);
    });
  }

  private async createComment(
    command: CreatePostCommentCommand
  ): Promise<PostCommentCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_post as (
          select posts.id, posts.tribe_id
          from public.posts
          inner join public.tribes
            on tribes.id = posts.tribe_id
          where posts.id = ${command.postId}
            and tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        inserted_comment as (
          insert into public.post_comments (post_id, tribe_id, author_id, content, created_at)
          select target_post.id, target_post.tribe_id, ${command.authorId}, ${command.content}, timezone('utc', now())
          from target_post
          where public.is_active_tribe_member(target_post.tribe_id)
          returning id, tribe_id, author_id, content, created_at
        ),
        created_comment as (
          select
            inserted_comment.id as comment_id,
            inserted_comment.content as comment_content,
            inserted_comment.created_at as comment_created_at,
            comment_authors.id as comment_author_id,
            comment_authors.name as comment_author_name,
            comment_authors.image as comment_author_image,
            comment_members.role as comment_author_role
          from inserted_comment
          inner join public."user" comment_authors
            on comment_authors.id = inserted_comment.author_id
          left join public.tribe_members comment_members
            on comment_members.tribe_id = inserted_comment.tribe_id
            and comment_members.user_id = inserted_comment.author_id
        )
        select
          case
            when exists (select 1 from inserted_comment) then ${POST_MUTATION_STATUS.created}
            when not exists (select 1 from target_post) then ${POST_MUTATION_STATUS.notFound}
            else ${POST_MUTATION_STATUS.forbidden}
          end as status,
          created_comment.comment_id,
          created_comment.comment_content,
          created_comment.comment_created_at,
          created_comment.comment_author_id,
          created_comment.comment_author_name,
          created_comment.comment_author_image,
          created_comment.comment_author_role
        from (select 1) result
        left join created_comment
          on true
      `);

      return mapCreatedComment((result.rows?.[0] ?? null) as CreatedCommentRow | null);
    });
  }
}
