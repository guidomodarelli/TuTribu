import { sql } from "drizzle-orm";

import type {
  CreateCommunityPostCommand,
  CreatePostCommentCommand,
  TogglePostLikeCommand,
} from "@/src/modules/posts/application/commands/community-post-command";
import type {
  PostCommentCreationResult,
  PostCreationResult,
  PostLikeToggleResult,
} from "@/src/modules/posts/application/results/post-mutation-result";
import { POST_MUTATION_STATUS, POST_REACTION_TYPE } from "@/src/modules/posts/constants/post-feed";
import type { PostCommentRepository } from "@/src/modules/posts/domain/repositories/post-comment-repository";
import type { PostCreationRepository } from "@/src/modules/posts/domain/repositories/post-creation-repository";
import type { PostReactionRepository } from "@/src/modules/posts/domain/repositories/post-reaction-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type MutationStatusRow = {
  status: string | null;
};

function mapCreationStatus(status: string | null): PostCreationResult {
  if (
    status === POST_MUTATION_STATUS.created ||
    status === POST_MUTATION_STATUS.forbidden ||
    status === POST_MUTATION_STATUS.notFound
  ) {
    return { status };
  }

  return {
    status: POST_MUTATION_STATUS.forbidden,
  };
}

export class PostgresPostMutationRepository
  implements PostCreationRepository, PostCommentRepository, PostReactionRepository
{
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async create(command: CreateCommunityPostCommand): Promise<PostCreationResult>;
  async create(command: CreatePostCommentCommand): Promise<PostCommentCreationResult>;
  async create(
    command: CreateCommunityPostCommand | CreatePostCommentCommand
  ): Promise<PostCreationResult | PostCommentCreationResult> {
    if ("postId" in command) {
      return this.createComment(command);
    }

    return this.createPost(command);
  }

  async toggle(command: TogglePostLikeCommand): Promise<PostLikeToggleResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_post as (
          select posts.id, posts.community_id
          from public.posts
          inner join public.communities
            on communities.id = posts.community_id
          where posts.id = ${command.postId}
            and communities.slug = ${command.communitySlug}
          limit 1
        ),
        deleted_reaction as (
          delete from public.post_reactions
          using target_post
          where post_reactions.post_id = target_post.id
            and post_reactions.user_id = ${command.userId}
            and post_reactions.type = ${POST_REACTION_TYPE.like}
          returning post_reactions.id
        ),
        inserted_reaction as (
          insert into public.post_reactions (post_id, community_id, user_id, type)
          select target_post.id, target_post.community_id, ${command.userId}, ${POST_REACTION_TYPE.like}
          from target_post
          where not exists (select 1 from deleted_reaction)
            and public.is_active_community_member(target_post.community_id)
          on conflict (post_id, user_id) do update
            set type = excluded.type
          returning id
        )
        select
          case
            when exists (select 1 from inserted_reaction) then ${POST_MUTATION_STATUS.liked}
            when exists (select 1 from deleted_reaction) then ${POST_MUTATION_STATUS.unliked}
            when not exists (select 1 from target_post) then ${POST_MUTATION_STATUS.notFound}
            else ${POST_MUTATION_STATUS.forbidden}
          end as status
      `);
      const status = ((result.rows?.[0] ?? null) as MutationStatusRow | null)?.status;

      if (status === POST_MUTATION_STATUS.liked) {
        return {
          likedByViewer: true,
          status,
        };
      }

      if (status === POST_MUTATION_STATUS.unliked) {
        return {
          likedByViewer: false,
          status,
        };
      }

      return {
        likedByViewer: false,
        status:
          status === POST_MUTATION_STATUS.notFound
            ? POST_MUTATION_STATUS.notFound
            : POST_MUTATION_STATUS.forbidden,
      };
    });
  }

  private async createPost(
    command: CreateCommunityPostCommand
  ): Promise<PostCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_community as (
          select communities.id
          from public.communities
          where communities.slug = ${command.communitySlug}
          limit 1
        ),
        inserted_post as (
          insert into public.posts (community_id, author_id, title, content, updated_at)
          select target_community.id, ${command.authorId}, ${command.title}, ${command.content}, timezone('utc', now())
          from target_community
          where public.is_active_community_member(target_community.id)
          returning id
        )
        select
          case
            when exists (select 1 from inserted_post) then ${POST_MUTATION_STATUS.created}
            when not exists (select 1 from target_community) then ${POST_MUTATION_STATUS.notFound}
            else ${POST_MUTATION_STATUS.forbidden}
          end as status
      `);

      return mapCreationStatus(
        ((result.rows?.[0] ?? null) as MutationStatusRow | null)?.status ?? null
      );
    });
  }

  private async createComment(
    command: CreatePostCommentCommand
  ): Promise<PostCommentCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_post as (
          select posts.id, posts.community_id
          from public.posts
          inner join public.communities
            on communities.id = posts.community_id
          where posts.id = ${command.postId}
            and communities.slug = ${command.communitySlug}
          limit 1
        ),
        inserted_comment as (
          insert into public.post_comments (post_id, community_id, author_id, content)
          select target_post.id, target_post.community_id, ${command.authorId}, ${command.content}
          from target_post
          where public.is_active_community_member(target_post.community_id)
          returning id
        )
        select
          case
            when exists (select 1 from inserted_comment) then ${POST_MUTATION_STATUS.created}
            when not exists (select 1 from target_post) then ${POST_MUTATION_STATUS.notFound}
            else ${POST_MUTATION_STATUS.forbidden}
          end as status
      `);

      return mapCreationStatus(
        ((result.rows?.[0] ?? null) as MutationStatusRow | null)?.status ?? null
      );
    });
  }
}
