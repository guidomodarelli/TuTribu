import { sql } from "drizzle-orm";

import type {
  TribeRoundRepliesResult,
  TribeRoundResult,
  TribeChannelResult,
  TribeRoundPermissionsResult,
  TribeRoundSharedDataResult,
  TribeRoundSharedMessageResult,
  TribeRoundViewerStateResult,
  MessageMembershipStatus,
} from "@/src/modules/messages/application/results/tribe-round-result";
import {
  MESSAGE_AUTHOR_ROLE,
  MESSAGE_MEMBERSHIP_STATUS,
  MESSAGE_MUTATION_STATUS,
  TRIBE_ROUND_PAGE_SIZE,
} from "@/src/modules/messages/constants/message-round";
import type {
  ListMessageRepliesQuery,
  ListTribeRoundQuery,
  MessageRoundReadRepository,
} from "@/src/modules/messages/domain/repositories/message-round-read-repository";
import {
  createTribeRoundAuthor,
  createTribeRoundReply,
  createTribeChannel,
  formatMessageDateTimeValue,
} from "@/src/modules/messages/infrastructure/mappers/tribe-round-view-model-mapper";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type MessageRoundSharedRow = {
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
  like_count: number | string;
  message_pinned_at: Date | string | null;
  message_content: string | null;
  message_created_at: Date | string | null;
  message_id: string | null;
  message_title: string | null;
};

type TribeChannelRow = {
  access_scope: string | null;
  emoji: string | null;
  id: string;
  name: string | null;
  slug: string | null;
  sort_order: number | string | null;
};

type MessageRoundViewerStateRow = {
  liked_message_ids: string[] | null;
  viewer_membership_status: string | null;
  viewer_membership_role: string | null;
};

type MessageReplyRow = {
  reply_author_id: string | null;
  reply_author_image: string | null;
  reply_author_name: string | null;
  reply_author_role: string | null;
  reply_content: string | null;
  reply_created_at: Date | string | null;
  reply_id: string | null;
  status_result: string;
};

function normalizeMembershipStatus(
  status: string | null
): MessageMembershipStatus | null {
  if (
    status === MESSAGE_MEMBERSHIP_STATUS.active ||
    status === MESSAGE_MEMBERSHIP_STATUS.muted ||
    status === MESSAGE_MEMBERSHIP_STATUS.blocked
  ) {
    return status;
  }

  return null;
}

function createPermissions(
  status: MessageMembershipStatus | null
): TribeRoundPermissionsResult {
  const canParticipate = status === MESSAGE_MEMBERSHIP_STATUS.active;

  return {
    canReply: canParticipate,
    canCreateMessage: canParticipate,
    canPinMessages: false,
    canReact: canParticipate,
  };
}

function canViewerPinMessages({
  role,
  status,
}: {
  role: string | null;
  status: MessageMembershipStatus | null;
}): boolean {
  return (
    status === MESSAGE_MEMBERSHIP_STATUS.active &&
    (role === MESSAGE_AUTHOR_ROLE.leader ||
      role === MESSAGE_AUTHOR_ROLE.guardian)
  );
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
  sharedData: TribeRoundSharedDataResult,
  viewerState: TribeRoundViewerStateResult
): TribeRoundResult {
  const likedMessageIds = new Set(viewerState.likedMessageIds);

  return {
    activeChannelId: sharedData.activeChannelId,
    channels: sharedData.channels,
    messages: sharedData.messages.map((message) => ({
      ...message,
      hasLoadedReplies: false,
      likedByViewer: likedMessageIds.has(message.id),
      replies: [],
    })),
    pagination: sharedData.pagination,
    viewerPermissions: viewerState.viewerPermissions,
  };
}

function mapRowsToSharedData(
  rows: MessageRoundSharedRow[],
  channels: TribeChannelResult[],
  pagination: {
    currentPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    pageSize: number;
  },
  activeChannelId: string | null
): TribeRoundSharedDataResult {
  const messagesById = new Map<string, TribeRoundSharedMessageResult>();

  rows.forEach((row) => {
    if (
      !row.message_id ||
      !row.author_id ||
      !row.message_content ||
      !row.message_created_at
    ) {
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
        content: row.message_content,
        createdAt: formatMessageDateTimeValue(row.message_created_at),
        id: row.message_id,
        isPinned: Boolean(row.message_pinned_at),
        likeCount: Number(row.like_count),
        pinnedAt: row.message_pinned_at
          ? formatMessageDateTimeValue(row.message_pinned_at)
          : null,
        title: row.message_title,
      });
    }
  });

  return {
    activeChannelId,
    channels,
    messages: [...messagesById.values()],
    pagination,
  };
}

