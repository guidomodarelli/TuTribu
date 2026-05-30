import { sql } from "drizzle-orm";

import type {
  DeleteTribeMessageCommand,
  CreateMessageReplyCommand,
  ToggleMessageLikeCommand,
  ToggleMessagePinCommand,
  SubmitMessagePollVoteCommand,
  UpdateTribeMessageCreatedAtCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type {
  CreateTribeMessageRepositoryCommand,
  MessageCreationRepository,
} from "@/src/modules/messages/domain/repositories/message-creation-repository";
import type {
  MessageContentUpdateRepository,
  UpdateTribeMessageContentRepositoryCommand,
} from "@/src/modules/messages/domain/repositories/message-content-update-repository";
import type { MessageCreatedAtUpdateRepository } from "@/src/modules/messages/domain/repositories/message-created-at-update-repository";
import type {
  MessageContentUpdateResult,
  MessageCreatedAtUpdateResult,
  MessageDeletionResult,
  MessageReplyCreationResult,
  MessageCreationResult,
  MessageLikeToggleResult,
  MessagePollMutationResult,
  MessagePinToggleResult,
} from "@/src/modules/messages/application/results/message-mutation-result";
import type {
  MessageImageResult,
  MessagePollResult,
  MessageVideoResult,
} from "@/src/modules/messages/application/results/tribe-round-result";
import {
  MESSAGE_MUTATION_STATUS,
  MESSAGE_IMAGE_STATUS,
  MESSAGE_POLL_PERCENTAGE_SCALE,
  MESSAGE_POLL_STATUS,
  MESSAGE_REACTION_TYPE,
  PINNED_TRIBE_MESSAGES_LIMIT,
} from "@/src/modules/messages/constants/message-round";
import type { MessageReplyRepository } from "@/src/modules/messages/domain/repositories/message-reply-repository";
import type { MessageReactionRepository } from "@/src/modules/messages/domain/repositories/message-reaction-repository";
import type { MessagePinRepository } from "@/src/modules/messages/domain/repositories/message-pin-repository";
import type { MessagePollRepository } from "@/src/modules/messages/domain/repositories/message-poll-repository";
import type { MessageDeletionRepository } from "@/src/modules/messages/domain/repositories/message-deletion-repository";
import {
  createTribeRoundReply,
  createTribeRoundMessage,
  formatMessageDateTimeValue,
} from "@/src/modules/messages/infrastructure/mappers/tribe-round-view-model-mapper";
import {
  createMessageImagesFromRows,
  createMessageVideoFromRow,
} from "@/src/modules/messages/infrastructure/repositories/postgres-message-round-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessageImageAttachmentDraft } from "@/src/modules/messages/domain/repositories/message-image-repository";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

/**
 * Signals an image attachment conflict that must abort the current transaction.
 */
class MessageImageAttachmentConflictError extends Error {
  constructor() {
    super("Message image attachment conflict");
    this.name = "MessageImageAttachmentConflictError";
  }
}

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
  message_external_video_id: string | null;
  message_external_video_provider: string | null;
  message_id: string | null;
  message_images: PersistedMessageImageRow[] | null;
  message_title: string | null;
  message_tribe_id: string | null;
  poll_allow_multiple_votes: boolean | null;
  poll_id: string | null;
  poll_options: CreatedPollOptionRow[] | null;
  poll_question: string | null;
};

type CreatedPollOptionRow = {
  id: string | null;
  text: string | null;
};

type InsertedPollRow = {
  poll_allow_multiple_votes: boolean | null;
  poll_id: string | null;
  poll_question: string | null;
};

