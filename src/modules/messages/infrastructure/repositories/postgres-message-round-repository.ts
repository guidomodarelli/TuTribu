import { sql } from "drizzle-orm";

import type {
  TribeRoundLikersResult,
  TribeRoundRepliesResult,
  TribeRoundResult,
  TribeChannelResult,
  TribeRoundPermissionsResult,
  TribeRoundSharedDataResult,
  TribeRoundSharedMessageResult,
  TribeRoundViewerStateResult,
  MessageMembershipStatus,
  MessageMediaResult,
  MessagePollResult,
  TribeRoundAuthorResult,
} from "@/src/modules/messages/application/results/tribe-round-result";
import {
  VIDEO_PROVIDER,
  type VideoProvider,
} from "@/src/modules/shared/domain/value-objects/video-provider";
import {
  MESSAGE_AUTHOR_ROLE,
  MESSAGE_LIKERS_PREVIEW_LIMIT,
  MESSAGE_MEDIA_KIND,
  MESSAGE_MEMBERSHIP_STATUS,
  MESSAGE_MUTATION_STATUS,
  MESSAGE_POLL_PERCENTAGE_SCALE,
  MESSAGE_REACTION_TYPE,
  TRIBE_ROUND_PAGE_SIZE,
} from "@/src/modules/messages/constants/message-round";
import type {
  ListMessageLikersQuery,
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
  reply_count: number | string;
  reply_authors_preview: ReplyAuthorPreviewRow[] | null;
  message_pinned_at: Date | string | null;
  poll_allow_multiple_votes: boolean | null;
  poll_id: string | null;
  poll_option_id: string | null;
  poll_option_text: string | null;
  poll_option_vote_count: number | string | null;
  poll_total_vote_count: number | string | null;
  message_content: string | null;
  message_created_at: Date | string | null;
  message_id: string | null;
  message_images: MessageImageRow[] | null;
  message_title: string | null;
  message_videos: MessageVideoRow[] | null;
};

export type MessageImageRow = {
  altText?: string | null;
  alt_text?: string | null;
  id: string;
  sort_order?: number | string | null;
  sortOrder?: number | string | null;
  url: string;
};

export type MessageVideoRow = {
  external_video_id?: string | null;
  external_video_provider?: string | null;
  externalId?: string | null;
  id: string;
  provider?: string | null;
  sort_order?: number | string | null;
  sortOrder?: number | string | null;
};

type ReplyAuthorPreviewRow = {
  id?: unknown;
  image?: unknown;
  name?: unknown;
  role?: unknown;
};

function isVideoProvider(value: string | null | undefined): value is VideoProvider {
  return (
    value === VIDEO_PROVIDER.youtube ||
    value === VIDEO_PROVIDER.vimeo ||
    value === VIDEO_PROVIDER.wistia ||
    value === VIDEO_PROVIDER.loom
  );
}

/**
 * Sorts message media by its global slot so images and external videos render
 * in the exact order the author arranged them.
 *
 * @param media - Unsorted media items.
 * @returns A new array sorted ascending by `sortOrder`.
 */
export function sortMessageMediaBySortOrder(
  media: MessageMediaResult[]
): MessageMediaResult[] {
  return [...media].sort((first, second) => first.sortOrder - second.sortOrder);
}

/**
 * Merges persisted image and video rows into the unified, ordered media list
 * consumed by the round view model.
 *
 * @param imageRows - Attached image rows (with their global `sort_order`).
 * @param videoRows - Attached external video rows (with their global `sort_order`).
 * @returns Media items sorted by their shared global slot.
 */
export function createMessageMediaFromRows(
  imageRows: MessageImageRow[] | null | undefined,
  videoRows: MessageVideoRow[] | null | undefined
): MessageMediaResult[] {
  const imageMedia: MessageMediaResult[] = (imageRows ?? []).map((row) => ({
    altText: row.altText ?? row.alt_text ?? "",
    id: row.id,
    kind: MESSAGE_MEDIA_KIND.image,
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    url: row.url,
  }));

  const videoMedia: MessageMediaResult[] = (videoRows ?? []).flatMap((row) => {
    const provider = row.provider ?? row.external_video_provider;
    const externalId = row.externalId ?? row.external_video_id;

    if (!isVideoProvider(provider) || !externalId) {
      return [];
    }

    return [
      {
        externalId,
        id: row.id,
        kind: MESSAGE_MEDIA_KIND.video,
        provider,
        sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
      },
    ];
  });

  return sortMessageMediaBySortOrder([...imageMedia, ...videoMedia]);
}

