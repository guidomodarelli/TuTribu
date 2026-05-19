import type {
  TribeRoundRepliesResult,
  TribeRoundResult,
  TribeChannelResult,
  TribeRoundPermissionsResult,
  TribeRoundSharedDataResult,
  TribeRoundSharedMessageResult,
  TribeRoundViewerStateResult,
  MessageMembershipStatus,
  MessagePollResult,
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
  like_count: bigint | number | string | null;
  message_pinned_at: Date | string | null;
  poll_allow_multiple_votes: boolean | null;
  poll_id: string | null;
  poll_option_id: string | null;
  poll_option_text: string | null;
  poll_option_vote_count: bigint | number | string | null;
  poll_question: string | null;
  poll_total_vote_count: bigint | number | string | null;
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

type TargetTribeRow = {
  id: string;
};

type MessageBaseRow = {
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
  like_count: bigint | number | string | null;
  message_content: string | null;
  message_created_at: Date | string | null;
  message_id: string | null;
  message_pinned_at: Date | string | null;
  message_title: string | null;
}

type PollOptionRow = {
  poll_allow_multiple_votes: boolean | null;
  poll_id: string | null;
  poll_option_id: string | null;
  poll_option_text: string | null;
  poll_option_vote_count: bigint | number | string | null;
  poll_question: string | null;
  poll_total_vote_count: bigint | number | string | null;
  message_id: string | null;
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
  const selectedPollOptionIds = new Set(viewerState.selectedPollOptionIds);
  const canDeleteOwnMessages = Boolean(
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

      return {
        ...message,
        hasLoadedReplies: false,
        likedByViewer: likedMessageIds.has(message.id),
        permissions: {
          canDelete:
            (message.author.id === viewerState.viewerId && canDeleteOwnMessages) ||
            canDeleteStaffMessages,
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
        pinnedAt: row.message_pinned_at
          ? formatMessageDateTimeValue(row.message_pinned_at)
          : null,
        poll,
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
      totalVoteCount > 0 ? Math.round((voteCount / totalVoteCount) * 100) : 0,
    selectedByViewer: false,
    text: row.poll_option_text ?? "",
    voteCount,
  };
}

function createMessagePollFromRow(row: MessageRoundSharedRow): MessagePollResult | null {
  if (!row.poll_id || !row.poll_question) {
    return null;
  }

  const totalVoteCount = Number(row.poll_total_vote_count ?? 0);
  const poll: MessagePollResult = {
    allowMultipleVotes: Boolean(row.poll_allow_multiple_votes),
    id: row.poll_id,
    options: [],
    question: row.poll_question,
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
      const targetTribe = await this.findTargetTribe(database.kysely, tribeSlug);
      const channels = targetTribe
        ? mapRowsToChannels(await this.listChannels(database.kysely, targetTribe.id))
        : [];
      const selectedChannelSlug = normalizeChannelSlug(channelSlug);
      const activeChannel =
        channels.find((channel) => channel.slug === selectedChannelSlug) ?? null;
      const messageRows = targetTribe
        ? await this.listMessageRows({
            activeChannelId: activeChannel?.id ?? null,
            database: database.kysely,
            messageLimit,
            messageOffset,
            tribeId: targetTribe.id,
          })
        : [];
      const pollRows = await this.listPollRows(
        database.kysely,
        messageRows.flatMap((row) => (row.message_id ? [row.message_id] : []))
      );
      const resultRows = this.mergeMessageAndPollRows(messageRows, pollRows);
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
      const targetTribe = await this.findTargetTribe(database.kysely, tribeSlug);

      if (!targetTribe) {
        return { status: MESSAGE_MUTATION_STATUS.notFound };
      }

      const targetMessage = await database.kysely
        .selectFrom("messages")
        .select(["id", "tribe_id"])
        .where("id", "=", messageId)
        .where("tribe_id", "=", targetTribe.id)
        .executeTakeFirst();

      if (!targetMessage) {
        return { status: MESSAGE_MUTATION_STATUS.notFound };
      }

      const viewerMembership = await this.findVisibleViewerMembership(
        database.kysely,
        targetTribe.id,
        viewerId
      );

      if (!viewerMembership) {
        return { status: MESSAGE_MUTATION_STATUS.forbidden };
      }

      const rows = await database.kysely
        .selectFrom("message_replies")
        .innerJoin("user as reply_authors", "reply_authors.id", "message_replies.author_id")
        .leftJoin("tribe_members as reply_members", (join) =>
          join
            .onRef("reply_members.tribe_id", "=", "message_replies.tribe_id")
            .onRef("reply_members.user_id", "=", "message_replies.author_id")
        )
        .select([
          "message_replies.id as reply_id",
          "message_replies.content as reply_content",
          "message_replies.created_at as reply_created_at",
          "reply_authors.id as reply_author_id",
          "reply_authors.name as reply_author_name",
          "reply_authors.image as reply_author_image",
          "reply_members.role as reply_author_role",
        ])
        .where("message_replies.message_id", "=", targetMessage.id)
        .orderBy("message_replies.created_at", "asc")
        .execute();

      return mapRowsToReplies([
        {
          status_result: "found",
          reply_author_id: null,
          reply_author_image: null,
          reply_author_name: null,
          reply_author_role: null,
          reply_content: null,
          reply_created_at: null,
          reply_id: null,
        },
        ...rows.map((row) => ({
          ...row,
          status_result: "found",
        })),
      ]);
    });
  }

  async listViewerStateByTribeSlug({
    tribeSlug,
    viewerId,
  }: ListTribeRoundQuery): Promise<TribeRoundViewerStateResult> {
    return this.executeWithDatabase(async (database) => {
      const targetTribe = await this.findTargetTribe(database.kysely, tribeSlug);

      if (!targetTribe) {
        return mapViewerStateRow(null, viewerId);
      }

      const viewerMembership = await this.findVisibleViewerMembership(
        database.kysely,
        targetTribe.id,
        viewerId
      );

      if (!viewerMembership) {
        return mapViewerStateRow(null, viewerId);
      }

      const likedMessages = await database.kysely
        .selectFrom("message_reactions")
        .innerJoin("messages", "messages.id", "message_reactions.message_id")
        .select("message_reactions.message_id")
        .where("messages.tribe_id", "=", targetTribe.id)
        .where("message_reactions.user_id", "=", viewerId)
        .where("message_reactions.type", "=", "like")
        .execute();
      const selectedPollOptions = await database.kysely
        .selectFrom("message_poll_votes")
        .innerJoin("message_polls", "message_polls.id", "message_poll_votes.poll_id")
        .select("message_poll_votes.option_id")
        .where("message_polls.tribe_id", "=", targetTribe.id)
        .where("message_poll_votes.user_id", "=", viewerId)
        .execute();

      return mapViewerStateRow(
        {
          liked_message_ids: likedMessages.map((row) => row.message_id),
          selected_poll_option_ids: selectedPollOptions.map((row) => row.option_id),
          viewer_membership_role: viewerMembership?.role ?? null,
          viewer_membership_status: viewerMembership?.status ?? null,
        },
        viewerId
      );
    });
  }

  private async findTargetTribe(
    database: RequestDatabase["kysely"],
    tribeSlug: string
  ): Promise<TargetTribeRow | null> {
    return (
      (await database
        .selectFrom("tribes")
        .select("id")
        .where("slug", "=", tribeSlug)
        .executeTakeFirst()) ?? null
    );
  }

  private async listChannels(
    database: RequestDatabase["kysely"],
    tribeId: string
  ): Promise<TribeChannelRow[]> {
    return database
      .selectFrom("tribe_channels")
      .select(["id", "name", "slug", "emoji", "sort_order", "access_scope"])
      .where("tribe_id", "=", tribeId)
      .orderBy("sort_order", "asc")
      .orderBy("name", "asc")
      .execute();
  }

  private async listMessageRows({
    activeChannelId,
    database,
    messageLimit,
    messageOffset,
    tribeId,
  }: {
    activeChannelId: string | null;
    database: RequestDatabase["kysely"];
    messageLimit: number;
    messageOffset: number;
    tribeId: string;
  }): Promise<MessageBaseRow[]> {
    let query = database
      .selectFrom("messages")
      .innerJoin("tribe_channels", "tribe_channels.id", "messages.channel_id")
      .innerJoin("user as message_authors", "message_authors.id", "messages.author_id")
      .leftJoin("tribe_members as message_members", (join) =>
        join
          .onRef("message_members.tribe_id", "=", "messages.tribe_id")
          .onRef("message_members.user_id", "=", "messages.author_id")
      )
      .leftJoin("message_pins", "message_pins.message_id", "messages.id")
      .select((expressionBuilder) => [
        "messages.id as message_id",
        "messages.title as message_title",
        "messages.content as message_content",
        "messages.created_at as message_created_at",
        "tribe_channels.id as channel_id",
        "tribe_channels.name as channel_name",
        "tribe_channels.slug as channel_slug",
        "tribe_channels.emoji as channel_emoji",
        "tribe_channels.sort_order as channel_sort_order",
        "tribe_channels.access_scope as channel_access_scope",
        "message_authors.id as author_id",
        "message_authors.name as author_name",
        "message_authors.image as author_image",
        "message_members.role as author_role",
        "message_pins.pinned_at as message_pinned_at",
        expressionBuilder
          .selectFrom("message_reactions")
          .select((likeCountExpressionBuilder) =>
            likeCountExpressionBuilder.fn.count("message_reactions.id").as("like_count")
          )
          .whereRef("message_reactions.message_id", "=", "messages.id")
          .where("message_reactions.type", "=", "like")
          .as("like_count"),
      ])
      .where("messages.tribe_id", "=", tribeId)
      .whereRef("tribe_channels.tribe_id", "=", "messages.tribe_id");

    if (activeChannelId) {
      query = query.where("messages.channel_id", "=", activeChannelId);
    }

    return query
      .orderBy((expressionBuilder) =>
        expressionBuilder
          .case()
          .when("message_pins.pinned_at", "is", null)
          .then(1)
          .else(0)
          .end(),
        "asc"
      )
      .orderBy("message_pins.pinned_at", "desc")
      .orderBy("messages.created_at", "desc")
      .orderBy("messages.id", "desc")
      .limit(messageLimit)
      .offset(messageOffset)
      .execute();
  }

  private async listPollRows(
    database: RequestDatabase["kysely"],
    messageIds: string[]
  ): Promise<PollOptionRow[]> {
    if (messageIds.length === 0) {
      return [];
    }

    return database
      .selectFrom("message_polls")
      .leftJoin("message_poll_options", "message_poll_options.poll_id", "message_polls.id")
      .select((expressionBuilder) => [
        "message_polls.message_id",
        "message_polls.id as poll_id",
        "message_polls.question as poll_question",
        "message_polls.allow_multiple_votes as poll_allow_multiple_votes",
        "message_poll_options.id as poll_option_id",
        "message_poll_options.text as poll_option_text",
        expressionBuilder
          .selectFrom("message_poll_votes")
          .select((voteCountExpressionBuilder) =>
            voteCountExpressionBuilder.fn.count("message_poll_votes.id").as("vote_count")
          )
          .whereRef("message_poll_votes.option_id", "=", "message_poll_options.id")
          .as("poll_option_vote_count"),
        expressionBuilder
          .selectFrom("message_poll_votes")
          .select((voteCountExpressionBuilder) =>
            voteCountExpressionBuilder.fn.count("message_poll_votes.id").as("vote_count")
          )
          .whereRef("message_poll_votes.poll_id", "=", "message_polls.id")
          .as("poll_total_vote_count"),
      ])
      .where("message_polls.message_id", "in", messageIds)
      .orderBy("message_poll_options.sort_order", "asc")
      .execute();
  }

  private mergeMessageAndPollRows(
    messageRows: MessageBaseRow[],
    pollRows: PollOptionRow[]
  ): MessageRoundSharedRow[] {
    const pollRowsByMessageId = new Map<string, PollOptionRow[]>();

    pollRows.forEach((pollRow) => {
      if (!pollRow.message_id) {
        return;
      }

      const messagePollRows = pollRowsByMessageId.get(pollRow.message_id) ?? [];
      messagePollRows.push(pollRow);
      pollRowsByMessageId.set(pollRow.message_id, messagePollRows);
    });

    return messageRows.flatMap((messageRow) => {
      const messagePollRows = messageRow.message_id
        ? pollRowsByMessageId.get(messageRow.message_id) ?? []
        : [];

      if (messagePollRows.length === 0) {
        return [{
          ...messageRow,
          poll_allow_multiple_votes: null,
          poll_id: null,
          poll_option_id: null,
          poll_option_text: null,
          poll_option_vote_count: null,
          poll_question: null,
          poll_total_vote_count: null,
        }];
      }

      return messagePollRows.map((pollRow) => ({
        ...messageRow,
        ...pollRow,
      }));
    });
  }

  private async findVisibleViewerMembership(
    database: RequestDatabase["kysely"],
    tribeId: string,
    viewerId: string
  ) {
    return database
      .selectFrom("tribe_members")
      .select(["status", "role"])
      .where("tribe_id", "=", tribeId)
      .where("user_id", "=", viewerId)
      .where("status", "in", [
        MESSAGE_MEMBERSHIP_STATUS.active,
        MESSAGE_MEMBERSHIP_STATUS.muted,
      ])
      .executeTakeFirst();
  }
}