type InsertedPollOptionsRow = {
  poll_options: CreatedPollOptionRow[] | null;
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

type LikeCountRow = {
  like_count: number | string | null;
};

type TargetMessageRow = {
  can_write: boolean;
  tribe_id: string;
  message_id: string;
};

type PinTargetMessageRow = {
  can_pin: boolean;
  is_pinned: boolean;
  message_id: string;
  tribe_id: string;
};

type PinCountRow = {
  pinned_count: number | string | null;
};

type InsertedPinRow = {
  pinned_at: Date | string | null;
};

type ExistingPinRow = {
  pinned_at: Date | string | null;
};

type DeletedReactionRow = {
  id: string;
};

type UpdatedCreatedAtRow = MutationStatusRow & {
  message_created_at: Date | string | null;
};

type UpdatedMessageRow = {
  message_id: string | null;
};

type TargetEditMessageRow = {
  can_edit: boolean;
  external_video_id: string | null;
  external_video_provider: string | null;
  message_id: string;
  poll_allow_multiple_votes: boolean | null;
  poll_id: string | null;
  poll_question: string | null;
  poll_vote_count: number | string | null;
  tribe_id: string;
};

type InsertedEditedOptionsRow = {
  poll_options: { id: string | null; text: string | null }[] | null;
};

type PersistedMessageImageRow = {
  alt_text: string | null;
  id: string;
  url: string;
};

type PersistedMessageImagesRow = {
  message_images: PersistedMessageImageRow[] | null;
};

type PollVoteCountRow = {
  poll_vote_count: number | string | null;
};

type PollTargetRow = {
  allow_multiple_votes: boolean;
  can_write: boolean;
  poll_id: string;
  tribe_id: string;
};

type PollOptionRow = {
  option_id: string;
  option_text: string;
  selected_by_viewer: boolean;
  vote_count: number | string | null;
};

const MESSAGE_CREATION_DATABASE_ERROR = {
  pollOptionsNotInserted: "Message poll options were not inserted",
  pollNotInserted: "Message poll was not inserted",
} as const;

const MESSAGE_POLL_ADVISORY_LOCK = {
  namespace: "message-poll-vote-edit",
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
        images: createMessageImagesFromRows(row.message_images),
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
          canEdit: true,
        },
        title: row.message_title,
        video: createMessageVideoFromRow(row),
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
  implements
    MessageCreationRepository,
    MessageReplyRepository,
    MessageReactionRepository,
    MessagePinRepository,
    MessagePollRepository,
    MessageDeletionRepository,
    MessageCreatedAtUpdateRepository,
    MessageContentUpdateRepository
{
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async create(
    command: CreateTribeMessageRepositoryCommand
  ): Promise<MessageCreationResult>;
  async create(command: CreateMessageReplyCommand): Promise<MessageReplyCreationResult>;
  async create(
    command: CreateTribeMessageRepositoryCommand | CreateMessageReplyCommand
  ): Promise<MessageCreationResult | MessageReplyCreationResult> {
    if ("messageId" in command) {
      return this.createReply(command);
    }

    return this.createMessage(command);
  }

  async toggle(command: ToggleMessageLikeCommand): Promise<MessageLikeToggleResult> {
    return this.executeWithDatabase(async (database) => {
      const targetMessageResult = await database.execute(sql`
        select
          messages.id as message_id,
          messages.tribe_id,
          public.is_active_tribe_member(messages.tribe_id) as can_write
        from public.messages
        inner join public.tribes
          on tribes.id = messages.tribe_id
        where messages.id = ${command.messageId}
          and tribes.slug = ${command.tribeSlug}
        limit 1
      `);
      const targetMessage = (targetMessageResult.rows?.[0] ?? null) as TargetMessageRow | null;

      if (!targetMessage) {
        return {
          status: MESSAGE_MUTATION_STATUS.notFound,
        };
      }

      if (!targetMessage.can_write) {
        return {
          status: MESSAGE_MUTATION_STATUS.forbidden,
        };
      }

      const deletedReactionResult = await database.execute(sql`
        delete from public.message_reactions
        where message_reactions.message_id = ${targetMessage.message_id}
          and message_reactions.user_id = ${command.userId}
          and message_reactions.type = ${MESSAGE_REACTION_TYPE.like}
        returning message_reactions.id
      `);
      const deletedReaction = (deletedReactionResult.rows?.[0] ?? null) as
        | DeletedReactionRow
        | null;
      let status: typeof MESSAGE_MUTATION_STATUS.liked | typeof MESSAGE_MUTATION_STATUS.unliked;

      if (deletedReaction) {
        status = MESSAGE_MUTATION_STATUS.unliked;
      } else {
        await database.execute(sql`
          insert into public.message_reactions (message_id, tribe_id, user_id, type, created_at)
          values (
            ${targetMessage.message_id},
            ${targetMessage.tribe_id},
            ${command.userId},
            ${MESSAGE_REACTION_TYPE.like},
            timezone('utc', now())
          )
          on conflict (message_id, user_id) do nothing
          returning id
        `);
        status = MESSAGE_MUTATION_STATUS.liked;
      }

      const likeCountResult = await database.execute(sql`
        select count(*) as like_count
        from public.message_reactions
        where message_reactions.message_id = ${targetMessage.message_id}
          and message_reactions.type = ${MESSAGE_REACTION_TYPE.like}
      `);
      const likeCount = Number(
        ((likeCountResult.rows?.[0] ?? null) as LikeCountRow | null)?.like_count ?? 0
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
        status: MESSAGE_MUTATION_STATUS.forbidden,
      };
    });
  }

  async togglePin(command: ToggleMessagePinCommand): Promise<MessagePinToggleResult> {
    return this.executeWithDatabase(async (database) => {
      const targetMessageResult = await database.execute(sql`
        select
          messages.id as message_id,
          messages.tribe_id,
          public.can_pin_tribe_messages(messages.tribe_id) as can_pin,
          exists (
            select 1
            from public.message_pins
            where message_pins.message_id = messages.id
          ) as is_pinned
        from public.messages
        inner join public.tribes
          on tribes.id = messages.tribe_id
        where messages.id = ${command.messageId}
          and tribes.slug = ${command.tribeSlug}
        limit 1
      `);
      const targetMessage = (targetMessageResult.rows?.[0] ?? null) as
        | PinTargetMessageRow
        | null;

      if (!targetMessage) {
        return {
          status: MESSAGE_MUTATION_STATUS.notFound,
        };
      }

      if (!targetMessage.can_pin) {
        return {
          status: MESSAGE_MUTATION_STATUS.forbidden,
        };
      }

      if (targetMessage.is_pinned) {
        await database.execute(sql`
          delete from public.message_pins
          where message_pins.message_id = ${targetMessage.message_id}
        `);

        return {
          isPinned: false,
          pinnedAt: null,
          status: MESSAGE_MUTATION_STATUS.unpinned,
        };
      }

      await database.execute(sql`
        select pg_advisory_xact_lock(hashtext(${targetMessage.tribe_id}))
      `);

      const existingPinResult = await database.execute(sql`
        select message_pins.pinned_at
        from public.message_pins
        where message_pins.message_id = ${targetMessage.message_id}
        limit 1
      `);
      const existingPin = (existingPinResult.rows?.[0] ?? null) as
        | ExistingPinRow
        | null;

      if (existingPin) {
        return {
          isPinned: true,
          pinnedAt: existingPin.pinned_at
            ? formatMessageDateTimeValue(existingPin.pinned_at)
            : null,
          status: MESSAGE_MUTATION_STATUS.pinned,
        };
      }

      const pinnedCountResult = await database.execute(sql`
        select count(*) as pinned_count
        from public.message_pins
        where message_pins.tribe_id = ${targetMessage.tribe_id}
      `);
      const pinnedCount = Number(
        ((pinnedCountResult.rows?.[0] ?? null) as PinCountRow | null)?.pinned_count ?? 0
      );

      if (pinnedCount >= PINNED_TRIBE_MESSAGES_LIMIT) {
        return {
          status: MESSAGE_MUTATION_STATUS.pinLimitReached,
        };
      }

      const insertedPinResult = await database.execute(sql`
        insert into public.message_pins (message_id, tribe_id, pinned_by, pinned_at)
        values (
          ${targetMessage.message_id},
          ${targetMessage.tribe_id},
          ${command.userId},
          timezone('utc', now())
        )
        on conflict (message_id) do update
        set pinned_by = excluded.pinned_by,
            pinned_at = excluded.pinned_at
        returning pinned_at
      `);
      const insertedPin = (insertedPinResult.rows?.[0] ?? null) as
        | InsertedPinRow
        | null;

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
      const targetPoll = await this.findPollTarget(database, command);

      if (!targetPoll) {
        return { status: MESSAGE_MUTATION_STATUS.notFound };
      }

      if (!targetPoll.can_write) {
        return { status: MESSAGE_MUTATION_STATUS.forbidden };
      }

      await this.lockMessagePollForVoting(database, targetPoll.poll_id);
      await this.lockMessagePollForViewerVoting(
        database,
        targetPoll.poll_id,
        command.userId
      );

      const optionIds = targetPoll.allow_multiple_votes
        ? command.optionIds
        : command.optionIds.slice(0, 1);
      const optionIdSqlArray = sql.join(
        optionIds.map((optionId) => sql`${optionId}::uuid`),
        sql`, `
      );

      const validOptionsResult = await database.execute(sql`
        select message_poll_options.id::text as option_id
        from public.message_poll_options
        where message_poll_options.poll_id = ${targetPoll.poll_id}
          and message_poll_options.id = any(array[${optionIdSqlArray}]::uuid[])
      `);
      const validOptionIds = ((validOptionsResult.rows ?? []) as { option_id: string }[])
        .map((option) => option.option_id);

      if (validOptionIds.length === 0) {
        return { status: MESSAGE_MUTATION_STATUS.invalidPoll };
      }

      await database.execute(sql`
        delete from public.message_poll_votes
        where poll_id = ${targetPoll.poll_id}
          and user_id = ${command.userId}
      `);

      for (const optionId of validOptionIds) {
        await database.execute(sql`
          insert into public.message_poll_votes (poll_id, option_id, tribe_id, user_id, created_at)
          values (
            ${targetPoll.poll_id},
            ${optionId},
            ${targetPoll.tribe_id},
            ${command.userId},
            timezone('utc', now())
          )
          on conflict (poll_id, option_id, user_id) do nothing
        `);
      }

      return {
        poll: await this.readPoll(database, targetPoll.poll_id, command.userId),
        status: MESSAGE_MUTATION_STATUS.voted,
      };
    });
  }

  async delete(command: DeleteTribeMessageCommand): Promise<MessageDeletionResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_message as (
          select
            messages.id as message_id,
            (
              (
                messages.author_id = ${command.userId}
                and public.is_active_tribe_member(messages.tribe_id)
              )
              or public.can_pin_tribe_messages(messages.tribe_id)
            ) as can_delete
          from public.messages
          inner join public.tribes
            on tribes.id = messages.tribe_id
          where messages.id = ${command.messageId}
            and tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        deleted_message as (
          delete from public.messages
          where messages.id = (select target_message.message_id from target_message)
            and exists (
              select 1
              from target_message
              where target_message.can_delete
            )
          returning messages.id
        )
        select
          case
            when exists (select 1 from deleted_message) then ${MESSAGE_MUTATION_STATUS.deleted}
            when not exists (select 1 from target_message) then ${MESSAGE_MUTATION_STATUS.notFound}
            else ${MESSAGE_MUTATION_STATUS.forbidden}
          end as status
      `);
      const row = (result.rows?.[0] ?? null) as MutationStatusRow | null;

      if (row?.status === MESSAGE_MUTATION_STATUS.deleted) {
        return { status: MESSAGE_MUTATION_STATUS.deleted };
      }

      if (row?.status === MESSAGE_MUTATION_STATUS.notFound) {
        return { status: MESSAGE_MUTATION_STATUS.notFound };
      }

      return { status: MESSAGE_MUTATION_STATUS.forbidden };
    });
  }

  async updateCreatedAt(
    command: UpdateTribeMessageCreatedAtCommand
  ): Promise<MessageCreatedAtUpdateResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_message as (
          select
            messages.id as message_id,
            public.is_tribe_leader(messages.tribe_id) as can_edit
          from public.messages
          inner join public.tribes
            on tribes.id = messages.tribe_id
          where messages.id = ${command.messageId}
            and tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        updated_message as (
          update public.messages
          set created_at = ${command.createdAt}::timestamptz,
              updated_at = timezone('utc', now())
          where messages.id = (select target_message.message_id from target_message)
            and exists (
              select 1
              from target_message
              where target_message.can_edit
            )
          returning messages.created_at
        )
        select
          case
            when exists (select 1 from updated_message) then ${MESSAGE_MUTATION_STATUS.updated}
            when not exists (select 1 from target_message) then ${MESSAGE_MUTATION_STATUS.notFound}
            else ${MESSAGE_MUTATION_STATUS.forbidden}
          end as status,
          (select updated_message.created_at from updated_message) as message_created_at
      `);
      const row = (result.rows?.[0] ?? null) as UpdatedCreatedAtRow | null;

      if (
        row?.status === MESSAGE_MUTATION_STATUS.updated &&
        row.message_created_at
      ) {
        return {
          createdAt: formatMessageDateTimeValue(row.message_created_at),
          status: MESSAGE_MUTATION_STATUS.updated,
        };
      }

      if (row?.status === MESSAGE_MUTATION_STATUS.notFound) {
        return { status: MESSAGE_MUTATION_STATUS.notFound };
      }

      return { status: MESSAGE_MUTATION_STATUS.forbidden };
    });
  }

  async updateContent(
    command: UpdateTribeMessageContentRepositoryCommand
  ): Promise<MessageContentUpdateResult> {
    try {
      return await this.executeWithDatabase(async (database) => {
        const targetResult = await database.execute(sql`
          select
            messages.id as message_id,
            messages.tribe_id,
            messages.external_video_provider,
            messages.external_video_id,
            (
              messages.author_id = ${command.userId}
              and public.is_active_tribe_member(messages.tribe_id)
            ) as can_edit,
            existing_poll.id as poll_id,
            existing_poll.question as poll_question,
            existing_poll.allow_multiple_votes as poll_allow_multiple_votes,
            coalesce(existing_poll_votes.vote_count, 0) as poll_vote_count
          from public.messages
          inner join public.tribes
            on tribes.id = messages.tribe_id
          left join public.message_polls existing_poll
            on existing_poll.message_id = messages.id
          left join lateral (
            select count(*) as vote_count
            from public.message_poll_votes
            where message_poll_votes.poll_id = existing_poll.id
          ) existing_poll_votes on true
          where messages.id = ${command.messageId}
            and tribes.slug = ${command.tribeSlug}
          limit 1
        `);
        const targetMessage = (targetResult.rows?.[0] ?? null) as
          | TargetEditMessageRow
          | null;

      if (!targetMessage) {
        return { status: MESSAGE_MUTATION_STATUS.notFound };
      }

      if (!targetMessage.can_edit) {
        return { status: MESSAGE_MUTATION_STATUS.forbidden };
      }

      if (command.poll) {
        if (!targetMessage.poll_id) {
          return { status: MESSAGE_MUTATION_STATUS.pollMissing };
        }

        if (Number(targetMessage.poll_vote_count ?? 0) > 0) {
          return { status: MESSAGE_MUTATION_STATUS.pollHasVotes };
        }

        await this.lockMessagePollForOptionReplacement(
          database,
          targetMessage.poll_id
        );

        if (
          (await this.countMessagePollVotes(database, targetMessage.poll_id)) > 0
        ) {
          return { status: MESSAGE_MUTATION_STATUS.pollHasVotes };
        }
      }

      const hasVideoUpdate = command.video !== undefined;
      const nextVideoProvider = hasVideoUpdate
        ? command.video?.provider ?? null
        : targetMessage.external_video_provider;
      const nextVideoExternalId = hasVideoUpdate
        ? command.video?.externalId ?? null
        : targetMessage.external_video_id;

      const updatedMessageResult = await database.execute(sql`
        update public.messages
        set title = ${command.title},
            content = ${command.content},
            external_video_provider = ${nextVideoProvider},
            external_video_id = ${nextVideoExternalId},
            updated_at = timezone('utc', now())
        where messages.id = ${command.messageId}
        returning messages.id as message_id
      `);
      const updatedMessage = (updatedMessageResult.rows?.[0] ?? null) as
        | UpdatedMessageRow
        | null;

      if (!updatedMessage?.message_id) {
        return { status: MESSAGE_MUTATION_STATUS.forbidden };
      }

      let updatedPoll: MessagePollResult | undefined;
      let updatedImages: MessageImageResult[] | undefined;

      if (command.images !== undefined) {
        const attachedImages = await this.replaceMessageImages(database, {
          images: command.images,
          messageId: command.messageId,
          tribeId: targetMessage.tribe_id,
          userId: command.userId,
        });

        updatedImages = attachedImages;
      }

      if (command.poll && targetMessage.poll_id) {
        await database.execute(sql`
          update public.message_polls
          set question = ${command.poll.question},
              allow_multiple_votes = ${command.poll.allowMultipleVotes},
              updated_at = timezone('utc', now())
          where message_polls.id = ${targetMessage.poll_id}
        `);

        await database.execute(sql`
          delete from public.message_poll_options
          where message_poll_options.poll_id = ${targetMessage.poll_id}
        `);

        const insertedOptionsResult = await database.execute(sql`
          with inserted_options as (
            insert into public.message_poll_options (poll_id, tribe_id, text, sort_order, created_at)
            select
              ${targetMessage.poll_id},
              ${targetMessage.tribe_id},
              poll_option.text,
              poll_option.sort_order::integer,
              timezone('utc', now())
            from unnest(${sql.param(command.poll.options)}::text[]) with ordinality as poll_option(text, sort_order)
            returning id, text, sort_order
          )
          select
            coalesce(
              json_agg(
                json_build_object(
                  'id', inserted_options.id,
                  'text', inserted_options.text
                )
                order by inserted_options.sort_order
              ),
              '[]'::json
            ) as poll_options
          from inserted_options
        `);
        const insertedOptions =
          ((insertedOptionsResult.rows?.[0] ?? null) as InsertedEditedOptionsRow | null)
            ?.poll_options ?? [];

        if (insertedOptions.length !== command.poll.options.length) {
          throw new Error(MESSAGE_CREATION_DATABASE_ERROR.pollOptionsNotInserted);
        }

        updatedPoll = {
          allowMultipleVotes: command.poll.allowMultipleVotes,
          id: targetMessage.poll_id,
          options: insertedOptions
            .filter((option) => option.id && option.text)
            .map((option) => ({
              id: option.id ?? "",
              percentage: 0,
              selectedByViewer: false,
              text: option.text ?? "",
              voteCount: 0,
            })),
          question: command.poll.question,
          totalVoteCount: 0,
          viewerHasVoted: false,
        };
      }

      const videoResult: MessageVideoResult | null | undefined = hasVideoUpdate
        ? command.video ?? null
        : undefined;

      return {
        content: command.content,
        ...(updatedImages !== undefined ? { images: updatedImages } : {}),
        messageId: command.messageId,
        ...(updatedPoll !== undefined ? { poll: updatedPoll } : {}),
        status: MESSAGE_MUTATION_STATUS.updated,
        title: command.title,
        ...(videoResult !== undefined ? { video: videoResult } : {}),
      };
      });
    } catch (error) {
      if (error instanceof MessageImageAttachmentConflictError) {
        return { status: MESSAGE_MUTATION_STATUS.invalidImage };
      }

      throw error;
    }
  }

  private async createMessage(
    command: CreateTribeMessageRepositoryCommand
  ): Promise<MessageCreationResult> {
    try {
      return await this.executeWithDatabase(async (database) => {
        const externalVideoProvider = command.video?.provider ?? null;
        const externalVideoId = command.video?.externalId ?? null;
        const messageResult = await database.execute(sql`
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
        inserted_message as (
          insert into public.messages (tribe_id, channel_id, author_id, title, content, external_video_provider, external_video_id, created_at, updated_at)
          select target_tribe.id, target_channel.id, ${command.authorId}, ${command.title}, ${command.content}, ${externalVideoProvider}, ${externalVideoId}, timezone('utc', now()), timezone('utc', now())
          from target_tribe
          inner join target_channel
            on true
          where public.is_active_tribe_member(target_tribe.id)
          returning id, tribe_id, channel_id, author_id, title, content, external_video_provider, external_video_id, created_at
        ),
        created_message as (
          select
            inserted_message.id as message_id,
            inserted_message.tribe_id as message_tribe_id,
            target_channel.id as channel_id,
            target_channel.name as channel_name,
            target_channel.slug as channel_slug,
            target_channel.emoji as channel_emoji,
            target_channel.sort_order as channel_sort_order,
            target_channel.access_scope as channel_access_scope,
            inserted_message.title as message_title,
            inserted_message.content as message_content,
            inserted_message.external_video_provider as message_external_video_provider,
            inserted_message.external_video_id as message_external_video_id,
            inserted_message.created_at as message_created_at,
            message_authors.id as author_id,
            message_authors.name as author_name,
            message_authors.image as author_image,
            message_members.role as author_role
          from inserted_message
          inner join target_channel
            on target_channel.id = inserted_message.channel_id
          inner join public."user" message_authors
            on message_authors.id = inserted_message.author_id
          left join public.tribe_members message_members
            on message_members.tribe_id = inserted_message.tribe_id
            and message_members.user_id = inserted_message.author_id
        )
        select
          case
            when exists (select 1 from inserted_message) then ${MESSAGE_MUTATION_STATUS.created}
            when not exists (select 1 from target_tribe) then ${MESSAGE_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_channel) then ${MESSAGE_MUTATION_STATUS.invalidChannel}
            else ${MESSAGE_MUTATION_STATUS.forbidden}
          end as status,
          created_message.message_id,
          created_message.message_tribe_id,
          created_message.channel_id,
          created_message.channel_name,
          created_message.channel_slug,
          created_message.channel_emoji,
          created_message.channel_sort_order,
          created_message.channel_access_scope,
          created_message.message_title,
          created_message.message_content,
          created_message.message_external_video_provider,
          created_message.message_external_video_id,
          created_message.message_created_at,
          created_message.author_id,
          created_message.author_name,
          created_message.author_image,
          created_message.author_role
        from (select 1) result
        left join created_message
          on true
      `);
        const createdMessage = (messageResult.rows?.[0] ?? null) as
          | CreatedMessageRow
          | null;

      if (
        createdMessage?.status !== MESSAGE_MUTATION_STATUS.created ||
        !createdMessage.message_id
      ) {
        return mapCreatedMessage(createdMessage);
      }

      let messageImages: PersistedMessageImageRow[] | null = null;

      if (command.images?.length) {
        if (!createdMessage.message_tribe_id) {
          return { status: MESSAGE_MUTATION_STATUS.invalidImage };
        }

        const attachedImages = await this.replaceMessageImages(database, {
          images: command.images,
          messageId: createdMessage.message_id,
          tribeId: createdMessage.message_tribe_id,
          userId: command.authorId,
        });

        messageImages = attachedImages.map((image) => ({
          alt_text: image.altText,
          id: image.id,
          url: image.url,
        }));
      }

      if (!command.poll) {
        return mapCreatedMessage({
          ...createdMessage,
          message_images: messageImages,
        });
      }

      const pollResult = await database.execute(sql`
        insert into public.message_polls (message_id, tribe_id, question, allow_multiple_votes, status, created_at, updated_at)
        select messages.id, messages.tribe_id, ${command.poll.question}, ${command.poll.allowMultipleVotes}, ${MESSAGE_POLL_STATUS.open}, timezone('utc', now()), timezone('utc', now())
        from public.messages
        inner join public.tribes
          on tribes.id = messages.tribe_id
        where messages.id = ${createdMessage.message_id}
          and tribes.slug = ${command.tribeSlug}
          and messages.author_id = ${command.authorId}
        returning
          id as poll_id,
          question as poll_question,
          allow_multiple_votes as poll_allow_multiple_votes
      `);
      const insertedPoll = (pollResult.rows?.[0] ?? null) as InsertedPollRow | null;

      if (!insertedPoll?.poll_id) {
        throw new Error(MESSAGE_CREATION_DATABASE_ERROR.pollNotInserted);
      }

      const pollOptionsResult = await database.execute(sql`
        with inserted_poll_options as (
          insert into public.message_poll_options (poll_id, tribe_id, text, sort_order, created_at)
          select message_polls.id, message_polls.tribe_id, poll_option.text, poll_option.sort_order::integer, timezone('utc', now())
          from public.message_polls
          cross join unnest(${sql.param(command.poll.options)}::text[]) with ordinality as poll_option(text, sort_order)
          where message_polls.id = ${insertedPoll.poll_id}
          returning id, text, sort_order
        )
        select
          coalesce(
            json_agg(
              json_build_object(
                'id', inserted_poll_options.id,
                'text', inserted_poll_options.text
              )
              order by inserted_poll_options.sort_order
            ),
            '[]'::json
          ) as poll_options
        from inserted_poll_options
      `);
      const insertedPollOptions = (pollOptionsResult.rows?.[0] ?? null) as
        | InsertedPollOptionsRow
        | null;
      const pollOptions = insertedPollOptions?.poll_options ?? [];

      if (pollOptions.length !== command.poll.options.length) {
        throw new Error(MESSAGE_CREATION_DATABASE_ERROR.pollOptionsNotInserted);
      }

      return mapCreatedMessage({
        ...createdMessage,
        message_images: messageImages,
        poll_allow_multiple_votes: insertedPoll.poll_allow_multiple_votes,
        poll_id: insertedPoll.poll_id,
        poll_options: pollOptions,
        poll_question: insertedPoll.poll_question,
      });
      });
    } catch (error) {
      if (error instanceof MessageImageAttachmentConflictError) {
        return { status: MESSAGE_MUTATION_STATUS.invalidImage };
      }

      throw error;
    }
  }

  private async replaceMessageImages(
    database: RequestDatabase,
    command: {
      images: MessageImageAttachmentDraft[];
      messageId: string;
      tribeId: string;
      userId: string;
    }
  ): Promise<MessageImageResult[]> {
    const imageIds = command.images.map((image) => image.assetId);

    await database.execute(sql`
      update public.message_images
      set status = ${MESSAGE_IMAGE_STATUS.pendingDelete},
          updated_at = timezone('utc', now())
      where message_images.message_id = ${command.messageId}
        and message_images.tribe_id = ${command.tribeId}
        and message_images.status = ${MESSAGE_IMAGE_STATUS.attached}
    `);

    if (command.images.length === 0) {
      return [];
    }

    const altTexts = command.images.map((image) => image.altText);
    const attachedImagesResult = await database.execute(sql`
      with image_input as (
        select
          image_input.asset_id,
          image_input.alt_text,
          image_input.sort_order::integer - 1 as sort_order
        from unnest(
          ${sql.param(imageIds)}::uuid[],
          ${sql.param(altTexts)}::text[]
        ) with ordinality as image_input(asset_id, alt_text, sort_order)
      ),
      updated_images as (
        update public.message_images
        set message_id = ${command.messageId},
            status = ${MESSAGE_IMAGE_STATUS.attached},
            alt_text = image_input.alt_text,
            sort_order = image_input.sort_order,
            updated_at = timezone('utc', now())
        from image_input
        where message_images.id = image_input.asset_id
          and message_images.tribe_id = ${command.tribeId}
          and message_images.uploaded_by = ${command.userId}
          and (
            message_images.status = ${MESSAGE_IMAGE_STATUS.draft}
            or (
              message_images.status = ${MESSAGE_IMAGE_STATUS.pendingDelete}
              and message_images.message_id = ${command.messageId}
            )
          )
        returning
          message_images.id,
          message_images.alt_text,
          message_images.delivery_url as url,
          message_images.sort_order
      )
      select
        coalesce(
          json_agg(
            json_build_object(
              'alt_text', updated_images.alt_text,
              'id', updated_images.id,
              'url', updated_images.url
            )
            order by updated_images.sort_order
          ),
          '[]'::json
        ) as message_images
      from updated_images
    `);
    const attachedImages =
      ((attachedImagesResult.rows?.[0] ?? null) as PersistedMessageImagesRow | null)
        ?.message_images ?? [];

    if (attachedImages.length !== command.images.length) {
      throw new MessageImageAttachmentConflictError();
    }

    return createMessageImagesFromRows(attachedImages);
  }

  private async findPollTarget(
    database: RequestDatabase,
    command: SubmitMessagePollVoteCommand
  ): Promise<PollTargetRow | null> {
    const targetResult = await database.execute(sql`
      select
        message_polls.id as poll_id,
        message_polls.tribe_id,
        message_polls.allow_multiple_votes,
        public.is_active_tribe_member(message_polls.tribe_id) as can_write
      from public.message_polls
      inner join public.messages
        on messages.id = message_polls.message_id
      inner join public.tribes
        on tribes.id = message_polls.tribe_id
      left join public.message_poll_votes
        on message_poll_votes.poll_id = message_polls.id
      where messages.id = ${command.messageId}
        and tribes.slug = ${command.tribeSlug}
      limit 1
    `);

    return (targetResult.rows?.[0] ?? null) as PollTargetRow | null;
  }

  private async lockMessagePollForVoting(
    database: RequestDatabase,
    pollId: string
  ): Promise<void> {
    await database.execute(sql`
      select pg_advisory_xact_lock_shared(
        hashtext(${MESSAGE_POLL_ADVISORY_LOCK.namespace}),
        hashtext(${pollId})
      ) as lock_key
    `);
  }

  private async lockMessagePollForOptionReplacement(
    database: RequestDatabase,
    pollId: string
  ): Promise<void> {
    await database.execute(sql`
      select pg_advisory_xact_lock(
        hashtext(${MESSAGE_POLL_ADVISORY_LOCK.namespace}),
        hashtext(${pollId})
      ) as lock_key
    `);
  }

  private async lockMessagePollForViewerVoting(
    database: RequestDatabase,
    pollId: string,
    userId: string
  ): Promise<void> {
    await database.execute(sql`
      select pg_advisory_xact_lock(
        hashtext(${pollId}),
        hashtext(${userId})
      ) as lock_key
    `);
  }

  private async countMessagePollVotes(
    database: RequestDatabase,
    pollId: string
  ): Promise<number> {
    const result = await database.execute(sql`
      select count(*) as poll_vote_count
      from public.message_poll_votes
      where message_poll_votes.poll_id = ${pollId}
    `);
    const row = (result.rows?.[0] ?? null) as PollVoteCountRow | null;

    return Number(row?.poll_vote_count ?? 0);
  }

  private async readPoll(
    database: RequestDatabase,
    pollId: string,
    viewerId: string
  ): Promise<MessagePollResult> {
    const optionsResult = await database.execute(sql`
      with option_vote_counts as (
        select option_id, count(*) as vote_count
        from public.message_poll_votes
        where poll_id = ${pollId}
        group by option_id
      ),
      total_votes as (
        select count(*) as total_vote_count
        from public.message_poll_votes
        where poll_id = ${pollId}
      )
      select
        message_polls.id as poll_id,
        message_polls.question,
        message_polls.allow_multiple_votes,
        message_poll_options.id as option_id,
        message_poll_options.text as option_text,
        coalesce(option_vote_counts.vote_count, 0) as vote_count,
        coalesce(total_votes.total_vote_count, 0) as total_vote_count,
        exists (
          select 1
          from public.message_poll_votes viewer_votes
          where viewer_votes.poll_id = message_polls.id
            and viewer_votes.option_id = message_poll_options.id
            and viewer_votes.user_id = ${viewerId}
        ) as selected_by_viewer
      from public.message_polls
      inner join public.message_poll_options
        on message_poll_options.poll_id = message_polls.id
      left join option_vote_counts
        on option_vote_counts.option_id = message_poll_options.id
      cross join total_votes
      where message_polls.id = ${pollId}
      order by message_poll_options.sort_order asc
    `);
    const rows = (optionsResult.rows ?? []) as Array<PollOptionRow & {
      allow_multiple_votes: boolean;
      poll_id: string;
      question: string;
      total_vote_count: number | string | null;
    }>;
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
            totalVoteCount > 0
              ? Math.round(
                  (voteCount / totalVoteCount) * MESSAGE_POLL_PERCENTAGE_SCALE
                )
              : 0,
          selectedByViewer: Boolean(row.selected_by_viewer),
          text: row.option_text,
          voteCount,
        };
      }),
      question: firstRow?.question ?? "",
      totalVoteCount,
      viewerHasVoted: rows.some((row) => row.selected_by_viewer),
    };
  }

  private async createReply(
    command: CreateMessageReplyCommand
  ): Promise<MessageReplyCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_message as (
          select messages.id, messages.tribe_id
          from public.messages
          inner join public.tribes
            on tribes.id = messages.tribe_id
          where messages.id = ${command.messageId}
            and tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        inserted_reply as (
          insert into public.message_replies (message_id, tribe_id, author_id, content, created_at)
          select target_message.id, target_message.tribe_id, ${command.authorId}, ${command.content}, timezone('utc', now())
          from target_message
          where public.is_active_tribe_member(target_message.tribe_id)
          returning id, tribe_id, author_id, content, created_at
        ),
        created_reply as (
          select
            inserted_reply.id as reply_id,
            inserted_reply.content as reply_content,
            inserted_reply.created_at as reply_created_at,
            reply_authors.id as reply_author_id,
            reply_authors.name as reply_author_name,
            reply_authors.image as reply_author_image,
            reply_members.role as reply_author_role
          from inserted_reply
          inner join public."user" reply_authors
            on reply_authors.id = inserted_reply.author_id
          left join public.tribe_members reply_members
            on reply_members.tribe_id = inserted_reply.tribe_id
            and reply_members.user_id = inserted_reply.author_id
        )
        select
          case
            when exists (select 1 from inserted_reply) then ${MESSAGE_MUTATION_STATUS.created}
            when not exists (select 1 from target_message) then ${MESSAGE_MUTATION_STATUS.notFound}
            else ${MESSAGE_MUTATION_STATUS.forbidden}
          end as status,
          created_reply.reply_id,
          created_reply.reply_content,
          created_reply.reply_created_at,
          created_reply.reply_author_id,
          created_reply.reply_author_name,
          created_reply.reply_author_image,
          created_reply.reply_author_role
        from (select 1) result
        left join created_reply
          on true
      `);

      return mapCreatedReply((result.rows?.[0] ?? null) as CreatedReplyRow | null);
    });
  }
}
