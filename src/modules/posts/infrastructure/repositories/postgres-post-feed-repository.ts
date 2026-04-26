import { sql } from "drizzle-orm";

import type {
  CommunityFeedAuthorResult,
  CommunityFeedCommentResult,
  CommunityFeedPostResult,
  CommunityFeedResult,
  PostAuthorRole,
  PostMembershipStatus,
} from "@/src/modules/posts/application/results/community-feed-result";
import { POST_AUTHOR_ROLE, POST_MEMBERSHIP_STATUS } from "@/src/modules/posts/constants/post-feed";
import type {
  ListCommunityFeedQuery,
  PostFeedReadRepository,
} from "@/src/modules/posts/domain/repositories/post-feed-read-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type PostFeedRow = {
  author_id: string | null;
  author_image: string | null;
  author_name: string | null;
  author_role: string | null;
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
  viewer_membership_status: string | null;
};

const POST_FEED_DEFAULTS = {
  authorFallbackPartCount: 2,
  unknownAuthorFallback: "??",
  unknownAuthorName: "Miembro",
} as const;

function formatDateTime(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function createAvatarFallback(name: string): string {
  const fallback = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, POST_FEED_DEFAULTS.authorFallbackPartCount)
    .map((namePart) => namePart.charAt(0).toUpperCase())
    .join("");

  return fallback || POST_FEED_DEFAULTS.unknownAuthorFallback;
}

function normalizeAuthorRole(role: string | null): PostAuthorRole {
  if (
    role === POST_AUTHOR_ROLE.owner ||
    role === POST_AUTHOR_ROLE.admin ||
    role === POST_AUTHOR_ROLE.member
  ) {
    return role;
  }

  return POST_AUTHOR_ROLE.member;
}

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

function createAuthor({
  id,
  image,
  name,
  role,
}: {
  id: string;
  image: string | null;
  name: string | null;
  role: string | null;
}): CommunityFeedAuthorResult {
  const safeName = name || POST_FEED_DEFAULTS.unknownAuthorName;

  return {
    avatarFallback: createAvatarFallback(safeName),
    id,
    image,
    name: safeName,
    role: normalizeAuthorRole(role),
  };
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
    author: createAuthor({
      id: row.comment_author_id,
      image: row.comment_author_image,
      name: row.comment_author_name,
      role: row.comment_author_role,
    }),
    content: row.comment_content,
    createdAt: formatDateTime(row.comment_created_at),
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

function mapRowsToFeed(rows: PostFeedRow[]): CommunityFeedResult {
  const firstRow = rows[0];
  const postsById = new Map<string, CommunityFeedPostResult>();

  rows.forEach((row) => {
    if (!row.post_id || !row.author_id || !row.post_content || !row.post_created_at) {
      return;
    }

    const existingPost = postsById.get(row.post_id);

    if (!existingPost) {
      postsById.set(row.post_id, {
        author: createAuthor({
          id: row.author_id,
          image: row.author_image,
          name: row.author_name,
          role: row.author_role,
        }),
        comments: [],
        content: row.post_content,
        createdAt: formatDateTime(row.post_created_at),
        id: row.post_id,
        likedByViewer: row.liked_by_viewer,
        likeCount: Number(row.like_count),
      });
    }

    const comment = createComment(row);
    const post = postsById.get(row.post_id);

    if (comment && post) {
      post.comments.push(comment);
    }
  });

  return {
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
      const result = await database.execute(sql`
        select
          posts.id as post_id,
          posts.content as post_content,
          posts.created_at as post_created_at,
          post_authors.id as author_id,
          post_authors.name as author_name,
          post_authors.image as author_image,
          post_members.role as author_role,
          count(post_reactions.id) filter (where post_reactions.type = 'like') as like_count,
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
        from public.communities
        inner join public.community_members viewer_members
          on viewer_members.community_id = communities.id
          and viewer_members.user_id = ${viewerId}
        left join public.posts
          on posts.community_id = communities.id
        left join public."user" post_authors
          on post_authors.id = posts.author_id
        left join public.community_members post_members
          on post_members.community_id = posts.community_id
          and post_members.user_id = posts.author_id
        left join public.post_reactions
          on post_reactions.post_id = posts.id
          and post_reactions.type = 'like'
        left join public.post_comments
          on post_comments.post_id = posts.id
        left join public."user" comment_authors
          on comment_authors.id = post_comments.author_id
        left join public.community_members comment_members
          on comment_members.community_id = posts.community_id
          and comment_members.user_id = post_comments.author_id
        where communities.slug = ${communitySlug}
          and viewer_members.status in ('active', 'muted')
        group by
          posts.id,
          post_authors.id,
          post_members.role,
          post_comments.id,
          comment_authors.id,
          comment_members.role,
          viewer_members.status
        order by posts.created_at desc, post_comments.created_at asc
      `);

      return mapRowsToFeed((result.rows ?? []) as PostFeedRow[]);
    });
  }
}