function createReplyAuthorsPreviewFromRows(
  rows: ReplyAuthorPreviewRow[] | null | undefined
): TribeRoundAuthorResult[] {
  return (rows ?? [])
    .flatMap((row) => {
      if (typeof row.id !== "string") {
        return [];
      }

      return [
        createTribeRoundAuthor({
          id: row.id,
          image: typeof row.image === "string" ? row.image : null,
          name: typeof row.name === "string" ? row.name : null,
          role: typeof row.role === "string" ? row.role : null,
        }),
      ];
    });
}

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
  selected_poll_option_ids: string[] | null;
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

type MessageLikerRow = {
  liker_created_at: Date | string | null;
  liker_id: string | null;
  liker_image: string | null;
  liker_name: string | null;
  liker_role: string | null;
  liker_total_count: number | string | null;
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

function createPermissions({
  role,
  status,
}: {
  role: string | null;
  status: MessageMembershipStatus | null;
}): TribeRoundPermissionsResult {
  const canParticipate = status === MESSAGE_MEMBERSHIP_STATUS.active;

  return {
    canReply: canParticipate,
    canCreateMessage: canParticipate,
    canEditMessageCreatedAt: canViewerEditMessageCreatedAt({
      role,
      status,
    }),
    canPinMessages: canViewerPinMessages({
      role,
      status,
    }),
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

function canViewerEditMessageCreatedAt({
  role,
  status,
}: {
  role: string | null;
  status: MessageMembershipStatus | null;
}): boolean {
  return (
    status === MESSAGE_MEMBERSHIP_STATUS.active &&
    role === MESSAGE_AUTHOR_ROLE.leader
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
  const selectedPollOptionIds = new Set(viewerState.selectedPollOptionIds);
  const canManageOwnMessages = Boolean(
    viewerState.viewerPermissions.canCreateMessage
  );
  const canDeleteStaffMessages = Boolean(
    viewerState.viewerPermissions.canPinMessages
  );

  return {
    activeChannelId: sharedData.activeChannelId,
    channels: sharedData.channels,
    messages: sharedData.messages.map((message) => {
      const poll = message.poll
        ? {
            ...message.poll,
            options: message.poll.options.map((option) => ({
              ...option,
              selectedByViewer: selectedPollOptionIds.has(option.id),
            })),
          }
        : null;
      const isViewerAuthor = message.author.id === viewerState.viewerId;

      return {
        ...message,
        hasLoadedReplies: (message.replyCount ?? 0) === 0,
        likedByViewer: likedMessageIds.has(message.id),
        permissions: {
          canDelete:
            (isViewerAuthor && canManageOwnMessages) || canDeleteStaffMessages,
          canEdit: isViewerAuthor && canManageOwnMessages,
        },
        poll: poll
          ? {
              ...poll,
              viewerHasVoted: poll.options.some((option) => option.selectedByViewer),
            }
          : null,
        replies: [],
      };
    }),
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
      const poll = createMessagePollFromRow(row);

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
        media: createMessageMediaFromRows(row.message_images, row.message_videos),
        pinnedAt: row.message_pinned_at
          ? formatMessageDateTimeValue(row.message_pinned_at)
          : null,
        poll,
        replyAuthorsPreview: createReplyAuthorsPreviewFromRows(
          row.reply_authors_preview
        ),
        replyCount: Number(row.reply_count),
        title: row.message_title,
      });
    } else if (existingMessage?.poll && row.poll_option_id && row.poll_option_text) {
      existingMessage.poll.options.push(
        createMessagePollOptionFromRow(row, existingMessage.poll.totalVoteCount)
      );
    }
  });

  return {
    activeChannelId,
    channels,
    messages: [...messagesById.values()],
    pagination,
  };
}