function mapViewerStateRow(
  row: MessageRoundViewerStateRow | null
): TribeRoundViewerStateResult {
  const membershipStatus = normalizeMembershipStatus(
    row?.viewer_membership_status ?? null
  );

  return {
    likedMessageIds: row?.liked_message_ids ?? [],
    viewerPermissions: {
      ...createPermissions(membershipStatus),
      canPinMessages: canViewerPinMessages({
        role: row?.viewer_membership_role ?? null,
        status: membershipStatus,
      }),
    },
  };
}

function normalizePage(page: number | undefined): number {
  if (!Number.isInteger(page) || !page || page < 1) {
    return 1;
  }

  return page;
}

function normalizeChannelSlug(channelSlug: string | null | undefined): string | null {
  const normalizedChannelSlug = channelSlug?.trim() ?? "";

  return normalizedChannelSlug.length > 0 ? normalizedChannelSlug : null;
}

function mapRowsToReplies(rows: MessageReplyRow[]): TribeRoundRepliesResult {
  const status = rows[0]?.status_result;

  if (status === MESSAGE_MUTATION_STATUS.notFound) {
    return { status: MESSAGE_MUTATION_STATUS.notFound };
  }

  if (status === MESSAGE_MUTATION_STATUS.forbidden || !status) {
    return { status: MESSAGE_MUTATION_STATUS.forbidden };
  }

  return {
    status: "found",
    replies: rows.flatMap((row) => {
      if (
        !row.reply_id ||
        !row.reply_author_id ||
        !row.reply_content ||
        !row.reply_created_at
      ) {
        return [];
      }

      return [
        createTribeRoundReply({
          id: row.reply_id,
          author: {
            id: row.reply_author_id,
            image: row.reply_author_image,
            name: row.reply_author_name,
            role: row.reply_author_role,
          },
          content: row.reply_content,
          createdAt: row.reply_created_at,
        }),
      ];
    }),
  };
}

