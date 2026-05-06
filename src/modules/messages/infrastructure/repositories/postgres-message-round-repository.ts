import { sql } from "drizzle-orm";

import type {
  TribeRoundReplyResult,
  TribeRoundMessageResult,
  TribeRoundResult,
  TribeChannelResult,
  MessageMembershipStatus,
} from "@/src/modules/messages/application/results/tribe-round-result";
import { MESSAGE_MEMBERSHIP_STATUS } from "@/src/modules/messages/constants/message-round";
import type {
  ListTribeRoundQuery,
  MessageRoundReadRepository,
} from "@/src/modules/messages/domain/repositories/message-round-read-repository";
import {
  createTribeRoundAuthor,
  createTribeChannel,
  formatMessageDateTimeValue,
} from "@/src/modules/messages/infrastructure/mappers/tribe-round-view-model-mapper";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type MessageRoundRow = {
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
  reply_author_id: string | null;
  reply_author_image: string | null;
  reply_author_name: string | null;
  reply_author_role: string | null;
  reply_content: string | null;
  reply_created_at: Date | string | null;
  reply_id: string | null;
  like_count: number | string;
  liked_by_viewer: boolean;
  message_content: string | null;
  message_created_at: Date | string | null;
  message_id: string | null;
  message_title: string | null;
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

function normalizeMembershipStatus(status: string | null): MessageMembershipStatus | null {
  if (
    status === MESSAGE_MEMBERSHIP_STATUS.active ||
    status === MESSAGE_MEMBERSHIP_STATUS.muted ||
    status === MESSAGE_MEMBERSHIP_STATUS.blocked
  ) {
    return status;
  }

  return null;
}

function createReply(row: MessageRoundRow): TribeRoundReplyResult | null {
  if (
    !row.reply_id ||
    !row.reply_author_id ||
    !row.reply_content ||
    !row.reply_created_at
  ) {
    return null;
  }

  return {
    author: createTribeRoundAuthor({
      id: row.reply_author_id,
      image: row.reply_author_image,
      name: row.reply_author_name,
      role: row.reply_author_role,
    }),
    content: row.reply_content,
    createdAt: formatMessageDateTimeValue(row.reply_created_at),
    id: row.reply_id,
  };
}

function createPermissions(status: MessageMembershipStatus | null) {
  const canParticipate = status === MESSAGE_MEMBERSHIP_STATUS.active;

  return {
    canReply: canParticipate,
    canCreateMessage: canParticipate,
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

function mapRowsToRound(
  rows: MessageRoundRow[],
  channels: TribeChannelResult[]
): TribeRoundResult {
  const firstRow = rows[0];
  const messagesById = new Map<string, TribeRoundMessageResult>();

  rows.forEach((row) => {
    if (!row.message_id || !row.author_id || !row.message_content || !row.message_created_at) {
      return;
    }

    const existingMessage = messagesById.get(row.message_id);

    if (!existingMessage && row.channel_id) {
      messagesById.set(row.message_id, {
        author: createTribeRoundAuthor({
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
        replies: [],
        content: row.message_content,
        createdAt: formatMessageDateTimeValue(row.message_created_at),
        id: row.message_id,
        likedByViewer: row.liked_by_viewer,
        likeCount: Number(row.like_count),
        title: row.message_title,
      });
    }

    const reply = createReply(row);
    const message = messagesById.get(row.message_id);

    if (reply && message) {
      message.replies.push(reply);
    }
  });

  return {
    activeChannelId: null,
    channels,
    messages: [...messagesById.values()],
    viewerPermissions: createPermissions(
      normalizeMembershipStatus(firstRow?.viewer_membership_status ?? null)
    ),
  };
}

export class PostgresMessageRoundRepository implements MessageRoundReadRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async listByTribeSlug({
    tribeSlug,
    viewerId,
  }: ListTribeRoundQuery): Promise<TribeRoundResult> {
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
        message_like_counts as (
          select
            message_reactions.message_id,
            count(*) as like_count
          from public.message_reactions
          inner join public.messages liked_messages
            on liked_messages.id = message_reactions.message_id
          inner join target_tribe
            on target_tribe.id = liked_messages.tribe_id
          where message_reactions.type = 'like'
          group by message_reactions.message_id
        )
        select
          messages.id as message_id,
          messages.title as message_title,
          messages.content as message_content,
          messages.created_at as message_created_at,
          tribe_channels.id as channel_id,
          tribe_channels.name as channel_name,
          tribe_channels.slug as channel_slug,
          tribe_channels.emoji as channel_emoji,
          tribe_channels.sort_order as channel_sort_order,
          tribe_channels.access_scope as channel_access_scope,
          message_authors.id as author_id,
          message_authors.name as author_name,
          message_authors.image as author_image,
          message_members.role as author_role,
          coalesce(message_like_counts.like_count, 0) as like_count,
          exists (
            select 1
            from public.message_reactions viewer_reactions
            where viewer_reactions.message_id = messages.id
              and viewer_reactions.user_id = ${viewerId}
              and viewer_reactions.type = 'like'
          ) as liked_by_viewer,
          message_replies.id as reply_id,
          message_replies.content as reply_content,
          message_replies.created_at as reply_created_at,
          reply_authors.id as reply_author_id,
          reply_authors.name as reply_author_name,
          reply_authors.image as reply_author_image,
          reply_members.role as reply_author_role,
          viewer_members.status as viewer_membership_status
        from target_tribe
        inner join public.tribe_members viewer_members
          on viewer_members.tribe_id = target_tribe.id
          and viewer_members.user_id = ${viewerId}
        left join public.messages
          on messages.tribe_id = target_tribe.id
          and messages.channel_id is not null
          and exists (
            select 1
            from public.tribe_channels channel_matches
            where channel_matches.id = messages.channel_id
              and channel_matches.tribe_id = target_tribe.id
          )
        left join public.tribe_channels
          on tribe_channels.id = messages.channel_id
        left join public."user" message_authors
          on message_authors.id = messages.author_id
        left join public.tribe_members message_members
          on message_members.tribe_id = messages.tribe_id
          and message_members.user_id = messages.author_id
        left join message_like_counts
          on message_like_counts.message_id = messages.id
        left join public.message_replies
          on message_replies.message_id = messages.id
        left join public."user" reply_authors
          on reply_authors.id = message_replies.author_id
        left join public.tribe_members reply_members
          on reply_members.tribe_id = messages.tribe_id
          and reply_members.user_id = message_replies.author_id
        where viewer_members.status in ('active', 'muted')
        group by
          messages.id,
          tribe_channels.id,
          tribe_channels.name,
          tribe_channels.slug,
          tribe_channels.emoji,
          tribe_channels.sort_order,
          tribe_channels.access_scope,
          message_like_counts.like_count,
          message_authors.id,
          message_members.role,
          message_replies.id,
          reply_authors.id,
          reply_members.role,
          viewer_members.status
        order by messages.created_at desc, message_replies.created_at asc
      `);

      return mapRowsToRound(
        (result.rows ?? []) as MessageRoundRow[],
        mapRowsToChannels((channelsResult.rows ?? []) as TribeChannelRow[])
      );
    });
  }
}