function limitRowsToPageMessages(rows: MessageRoundSharedRow[]): MessageRoundSharedRow[] {
  const visibleMessageIds = new Set<string>();

  return rows.filter((row) => {
    if (!row.message_id) {
      return true;
    }

    if (!visibleMessageIds.has(row.message_id)) {
      if (visibleMessageIds.size >= TRIBE_ROUND_PAGE_SIZE) {
        return false;
      }

      visibleMessageIds.add(row.message_id);
    }

    return true;
  });
}

function hasMoreMessagesThanPage(rows: MessageRoundSharedRow[]): boolean {
  const messageIds = new Set(
    rows.flatMap((row) => (row.message_id ? [row.message_id] : []))
  );

  return messageIds.size > TRIBE_ROUND_PAGE_SIZE;
}

function createMessagePollOptionFromRow(
  row: MessageRoundSharedRow,
  totalVoteCount: number
): MessagePollResult["options"][number] {
  const voteCount = Number(row.poll_option_vote_count ?? 0);

  return {
    id: row.poll_option_id ?? "",
    percentage:
      totalVoteCount > 0
        ? Math.round((voteCount / totalVoteCount) * MESSAGE_POLL_PERCENTAGE_SCALE)
        : 0,
    selectedByViewer: false,
    text: row.poll_option_text ?? "",
    voteCount,
  };
}

function createMessagePollFromRow(row: MessageRoundSharedRow): MessagePollResult | null {
  if (!row.poll_id) {
    return null;
  }

  const totalVoteCount = Number(row.poll_total_vote_count ?? 0);
  const poll: MessagePollResult = {
    allowMultipleVotes: Boolean(row.poll_allow_multiple_votes),
    id: row.poll_id,
    options: [],
    totalVoteCount,
    viewerHasVoted: false,
  };

  if (row.poll_option_id && row.poll_option_text) {
    poll.options.push(createMessagePollOptionFromRow(row, totalVoteCount));
  }

  return poll;
}