export class PostgresMessageRoundRepository implements MessageRoundReadRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async listByTribeSlug({
    channelSlug,
    page,
    tribeSlug,
    viewerId,
  }: ListTribeRoundQuery): Promise<TribeRoundResult> {
    const sharedData = await this.listSharedDataByTribeSlug({
      channelSlug,
      page,
      tribeSlug,
      viewerId,
    });
    const viewerState = await this.listViewerStateByTribeSlug({
      channelSlug,
      page,
      tribeSlug,
      viewerId,
    });

    return mapRowsToRound(sharedData, viewerState);
  }

  async listSharedDataByTribeSlug({
    channelSlug,
    page,
    tribeSlug,
  }: ListTribeRoundQuery): Promise<TribeRoundSharedDataResult> {
    return this.executeWithDatabase(async (database) => {
      const currentPage = normalizePage(page);
      const messageOffset = (currentPage - 1) * TRIBE_ROUND_PAGE_SIZE;
      const messageLimit = TRIBE_ROUND_PAGE_SIZE + 1;
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
      const channels = mapRowsToChannels((channelsResult.rows ?? []) as TribeChannelRow[]);
      const selectedChannelSlug = normalizeChannelSlug(channelSlug);
      const activeChannel =
        channels.find((channel) => channel.slug === selectedChannelSlug) ?? null;
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
            message_pins.pinned_at as message_pinned_at
          from target_tribe
          left join public.messages
            on messages.tribe_id = target_tribe.id
            and messages.channel_id is not null
            and (
              ${activeChannel?.slug ?? null}::text is null
              or exists (
                select 1
                from public.tribe_channels selected_channel
                where selected_channel.id = messages.channel_id
                  and selected_channel.tribe_id = target_tribe.id
                  and selected_channel.slug = ${activeChannel?.slug ?? null}
              )
            )
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
          left join public.message_pins
            on message_pins.message_id = messages.id
          group by
            messages.id,
            tribe_channels.id,
            tribe_channels.name,
            tribe_channels.slug,
            tribe_channels.emoji,
            tribe_channels.sort_order,
            tribe_channels.access_scope,
            message_like_counts.like_count,
            message_pins.pinned_at,
            message_authors.id,
            message_members.role
          order by message_pins.pinned_at desc nulls last, messages.created_at desc, messages.id desc
          limit ${messageLimit}
          offset ${messageOffset}
        `);
      const rows = ((result.rows ?? []) as MessageRoundSharedRow[]).slice(
        0,
        TRIBE_ROUND_PAGE_SIZE
      );

      return mapRowsToSharedData(
        rows,
        channels,
        {
          currentPage,
          hasNextPage: (result.rows ?? []).length > TRIBE_ROUND_PAGE_SIZE,
          hasPreviousPage: currentPage > 1,
          pageSize: TRIBE_ROUND_PAGE_SIZE,
        },
        activeChannel?.id ?? null
      );
    });
  }

  async listRepliesByMessageId({
    messageId,
    tribeSlug,
    viewerId,
  }: ListMessageRepliesQuery): Promise<TribeRoundRepliesResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        ),
        viewer_membership as (
          select 1
          from public.tribe_members
          inner join target_tribe
            on target_tribe.id = tribe_members.tribe_id
          where tribe_members.user_id = ${viewerId}
            and tribe_members.status in ('active', 'muted')
          limit 1
        ),
        target_message as (
          select messages.id, messages.tribe_id
          from public.messages
          inner join target_tribe
            on target_tribe.id = messages.tribe_id
          where messages.id = ${messageId}
          limit 1
        ),
        visible_message as (
          select target_message.id, target_message.tribe_id
          from target_message
          where exists (select 1 from viewer_membership)
        ),
        reply_rows as (
          select
            message_replies.id as reply_id,
            message_replies.content as reply_content,
            message_replies.created_at as reply_created_at,
            reply_authors.id as reply_author_id,
            reply_authors.name as reply_author_name,
            reply_authors.image as reply_author_image,
            reply_members.role as reply_author_role
          from visible_message
          inner join public.message_replies
            on message_replies.message_id = visible_message.id
          inner join public."user" reply_authors
            on reply_authors.id = message_replies.author_id
          left join public.tribe_members reply_members
            on reply_members.tribe_id = visible_message.tribe_id
            and reply_members.user_id = message_replies.author_id
          order by message_replies.created_at asc
        )
        select
          case
            when not exists (select 1 from target_message) then ${MESSAGE_MUTATION_STATUS.notFound}
            when not exists (select 1 from visible_message) then ${MESSAGE_MUTATION_STATUS.forbidden}
            else 'found'
          end as status_result,
          reply_rows.reply_id,
          reply_rows.reply_content,
          reply_rows.reply_created_at,
          reply_rows.reply_author_id,
          reply_rows.reply_author_name,
          reply_rows.reply_author_image,
          reply_rows.reply_author_role
        from (select 1) status_anchor
        left join reply_rows
          on true
      `);

      return mapRowsToReplies((result.rows ?? []) as MessageReplyRow[]);
    });
  }

  async listViewerStateByTribeSlug({
    tribeSlug,
    viewerId,
  }: ListTribeRoundQuery): Promise<TribeRoundViewerStateResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        ),
        viewer_membership as (
          select tribe_members.status, tribe_members.role
          from public.tribe_members
          inner join target_tribe
            on target_tribe.id = tribe_members.tribe_id
          where tribe_members.user_id = ${viewerId}
            and tribe_members.status in ('active', 'muted')
          limit 1
        ),
        liked_messages as (
          select message_reactions.message_id::text as message_id
          from public.message_reactions
          inner join public.messages
            on messages.id = message_reactions.message_id
          inner join target_tribe
            on target_tribe.id = messages.tribe_id
          where message_reactions.user_id = ${viewerId}
            and message_reactions.type = 'like'
        )
        select
          viewer_membership.status as viewer_membership_status,
          viewer_membership.role as viewer_membership_role,
          coalesce(
            array_agg(liked_messages.message_id)
              filter (where liked_messages.message_id is not null),
            array[]::text[]
          ) as liked_message_ids
        from viewer_membership
        left join liked_messages
          on true
        group by viewer_membership.status, viewer_membership.role
      `);

      return mapViewerStateRow(
        (result.rows?.[0] ?? null) as MessageRoundViewerStateRow | null
      );
    });
  }
}
