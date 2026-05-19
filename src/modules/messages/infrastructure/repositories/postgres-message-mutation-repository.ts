import type {
  DeleteTribeMessageCommand,
  CreateTribeMessageCommand,
  CreateMessageReplyCommand,
  ToggleMessageLikeCommand,
  ToggleMessagePinCommand,
  SubmitMessagePollVoteCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type {
  MessageDeletionResult,
  MessageReplyCreationResult,
  MessageCreationResult,
  MessageLikeToggleResult,
  MessagePollMutationResult,
  MessagePinToggleResult,
} from "@/src/modules/messages/application/results/message-mutation-result";
import type { MessagePollResult } from "@/src/modules/messages/application/results/tribe-round-result";
import {
  MESSAGE_MUTATION_STATUS,
  MESSAGE_POLL_STATUS,
  MESSAGE_REACTION_TYPE,
  PINNED_TRIBE_MESSAGES_LIMIT,
} from "@/src/modules/messages/constants/message-round";
import type { MessageReplyRepository } from "@/src/modules/messages/domain/repositories/message-reply-repository";
import type { MessageCreationRepository } from "@/src/modules/messages/domain/repositories/message-creation-repository";
import type { MessageReactionRepository } from "@/src/modules/messages/domain/repositories/message-reaction-repository";
import type { MessagePinRepository } from "@/src/modules/messages/domain/repositories/message-pin-repository";
import type { MessagePollRepository } from "@/src/modules/messages/domain/repositories/message-poll-repository";
import type { MessageDeletionRepository } from "@/src/modules/messages/domain/repositories/message-deletion-repository";
import {
  createTribeRoundReply,
  createTribeRoundMessage,
  formatMessageDateTimeValue,
} from "@/src/modules/messages/infrastructure/mappers/tribe-round-view-model-mapper";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type MutationStatusRow = {
  status: string | null;
};

type CreatedMessageRow = MutationStatusRow & {
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
  message_content: string | null;
  message_created_at: Date | string | null;
  message_id: string | null;
  message_title: string | null;
  poll_allow_multiple_votes: boolean | null;
  poll_id: string | null;
  poll_options: CreatedPollOptionRow[] | null;
  poll_question: string | null;
};

type CreatedPollOptionRow = {
  id: string | null;
  text: string | null;
};

type CreatedReplyRow = MutationStatusRow & {
  reply_author_id: string | null;
  reply_author_image: string | null;
  reply_author_name: string | null;
  reply_author_role: string | null;
  reply_content: string | null;
  reply_created_at: Date | string | null;
  reply_id: string | null;
};

type PollTargetRow = {
  allow_multiple_votes: boolean;
  can_write: boolean;
  poll_id: string;
  tribe_id: string;
};

type TargetMessagePermission = {
  canWrite: boolean;
  messageId: string;
  tribeId: string;
};

type PinTargetMessage = {
  canPin: boolean;
  isPinned: boolean;
  messageId: string;
  tribeId: string;
};

const MESSAGE_CREATION_DATABASE_ERROR = {
  pollOptionsNotInserted: "Message poll options were not inserted",
  pollNotInserted: "Message poll was not inserted",
} as const;

function mapFallbackCreationStatus(status: string | null): MessageCreationResult {
  if (status === MESSAGE_MUTATION_STATUS.invalidChannel) {
    return {
      status,
    };
  }

  return {
    status:
      status === MESSAGE_MUTATION_STATUS.notFound
        ? MESSAGE_MUTATION_STATUS.notFound
        : MESSAGE_MUTATION_STATUS.forbidden,
  };
}

function mapFallbackReplyCreationStatus(
  status: string | null
): MessageReplyCreationResult {
  return {
    status:
      status === MESSAGE_MUTATION_STATUS.notFound
        ? MESSAGE_MUTATION_STATUS.notFound
        : MESSAGE_MUTATION_STATUS.forbidden,
  };
}

function mapCreatedMessage(row: CreatedMessageRow | null): MessageCreationResult {
  if (
    row?.status === MESSAGE_MUTATION_STATUS.created &&
    row.message_id &&
    row.author_id &&
    row.channel_id &&
    row.message_content &&
    row.message_created_at
  ) {
    return {
      message: createTribeRoundMessage({
        id: row.message_id,
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
        content: row.message_content,
        createdAt: row.message_created_at,
        likedByViewer: false,
        likeCount: 0,
        poll: row.poll_id
          ? {
              allowMultipleVotes: Boolean(row.poll_allow_multiple_votes),
              id: row.poll_id,
              options: (row.poll_options ?? [])
                .filter((option) => option.id && option.text)
                .map((option) => ({
                  id: option.id ?? "",
                  percentage: 0,
                  selectedByViewer: false,
                  text: option.text ?? "",
                  voteCount: 0,
                })),
              question: row.poll_question ?? "",
              totalVoteCount: 0,
              viewerHasVoted: false,
            }
          : null,
        permissions: {
          canDelete: true,
        },
        title: row.message_title,
      }),
      status: row.status,
    };
  }

  return mapFallbackCreationStatus(row?.status ?? null);
}

function mapCreatedReply(row: CreatedReplyRow | null): MessageReplyCreationResult {
  if (
    row?.status === MESSAGE_MUTATION_STATUS.created &&
    row.reply_id &&
    row.reply_author_id &&
    row.reply_content &&
    row.reply_created_at
  ) {
    return {
      reply: createTribeRoundReply({
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
      status: row.status,
    };
  }

  return mapFallbackReplyCreationStatus(row?.status ?? null);
}

export class PostgresMessageMutationRepository
  implements MessageCreationRepository, MessageReplyRepository, MessageReactionRepository, MessagePinRepository, MessagePollRepository, MessageDeletionRepository
{
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async create(command: CreateTribeMessageCommand): Promise<MessageCreationResult>;
  async create(command: CreateMessageReplyCommand): Promise<MessageReplyCreationResult>;
  async create(
    command: CreateTribeMessageCommand | CreateMessageReplyCommand
  ): Promise<MessageCreationResult | MessageReplyCreationResult> {
    if ("messageId" in command) {
      return this.createReply(command);
    }

    return this.createMessage(command);
  }

  async toggle(command: ToggleMessageLikeCommand): Promise<MessageLikeToggleResult> {
    return this.executeWithDatabase(async (database) => {
      const targetMessage = await this.findTargetMessagePermission(
        database.kysely,
        command.messageId,
        command.tribeSlug
      );

      if (!targetMessage) {
        return {
          likedByViewer: false,
          likeCount: 0,
          status: MESSAGE_MUTATION_STATUS.notFound,
        };
      }

      if (!targetMessage.canWrite) {
        return {
          likedByViewer: false,
          likeCount: 0,
          status: MESSAGE_MUTATION_STATUS.forbidden,
        };
      }

      const deletedReaction = await database.kysely
        .deleteFrom("message_reactions")
        .where("message_id", "=", targetMessage.messageId)
        .where("user_id", "=", command.userId)
        .where("type", "=", MESSAGE_REACTION_TYPE.like)
        .returning("id")
        .executeTakeFirst();
      let status: typeof MESSAGE_MUTATION_STATUS.liked | typeof MESSAGE_MUTATION_STATUS.unliked;

      if (deletedReaction) {
        status = MESSAGE_MUTATION_STATUS.unliked;
      } else {
        await database.kysely
          .insertInto("message_reactions")
          .values((expressionBuilder) => ({
            created_at: expressionBuilder.fn<Date>("timezone", [
              expressionBuilder.val("utc"),
              expressionBuilder.fn<Date>("now"),
            ]),
            message_id: targetMessage.messageId,
            tribe_id: targetMessage.tribeId,
            type: MESSAGE_REACTION_TYPE.like,
            user_id: command.userId,
          }))
          .onConflict((conflictBuilder) =>
            conflictBuilder.columns(["message_id", "user_id"]).doNothing()
          )
          .execute();
        status = MESSAGE_MUTATION_STATUS.liked;
      }

      const likeCountResult = await database.kysely
        .selectFrom("message_reactions")
        .select((expressionBuilder) =>
          expressionBuilder.fn.count("id").as("like_count")
        )
        .where("message_id", "=", targetMessage.messageId)
        .where("type", "=", MESSAGE_REACTION_TYPE.like)
        .executeTakeFirst();
      const likeCount = Number(
        likeCountResult?.like_count ?? 0
      );

      if (status === MESSAGE_MUTATION_STATUS.liked) {
        return {
          likedByViewer: true,
          likeCount,
          status,
        };
      }

      if (status === MESSAGE_MUTATION_STATUS.unliked) {
        return {
          likedByViewer: false,
          likeCount,
          status,
        };
      }

      return {
        likedByViewer: false,
        likeCount,
        status: MESSAGE_MUTATION_STATUS.forbidden,
      };
    });
  }

  async togglePin(command: ToggleMessagePinCommand): Promise<MessagePinToggleResult> {
    return this.executeWithDatabase(async (database) => {
      const targetMessage = await this.findPinTargetMessage(
        database.kysely,
        command.messageId,
        command.tribeSlug
      );

      if (!targetMessage) {
        return {
          isPinned: false,
          pinnedAt: null,
          status: MESSAGE_MUTATION_STATUS.notFound,
        };
      }

      if (!targetMessage.canPin) {
        return {
          isPinned: targetMessage.isPinned,
          pinnedAt: null,
          status: MESSAGE_MUTATION_STATUS.forbidden,
        };
      }

      if (targetMessage.isPinned) {
        await database.kysely
          .deleteFrom("message_pins")
          .where("message_id", "=", targetMessage.messageId)
          .execute();

        return {
          isPinned: false,
          pinnedAt: null,
          status: MESSAGE_MUTATION_STATUS.unpinned,
        };
      }

      await database.kysely
        .selectNoFrom((expressionBuilder) => [
          expressionBuilder.fn<void>("pg_advisory_xact_lock", [
            expressionBuilder.fn<number>("hashtext", [
              expressionBuilder.val(targetMessage.tribeId),
            ]),
          ]).as("lock_key"),
        ])
        .executeTakeFirst();

      const existingPin = await database.kysely
        .selectFrom("message_pins")
        .select("pinned_at")
        .where("message_id", "=", targetMessage.messageId)
        .limit(1)
        .executeTakeFirst();

      if (existingPin) {
        return {
          isPinned: true,
          pinnedAt: existingPin.pinned_at
            ? formatMessageDateTimeValue(existingPin.pinned_at)
            : null,
          status: MESSAGE_MUTATION_STATUS.pinned,
        };
      }

      const pinnedCountResult = await database.kysely
        .selectFrom("message_pins")
        .select((expressionBuilder) =>
          expressionBuilder.fn.count("message_id").as("pinned_count")
        )
        .where("tribe_id", "=", targetMessage.tribeId)
        .executeTakeFirst();
      const pinnedCount = Number(
        pinnedCountResult?.pinned_count ?? 0
      );

      if (pinnedCount >= PINNED_TRIBE_MESSAGES_LIMIT) {
        return {
          isPinned: false,
          pinnedAt: null,
          status: MESSAGE_MUTATION_STATUS.pinLimitReached,
        };
      }

      const insertedPin = await database.kysely
        .insertInto("message_pins")
        .values((expressionBuilder) => ({
          message_id: targetMessage.messageId,
          pinned_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
          pinned_by: command.userId,
          tribe_id: targetMessage.tribeId,
        }))
        .onConflict((conflictBuilder) =>
          conflictBuilder.column("message_id").doUpdateSet((expressionBuilder) => ({
            pinned_at: expressionBuilder.ref("excluded.pinned_at"),
            pinned_by: expressionBuilder.ref("excluded.pinned_by"),
          }))
        )
        .returning("pinned_at")
        .executeTakeFirst();

      return {
        isPinned: true,
        pinnedAt: insertedPin?.pinned_at
          ? formatMessageDateTimeValue(insertedPin.pinned_at)
          : null,
        status: MESSAGE_MUTATION_STATUS.pinned,
      };
    });
  }

  async vote(command: SubmitMessagePollVoteCommand): Promise<MessagePollMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const targetPoll = await this.findPollTarget(database.kysely, command);

      if (!targetPoll) {
        return { status: MESSAGE_MUTATION_STATUS.notFound };
      }

      if (!targetPoll.can_write) {
        return { status: MESSAGE_MUTATION_STATUS.forbidden };
      }

      const optionIds = targetPoll.allow_multiple_votes
        ? command.optionIds
        : command.optionIds.slice(0, 1);
      const validOptions = await database.kysely
        .selectFrom("message_poll_options")
        .select("id as option_id")
        .where("poll_id", "=", targetPoll.poll_id)
        .where("id", "in", optionIds)
        .execute();
      const validOptionIds = validOptions.map((option) => option.option_id);

      if (validOptionIds.length === 0) {
        return { status: MESSAGE_MUTATION_STATUS.invalidPoll };
      }

      await database.kysely
        .selectNoFrom((expressionBuilder) => [
          expressionBuilder.fn<void>("pg_advisory_xact_lock", [
            expressionBuilder.fn<number>("hashtext", [
              expressionBuilder.val(targetPoll.poll_id),
            ]),
            expressionBuilder.fn<number>("hashtext", [
              expressionBuilder.val(command.userId),
            ]),
          ]).as("lock_key"),
        ])
        .executeTakeFirst();

      await database.kysely
        .deleteFrom("message_poll_votes")
        .where("poll_id", "=", targetPoll.poll_id)
        .where("user_id", "=", command.userId)
        .execute();

      for (const optionId of validOptionIds) {
        await database.kysely
          .insertInto("message_poll_votes")
          .values((expressionBuilder) => ({
            created_at: expressionBuilder.fn<Date>("timezone", [
              expressionBuilder.val("utc"),
              expressionBuilder.fn<Date>("now"),
            ]),
            option_id: optionId,
            poll_id: targetPoll.poll_id,
            tribe_id: targetPoll.tribe_id,
            user_id: command.userId,
          }))
          .onConflict((conflictBuilder) =>
            conflictBuilder.columns(["poll_id", "option_id", "user_id"]).doNothing()
          )
          .execute();
      }

      return {
        poll: await this.readPoll(database.kysely, targetPoll.poll_id, command.userId),
        status: MESSAGE_MUTATION_STATUS.voted,
      };
    });
  }

  async delete(command: DeleteTribeMessageCommand): Promise<MessageDeletionResult> {
    return this.executeWithDatabase(async (database) => {
      const targetMessage = await database.kysely
        .selectFrom("messages")
        .innerJoin("tribes", "tribes.id", "messages.tribe_id")
        .select("messages.id as messageId")
        .where("messages.id", "=", command.messageId)
        .where("tribes.slug", "=", command.tribeSlug)
        .limit(1)
        .executeTakeFirst();

      if (!targetMessage) {
        return { status: MESSAGE_MUTATION_STATUS.notFound };
      }

      const deletedMessage = await database.kysely
        .deleteFrom("messages")
        .where("id", "=", targetMessage.messageId)
        .where((expressionBuilder) =>
          expressionBuilder.or([
            expressionBuilder.and([
              expressionBuilder("author_id", "=", command.userId),
              expressionBuilder.fn<boolean>(
                "public.is_active_tribe_member",
                ["messages.tribe_id"]
              ),
            ]),
            expressionBuilder.fn<boolean>("public.can_pin_tribe_messages", [
              "messages.tribe_id",
            ]),
          ])
        )
        .returning("id")
        .executeTakeFirst();

      return {
        status: deletedMessage
          ? MESSAGE_MUTATION_STATUS.deleted
          : MESSAGE_MUTATION_STATUS.forbidden,
      };
    });
  }

  private async findTargetMessagePermission(
    database: RequestDatabase["kysely"],
    messageId: string,
    tribeSlug: string
  ): Promise<TargetMessagePermission | null> {
    const targetMessage = await database
      .selectFrom("messages")
      .innerJoin("tribes", "tribes.id", "messages.tribe_id")
      .select(["messages.id as messageId", "messages.tribe_id as tribeId"])
      .where("messages.id", "=", messageId)
      .where("tribes.slug", "=", tribeSlug)
      .limit(1)
      .executeTakeFirst();

    if (!targetMessage) {
      return null;
    }

    const permission = await database
      .selectNoFrom((expressionBuilder) => [
        expressionBuilder.fn<boolean>("public.is_active_tribe_member", [
          expressionBuilder.val(targetMessage.tribeId),
        ]).as("canWrite"),
      ])
      .executeTakeFirst();

    return {
      ...targetMessage,
      canWrite: permission?.canWrite === true,
    };
  }

  private async findPinTargetMessage(
    database: RequestDatabase["kysely"],
    messageId: string,
    tribeSlug: string
  ): Promise<PinTargetMessage | null> {
    const targetMessage = await database
      .selectFrom("messages")
      .innerJoin("tribes", "tribes.id", "messages.tribe_id")
      .select(["messages.id as messageId", "messages.tribe_id as tribeId"])
      .where("messages.id", "=", messageId)
      .where("tribes.slug", "=", tribeSlug)
      .limit(1)
      .executeTakeFirst();

    if (!targetMessage) {
      return null;
    }

    const [permission, existingPin] = await Promise.all([
      database
        .selectNoFrom((expressionBuilder) => [
          expressionBuilder.fn<boolean>("public.can_pin_tribe_messages", [
            expressionBuilder.val(targetMessage.tribeId),
          ]).as("canPin"),
        ])
        .executeTakeFirst(),
      database
        .selectFrom("message_pins")
        .select("message_id")
        .where("message_id", "=", targetMessage.messageId)
        .executeTakeFirst(),
    ]);

    return {
      ...targetMessage,
      canPin: permission?.canPin === true,
      isPinned: Boolean(existingPin),
    };
  }

  private async createMessage(
    command: CreateTribeMessageCommand
  ): Promise<MessageCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const targetTribe = await database.kysely
        .selectFrom("tribes")
        .select("id")
        .where("slug", "=", command.tribeSlug)
        .limit(1)
        .executeTakeFirst();

      if (!targetTribe) {
        return { status: MESSAGE_MUTATION_STATUS.notFound };
      }

      const targetChannel = await database.kysely
        .selectFrom("tribe_channels")
        .select(["id", "name", "slug", "emoji", "sort_order", "access_scope"])
        .where("id", "=", command.channelId)
        .where("tribe_id", "=", targetTribe.id)
        .limit(1)
        .executeTakeFirst();

      if (!targetChannel) {
        return { status: MESSAGE_MUTATION_STATUS.invalidChannel };
      }

      const insertedMessage = await database.kysely
        .insertInto("messages")
        .columns([
          "author_id",
          "channel_id",
          "content",
          "created_at",
          "title",
          "tribe_id",
          "updated_at",
        ])
        .expression((expressionBuilder) =>
          expressionBuilder
            .selectFrom("tribes")
            .select([
              expressionBuilder.val(command.authorId).as("author_id"),
              expressionBuilder.val(targetChannel.id).as("channel_id"),
              expressionBuilder.val(command.content).as("content"),
              expressionBuilder.fn<Date>("timezone", [
                expressionBuilder.val("utc"),
                expressionBuilder.fn<Date>("now"),
              ]).as("created_at"),
              expressionBuilder.val(command.title).as("title"),
              expressionBuilder.val(targetTribe.id).as("tribe_id"),
              expressionBuilder.fn<Date>("timezone", [
                expressionBuilder.val("utc"),
                expressionBuilder.fn<Date>("now"),
              ]).as("updated_at"),
            ])
            .where("tribes.id", "=", targetTribe.id)
            .where(
              expressionBuilder.fn<boolean>("public.is_active_tribe_member", [
                expressionBuilder.val(targetTribe.id),
              ]),
              "=",
              true
            )
        )
        .returning(["id", "tribe_id", "channel_id", "author_id", "title", "content", "created_at"])
        .executeTakeFirst();

      const createdMessage = insertedMessage
        ? await database.kysely
            .selectFrom("messages")
            .innerJoin("tribe_channels", "tribe_channels.id", "messages.channel_id")
            .innerJoin("user as message_authors", "message_authors.id", "messages.author_id")
            .leftJoin("tribe_members as message_members", (join) =>
              join
                .onRef("message_members.tribe_id", "=", "messages.tribe_id")
                .onRef("message_members.user_id", "=", "messages.author_id")
            )
            .select([
              "messages.id as message_id",
              "tribe_channels.id as channel_id",
              "tribe_channels.name as channel_name",
              "tribe_channels.slug as channel_slug",
              "tribe_channels.emoji as channel_emoji",
              "tribe_channels.sort_order as channel_sort_order",
              "tribe_channels.access_scope as channel_access_scope",
              "messages.title as message_title",
              "messages.content as message_content",
              "messages.created_at as message_created_at",
              "message_authors.id as author_id",
              "message_authors.name as author_name",
              "message_authors.image as author_image",
              "message_members.role as author_role",
            ])
            .where("messages.id", "=", insertedMessage.id)
            .executeTakeFirst()
        : null;

      const createdMessageResult: CreatedMessageRow | null = createdMessage
        ? {
            ...createdMessage,
            poll_allow_multiple_votes: null,
            poll_id: null,
            poll_options: null,
            poll_question: null,
            status: MESSAGE_MUTATION_STATUS.created,
          }
        : { status: MESSAGE_MUTATION_STATUS.forbidden } as CreatedMessageRow;

      if (
        createdMessageResult?.status !== MESSAGE_MUTATION_STATUS.created ||
        !command.poll ||
        !createdMessageResult.message_id
      ) {
        return mapCreatedMessage(createdMessageResult);
      }
      const messagePoll = command.poll;
      const createdMessageId = createdMessageResult.message_id;

      const insertedPoll = await database.kysely
        .insertInto("message_polls")
        .values((expressionBuilder) => ({
          allow_multiple_votes: messagePoll.allowMultipleVotes,
          created_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
          message_id: createdMessageId,
          question: messagePoll.question,
          status: MESSAGE_POLL_STATUS.open,
          tribe_id: targetTribe.id,
          updated_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
        }))
        .returning([
          "id as poll_id",
          "question as poll_question",
          "allow_multiple_votes as poll_allow_multiple_votes",
        ])
        .executeTakeFirst();

      if (!insertedPoll?.poll_id) {
        throw new Error(MESSAGE_CREATION_DATABASE_ERROR.pollNotInserted);
      }

      const insertedPollOptions = await database.kysely
        .insertInto("message_poll_options")
        .values((expressionBuilder) =>
          messagePoll.options.map((optionText, optionIndex) => ({
            created_at: expressionBuilder.fn<Date>("timezone", [
              expressionBuilder.val("utc"),
              expressionBuilder.fn<Date>("now"),
            ]),
            poll_id: insertedPoll.poll_id,
            sort_order: optionIndex + 1,
            text: optionText,
            tribe_id: targetTribe.id,
          }))
        )
        .returning(["id", "text", "sort_order"])
        .execute();
      const pollOptions = insertedPollOptions
        .sort((firstOption, secondOption) =>
          Number(firstOption.sort_order ?? 0) - Number(secondOption.sort_order ?? 0)
        )
        .map((option) => ({
          id: option.id,
          text: option.text,
        }));

      if (pollOptions.length !== messagePoll.options.length) {
        throw new Error(MESSAGE_CREATION_DATABASE_ERROR.pollOptionsNotInserted);
      }

      return mapCreatedMessage({
        ...createdMessageResult,
        poll_allow_multiple_votes: insertedPoll.poll_allow_multiple_votes,
        poll_id: insertedPoll.poll_id,
        poll_options: pollOptions,
        poll_question: insertedPoll.poll_question,
      });
    });
  }

  private async findPollTarget(
    database: RequestDatabase["kysely"],
    command: SubmitMessagePollVoteCommand
  ): Promise<PollTargetRow | null> {
    return (
      (await database
        .selectFrom("message_polls")
        .innerJoin("messages", "messages.id", "message_polls.message_id")
        .innerJoin("tribes", "tribes.id", "message_polls.tribe_id")
        .select((expressionBuilder) => [
          "message_polls.id as poll_id",
          "message_polls.tribe_id",
          "message_polls.allow_multiple_votes",
          expressionBuilder.fn<boolean>("public.is_active_tribe_member", [
            "message_polls.tribe_id",
          ]).as("can_write"),
        ])
        .where("messages.id", "=", command.messageId)
        .where("tribes.slug", "=", command.tribeSlug)
        .limit(1)
        .executeTakeFirst()) ?? null
    );
  }

  private async readPoll(
    database: RequestDatabase["kysely"],
    pollId: string,
    viewerId: string
  ): Promise<MessagePollResult> {
    const rows = await database
      .selectFrom("message_polls")
      .innerJoin("message_poll_options", "message_poll_options.poll_id", "message_polls.id")
      .select((expressionBuilder) => [
        "message_polls.id as poll_id",
        "message_polls.question",
        "message_polls.allow_multiple_votes",
        "message_poll_options.id as option_id",
        "message_poll_options.text as option_text",
        expressionBuilder
          .selectFrom("message_poll_votes")
          .select((voteCountExpressionBuilder) =>
            voteCountExpressionBuilder.fn.count("message_poll_votes.id").as("vote_count")
          )
          .whereRef("message_poll_votes.option_id", "=", "message_poll_options.id")
          .as("vote_count"),
        expressionBuilder
          .selectFrom("message_poll_votes")
          .select((totalVoteCountExpressionBuilder) =>
            totalVoteCountExpressionBuilder.fn.count("message_poll_votes.id").as("total_vote_count")
          )
          .whereRef("message_poll_votes.poll_id", "=", "message_polls.id")
          .as("total_vote_count"),
        expressionBuilder
          .selectFrom("message_poll_votes as viewer_votes")
          .select((viewerVoteExpressionBuilder) =>
            viewerVoteExpressionBuilder.fn.count("viewer_votes.id").as("viewer_vote_count")
          )
          .whereRef("viewer_votes.poll_id", "=", "message_polls.id")
          .whereRef("viewer_votes.option_id", "=", "message_poll_options.id")
          .where("viewer_votes.user_id", "=", viewerId)
          .as("selected_by_viewer"),
      ])
      .where("message_polls.id", "=", pollId)
      .orderBy("message_poll_options.sort_order", "asc")
      .execute();
    const firstRow = rows[0];
    const totalVoteCount = Number(firstRow?.total_vote_count ?? 0);

    return {
      allowMultipleVotes: Boolean(firstRow?.allow_multiple_votes),
      id: firstRow?.poll_id ?? pollId,
      options: rows.map((row) => {
        const voteCount = Number(row.vote_count ?? 0);

        return {
          id: row.option_id,
          percentage:
            totalVoteCount > 0 ? Math.round((voteCount / totalVoteCount) * 100) : 0,
          selectedByViewer: Number(row.selected_by_viewer ?? 0) > 0,
          text: row.option_text,
          voteCount,
        };
      }),
      question: firstRow?.question ?? "",
      totalVoteCount,
      viewerHasVoted: rows.some((row) => Number(row.selected_by_viewer ?? 0) > 0),
    };
  }

  private async createReply(
    command: CreateMessageReplyCommand
  ): Promise<MessageReplyCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const targetMessage = await this.findTargetMessagePermission(
        database.kysely,
        command.messageId,
        command.tribeSlug
      );

      if (!targetMessage) {
        return { status: MESSAGE_MUTATION_STATUS.notFound };
      }

      if (!targetMessage.canWrite) {
        return { status: MESSAGE_MUTATION_STATUS.forbidden };
      }

      const insertedReply = await database.kysely
        .insertInto("message_replies")
        .columns(["author_id", "content", "created_at", "message_id", "tribe_id"])
        .expression((expressionBuilder) =>
          expressionBuilder
            .selectFrom("messages")
            .select([
              expressionBuilder.val(command.authorId).as("author_id"),
              expressionBuilder.val(command.content).as("content"),
              expressionBuilder.fn<Date>("timezone", [
                expressionBuilder.val("utc"),
                expressionBuilder.fn<Date>("now"),
              ]).as("created_at"),
              expressionBuilder.val(targetMessage.messageId).as("message_id"),
              expressionBuilder.val(targetMessage.tribeId).as("tribe_id"),
            ])
            .where("messages.id", "=", targetMessage.messageId)
            .where(
              expressionBuilder.fn<boolean>("public.is_active_tribe_member", [
                expressionBuilder.val(targetMessage.tribeId),
              ]),
              "=",
              true
            )
        )
        .returning(["id", "tribe_id", "author_id", "content", "created_at"])
        .executeTakeFirst();

      if (!insertedReply) {
        return { status: MESSAGE_MUTATION_STATUS.forbidden };
      }

      const createdReply = await database.kysely
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
        .where("message_replies.id", "=", insertedReply.id)
        .executeTakeFirst();

      return mapCreatedReply(
        createdReply
          ? {
              ...createdReply,
              status: MESSAGE_MUTATION_STATUS.created,
            }
          : null
      );
    });
  }
}