function mapViewerStateRow(
  row: MessageRoundViewerStateRow | null,
  viewerId: string
): TribeRoundViewerStateResult {
  const membershipStatus = normalizeMembershipStatus(
    row?.viewer_membership_status ?? null
  );

  return {
    likedMessageIds: row?.liked_message_ids ?? [],
    selectedPollOptionIds: row?.selected_poll_option_ids ?? [],
    viewerId,
    viewerPermissions: createPermissions({
      role: row?.viewer_membership_role ?? null,
      status: membershipStatus,
    }),
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

export function mapRowsToLikers(rows: MessageLikerRow[]): TribeRoundLikersResult {
  const status = rows[0]?.status_result;

  if (status === MESSAGE_MUTATION_STATUS.notFound) {
    return { status: MESSAGE_MUTATION_STATUS.notFound };
  }

  if (status === MESSAGE_MUTATION_STATUS.forbidden || !status) {
    return { status: MESSAGE_MUTATION_STATUS.forbidden };
  }

  return {
    status: "found",
    totalCount: Number(rows[0]?.liker_total_count ?? 0),
    likers: rows.flatMap((row) => {
      if (!row.liker_id) {
        return [];
      }

      return [
        createTribeRoundAuthor({
          id: row.liker_id,
          image: row.liker_image,
          name: row.liker_name,
          role: row.liker_role,
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
          ),
          poll_option_counts as (
            select
              message_poll_options.id as option_id,
              count(message_poll_votes.id) as vote_count
            from public.message_poll_options
            inner join public.message_polls
              on message_polls.id = message_poll_options.poll_id
            inner join target_tribe
              on target_tribe.id = message_polls.tribe_id
            left join public.message_poll_votes
              on message_poll_votes.option_id = message_poll_options.id
            group by message_poll_options.id
          ),
          poll_total_counts as (
            select
              message_polls.id as poll_id,
              count(message_poll_votes.id) as total_vote_count
            from public.message_polls
            inner join target_tribe
              on target_tribe.id = message_polls.tribe_id
            left join public.message_poll_votes
              on message_poll_votes.poll_id = message_polls.id
            group by message_polls.id
          ),
          filtered_messages as (
            select
              messages.id,
              messages.title,
              messages.content,
              messages.created_at,
              messages.channel_id,
              messages.author_id,
              messages.tribe_id,
              coalesce(message_images.message_images, '[]'::jsonb) as message_images,
              coalesce(message_videos.message_videos, '[]'::jsonb) as message_videos,
              coalesce(message_like_counts.like_count, 0) as like_count,
              message_pins.pinned_at as pinned_at
            from public.messages
            inner join target_tribe
              on target_tribe.id = messages.tribe_id
            left join message_like_counts
              on message_like_counts.message_id = messages.id
            left join public.message_pins
              on message_pins.message_id = messages.id
            left join lateral (
              select jsonb_agg(
                jsonb_build_object(
                  'alt_text', image_assets.alt_text,
                  'id', image_assets.id,
                  'sort_order', image_assets.sort_order,
                  'url', image_assets.delivery_url
                )
                order by image_assets.sort_order asc, image_assets.created_at asc
              ) as message_images
              from public.message_images image_assets
              where image_assets.message_id = messages.id
                and image_assets.status = 'attached'
            ) message_images on true
            left join lateral (
              select jsonb_agg(
                jsonb_build_object(
                  'external_video_id', video_assets.external_video_id,
                  'external_video_provider', video_assets.external_video_provider,
                  'id', video_assets.id,
                  'sort_order', video_assets.sort_order
                )
                order by video_assets.sort_order asc, video_assets.created_at asc
              ) as message_videos
              from public.message_videos video_assets
              where video_assets.message_id = messages.id
            ) message_videos on true
            where messages.channel_id is not null
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
            order by message_pins.pinned_at desc nulls last, messages.created_at desc, messages.id desc
            limit ${messageLimit}
            offset ${messageOffset}
          )
          select
            messages.id as message_id,
            messages.title as message_title,
            messages.content as message_content,
            messages.created_at as message_created_at,
            messages.message_images as message_images,
            messages.message_videos as message_videos,
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
            messages.like_count as like_count,
            coalesce(message_reply_counts.reply_count, 0) as reply_count,
            coalesce(
              message_reply_counts.reply_authors_preview,
              '[]'::jsonb
            ) as reply_authors_preview,
            messages.pinned_at as message_pinned_at,
            message_polls.id as poll_id,
            message_polls.allow_multiple_votes as poll_allow_multiple_votes,
            message_poll_options.id as poll_option_id,
            message_poll_options.text as poll_option_text,
            coalesce(poll_option_counts.vote_count, 0) as poll_option_vote_count,
            coalesce(poll_total_counts.total_vote_count, 0) as poll_total_vote_count
          from filtered_messages messages
          inner join public.tribe_channels
            on tribe_channels.id = messages.channel_id
          inner join public."user" message_authors
            on message_authors.id = messages.author_id
          left join public.tribe_members message_members
            on message_members.tribe_id = messages.tribe_id
            and message_members.user_id = messages.author_id
          left join lateral (
            select
              coalesce(sum(reply_author_previews.reply_count), 0) as reply_count,
              coalesce(
                jsonb_agg(
                    jsonb_build_object(
                      'id', reply_author_previews.id,
                      'image', reply_author_previews.image,
                      'name', reply_author_previews.name,
                      'role', reply_author_previews.role
                    )
                    order by reply_author_previews.latest_reply_created_at desc
                  ) filter (where reply_author_previews.author_rank <= 3),
                '[]'::jsonb
              ) as reply_authors_preview
            from (
              select
                reply_authors.id,
                reply_authors.image,
                reply_authors.name,
                reply_members.role,
                count(*) as reply_count,
                max(message_replies.created_at) as latest_reply_created_at,
                row_number() over (
                  order by max(message_replies.created_at) desc
                ) as author_rank
              from public.message_replies
              inner join public."user" reply_authors
                on reply_authors.id = message_replies.author_id
              left join public.tribe_members reply_members
                on reply_members.tribe_id = messages.tribe_id
                and reply_members.user_id = message_replies.author_id
              where message_replies.message_id = messages.id
              group by
                reply_authors.id,
                reply_authors.image,
                reply_authors.name,
                reply_members.role
            ) reply_author_previews
          ) message_reply_counts on true
          left join public.message_polls
            on message_polls.message_id = messages.id
          left join public.message_poll_options
            on message_poll_options.poll_id = message_polls.id
          left join poll_option_counts
            on poll_option_counts.option_id = message_poll_options.id
          left join poll_total_counts
            on poll_total_counts.poll_id = message_polls.id
          group by
            messages.id,
            messages.title,
            messages.content,
            messages.created_at,
            messages.message_images,
            messages.message_videos,
            messages.channel_id,
            messages.author_id,
            messages.tribe_id,
            tribe_channels.id,
            tribe_channels.name,
            tribe_channels.slug,
            tribe_channels.emoji,
            tribe_channels.sort_order,
            tribe_channels.access_scope,
            messages.like_count,
            messages.pinned_at,
            message_reply_counts.reply_count,
            message_reply_counts.reply_authors_preview,
            message_polls.id,
            message_poll_options.id,
            poll_option_counts.vote_count,
            poll_total_counts.total_vote_count,
            message_authors.id,
            message_members.role
          order by messages.pinned_at desc nulls last, messages.created_at desc, messages.id desc, message_poll_options.sort_order asc
        `);
      const resultRows = (result.rows ?? []) as MessageRoundSharedRow[];
      const rows = limitRowsToPageMessages(resultRows);

      return mapRowsToSharedData(
        rows,
        channels,
        {
          currentPage,
          hasNextPage: hasMoreMessagesThanPage(resultRows),
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

  async listLikersByMessageId({
    messageId,
    tribeSlug,
    viewerId,
  }: ListMessageLikersQuery): Promise<TribeRoundLikersResult> {
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
        total_count as (
          select count(*)::int as liker_total_count
          from visible_message
          inner join public.message_reactions
            on message_reactions.message_id = visible_message.id
            and message_reactions.type = ${MESSAGE_REACTION_TYPE.like}
        ),
        liker_rows as (
          select
            liker_users.id as liker_id,
            liker_users.name as liker_name,
            liker_users.image as liker_image,
            liker_members.role as liker_role,
            message_reactions.created_at as liker_created_at
          from visible_message
          inner join public.message_reactions
            on message_reactions.message_id = visible_message.id
            and message_reactions.type = ${MESSAGE_REACTION_TYPE.like}
          inner join public."user" liker_users
            on liker_users.id = message_reactions.user_id
          left join public.tribe_members liker_members
            on liker_members.tribe_id = visible_message.tribe_id
            and liker_members.user_id = message_reactions.user_id
          order by message_reactions.created_at asc
          limit ${MESSAGE_LIKERS_PREVIEW_LIMIT}
        )
        select
          case
            when not exists (select 1 from target_message) then ${MESSAGE_MUTATION_STATUS.notFound}
            when not exists (select 1 from visible_message) then ${MESSAGE_MUTATION_STATUS.forbidden}
            else 'found'
          end as status_result,
          (select liker_total_count from total_count) as liker_total_count,
          liker_rows.liker_id,
          liker_rows.liker_name,
          liker_rows.liker_image,
          liker_rows.liker_role,
          liker_rows.liker_created_at
        from (select 1) status_anchor
        left join liker_rows
          on true
      `);

      return mapRowsToLikers((result.rows ?? []) as MessageLikerRow[]);
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
        ),
        selected_poll_options as (
          select message_poll_votes.option_id::text as option_id
          from public.message_poll_votes
          inner join public.message_polls
            on message_polls.id = message_poll_votes.poll_id
          inner join target_tribe
            on target_tribe.id = message_polls.tribe_id
          where message_poll_votes.user_id = ${viewerId}
        ),
        liked_message_state as (
          select coalesce(array_agg(liked_messages.message_id), array[]::text[]) as liked_message_ids
          from liked_messages
        ),
        selected_poll_option_state as (
          select coalesce(array_agg(selected_poll_options.option_id), array[]::text[]) as selected_poll_option_ids
          from selected_poll_options
        )
        select
          viewer_membership.status as viewer_membership_status,
          viewer_membership.role as viewer_membership_role,
          liked_message_state.liked_message_ids,
          selected_poll_option_state.selected_poll_option_ids
        from viewer_membership
        cross join liked_message_state
        cross join selected_poll_option_state
      `);

      return mapViewerStateRow(
        (result.rows?.[0] ?? null) as MessageRoundViewerStateRow | null,
        viewerId
      );
    });
  }
}
