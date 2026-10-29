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
  MessagePublicationKeyQuery, MessageVideoRepositoryDraft 
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
  MessageFileResult,
  MessageMediaResult,
  MessagePollResult,
} from "@/src/modules/messages/application/results/tribe-round-result";
import {
  MESSAGE_FILE_STATUS,
  MESSAGE_MEDIA_KIND,
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
  createTribeRoundMessage,
  createTribeRoundReplyFromRow,
  createUnvotedPollOptions,
  formatMessageDateTimeValue,
  type TribeRoundReplyRow,
} from "@/src/modules/messages/infrastructure/mappers/tribe-round-view-model-mapper";
import { sortMessageMediaBySortOrder } from "@/src/modules/messages/infrastructure/repositories/postgres-message-round-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessageImageAttachmentDraft } from "@/src/modules/messages/domain/repositories/message-image-repository";
import type { MessageFileAttachmentDraft } from "@/src/modules/messages/domain/repositories/message-file-repository";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";

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

/**
 * Signals an external video attachment conflict that must abort the current
 * transaction (for example when RLS rejects an insert).
 */
class MessageVideoAttachmentConflictError extends Error {
  constructor() {
    super("Message video attachment conflict");
    this.name = "MessageVideoAttachmentConflictError";
  }
}

/**
 * Signals a file attachment conflict that must abort the current transaction.
 */
class MessageFileAttachmentConflictError extends Error {
  constructor() {
    super("Message file attachment conflict");
    this.name = "MessageFileAttachmentConflictError";
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
  message_id: string | null;
  message_title: string | null;
  message_tribe_id: string | null;
  poll_allow_multiple_votes: boolean | null;
  poll_id: string | null;
  poll_options: CreatedPollOptionRow[] | null;
  replayed_message_id?: string | null;
};

type CreatedPollOptionRow = {
  id: string | null;
  text: string | null;
};

type InsertedPollRow = {
  poll_allow_multiple_votes: boolean | null;
  poll_id: string | null;
};

type InsertedPollOptionsRow = {
  poll_options: CreatedPollOptionRow[] | null;
};

type CreatedReplyRow = MutationStatusRow & TribeRoundReplyRow;

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
  message_id: string;
  poll_allow_multiple_votes: boolean | null;
  poll_id: string | null;
  poll_vote_count: number | string | null;
  tribe_id: string;
};

type InsertedEditedOptionsRow = {
  poll_options: { id: string | null; text: string | null }[] | null;
};

type PersistedMessageImageRow = {
  alt_text: string | null;
  id: string;
  sort_order: number | string | null;
  url: string;
};

type PersistedMessageImagesRow = {
  message_images: PersistedMessageImageRow[] | null;
};

type PersistedMessageVideoRow = {
  external_video_id: string;
  external_video_provider: string;
  id: string;
  sort_order: number | string | null;
};

type PersistedMessageVideosRow = {
  message_videos: PersistedMessageVideoRow[] | null;
};

type PersistedMessageFileRow = {
  file_name: string;
  file_size_bytes: number | string | null;
  id: string;
  mime_type: string;
  sort_order: number | string | null;
};

type PersistedMessageFilesRow = {
  message_files: PersistedMessageFileRow[] | null;
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

function mapCreatedMessage(
  row: CreatedMessageRow | null,
  media: MessageMediaResult[] = [],
  files: MessageFileResult[] = []
): MessageCreationResult {
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
        files,
        likedByViewer: false,
        likeCount: 0,
        media,
        poll: row.poll_id
          ? {
              allowMultipleVotes: Boolean(row.poll_allow_multiple_votes),
              id: row.poll_id,
              options: createUnvotedPollOptions(row.poll_options ?? []),
              totalVoteCount: 0,
              viewerHasVoted: false,
            }
          : null,
        permissions: {
          canDelete: true,
          canEdit: true,
        },
        title: row.message_title,
      }),
      status: row.status,
    };
  }

  return mapFallbackCreationStatus(row?.status ?? null);
}

function mapCreatedReply(row: CreatedReplyRow | null): MessageReplyCreationResult {
  if (row?.status === MESSAGE_MUTATION_STATUS.created) {
    const reply = createTribeRoundReplyFromRow(row);

    if (reply) {
      return { reply, status: row.status };
    }
  }

  return mapFallbackReplyCreationStatus(row?.status ?? null);
}

type AttachmentConflictResult = {
  status:
    | typeof MESSAGE_MUTATION_STATUS.invalidFile
    | typeof MESSAGE_MUTATION_STATUS.invalidImage
    | typeof MESSAGE_MUTATION_STATUS.invalidMedia;
};

/**
 * Maps an attachment conflict raised inside the transaction to its rejection; any other error is rethrown.
 * @param error - Error that aborted the transaction.
 * @returns The rejection for the attachment kind that conflicted.
 */
function mapAttachmentConflictError(error: unknown): AttachmentConflictResult {
  if (error instanceof MessageImageAttachmentConflictError) {
    return { status: MESSAGE_MUTATION_STATUS.invalidImage };
  }

  if (error instanceof MessageVideoAttachmentConflictError) {
    return { status: MESSAGE_MUTATION_STATUS.invalidMedia };
  }

  if (error instanceof MessageFileAttachmentConflictError) {
    return { status: MESSAGE_MUTATION_STATUS.invalidFile };
  }

  throw error;
}

/**
 * Builds the statement that inserts the message videos in their order.
 * @param command - Target message, tribe and normalized videos.
 * @returns The insert returning the stored videos as JSON.
 */
function buildInsertMessageVideosQuery(command: {
  messageId: string;
  tribeId: string;
  videos: MessageVideoRepositoryDraft[];
}) {
  const providers = command.videos.map((video) => video.provider);
  const externalIds = command.videos.map((video) => video.externalId);
  const sortOrders = command.videos.map((video) => video.sortOrder);

  return sql`
    with video_input as (
      select
        video_input.provider,
        video_input.external_id,
        video_input.sort_order::integer as sort_order
      from unnest(
        ${sql.param(providers)}::text[],
        ${sql.param(externalIds)}::text[],
        ${sql.param(sortOrders)}::int[]
      ) as video_input(provider, external_id, sort_order)
    ),
    inserted_videos as (
      insert into public.message_videos (
        tribe_id,
        message_id,
        external_video_provider,
        external_video_id,
        sort_order,
        created_at,
        updated_at
      )
      select
        ${command.tribeId},
        ${command.messageId},
        video_input.provider,
        video_input.external_id,
        video_input.sort_order,
        timezone('utc', now()),
        timezone('utc', now())
      from video_input
      returning
        id,
        external_video_provider,
        external_video_id,
        sort_order
    )
    select
      coalesce(
        json_agg(
          json_build_object(
            'external_video_id', inserted_videos.external_video_id,
            'external_video_provider', inserted_videos.external_video_provider,
            'id', inserted_videos.id,
            'sort_order', inserted_videos.sort_order
          )
          order by inserted_videos.sort_order
        ),
        '[]'::json
      ) as message_videos
    from inserted_videos
  `;
}

/**
 * Builds the statement that attaches the uploaded images to the message in their order.
 * @param command - Target message, tribe, uploader and normalized images.
 * @returns The update returning the attached images as JSON.
 */
function buildAttachMessageImagesQuery(command: {
  images: MessageImageAttachmentDraft[];
  messageId: string;
  tribeId: string;
  userId: string;
}) {
  const imageIds = command.images.map((image) => image.assetId);
  const altTexts = command.images.map((image) => image.altText);
  const sortOrders = command.images.map((image) => image.sortOrder);

  return sql`
    with image_input as (
      select
        image_input.asset_id,
        image_input.alt_text,
        image_input.sort_order::integer as sort_order
      from unnest(
        ${sql.param(imageIds)}::uuid[],
        ${sql.param(altTexts)}::text[],
        ${sql.param(sortOrders)}::int[]
      ) as image_input(asset_id, alt_text, sort_order)
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
            'sort_order', updated_images.sort_order,
            'url', updated_images.url
          )
          order by updated_images.sort_order
        ),
        '[]'::json
      ) as message_images
    from updated_images
  `;
}

/**
 * Builds the statement that attaches the uploaded files to the message in their order.
 * @param command - Target message, tribe, uploader and normalized files.
 * @returns The update returning the attached files as JSON.
 */
function buildAttachMessageFilesQuery(command: {
  files: MessageFileAttachmentDraft[];
  messageId: string;
  tribeId: string;
  userId: string;
}) {
  const fileIds = command.files.map((file) => file.assetId);
  const sortOrders = command.files.map((file) => file.sortOrder);

  return sql`
    with file_input as (
      select
        file_input.asset_id,
        file_input.sort_order::integer as sort_order
      from unnest(
        ${sql.param(fileIds)}::uuid[],
        ${sql.param(sortOrders)}::int[]
      ) as file_input(asset_id, sort_order)
    ),
    updated_files as (
      update public.message_files
      set message_id = ${command.messageId},
          status = ${MESSAGE_FILE_STATUS.attached},
          sort_order = file_input.sort_order,
          updated_at = timezone('utc', now())
      from file_input
      where message_files.id = file_input.asset_id
        and message_files.tribe_id = ${command.tribeId}
        and message_files.uploaded_by = ${command.userId}
        and (
          message_files.status = ${MESSAGE_FILE_STATUS.draft}
          or (
            message_files.status = ${MESSAGE_FILE_STATUS.pendingDelete}
            and message_files.message_id = ${command.messageId}
          )
        )
      returning
        message_files.id,
        message_files.file_name,
        message_files.file_size_bytes,
        message_files.mime_type,
        message_files.sort_order
    )
    select
      coalesce(
        json_agg(
          json_build_object(
            'file_name', updated_files.file_name,
            'file_size_bytes', updated_files.file_size_bytes,
            'id', updated_files.id,
            'mime_type', updated_files.mime_type,
            'sort_order', updated_files.sort_order
          )
          order by updated_files.sort_order
        ),
        '[]'::json
      ) as message_files
    from updated_files
  `;
}

/**
 * @returns The CTE that projects the inserted message with its channel and author.
 */
function buildCreatedMessageCte() {
  return sql`
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
  `;
}

/**
 * Builds the single statement that inserts a publication, or reports why it was not inserted.
 * @param command - Publication to insert.
 * @param clientRequestId - Idempotency key, when the client sent one.
 * @returns The insert returning the creation status and the created message.
 */
function buildCreateMessageQuery(
  command: CreateTribeMessageRepositoryCommand,
  clientRequestId: string | null
) {
  return sql`
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
    replayed_message as (
      select messages.id
      from public.messages
      inner join target_tribe
        on target_tribe.id = messages.tribe_id
      where ${clientRequestId}::uuid is not null
        and messages.author_id = ${command.authorId}
        and messages.client_request_id = ${clientRequestId}::uuid
      limit 1
    ),
    inserted_message as (
      insert into public.messages (tribe_id, channel_id, author_id, title, content, client_request_id, created_at, updated_at)
      select target_tribe.id, target_channel.id, ${command.authorId}, ${command.title}, ${command.content}, ${clientRequestId}::uuid, timezone('utc', now()), timezone('utc', now())
      from target_tribe
      inner join target_channel
        on true
      where public.can_write_tribe_channel(target_channel.id)
      on conflict (author_id, client_request_id) where client_request_id is not null do nothing
      returning id, tribe_id, channel_id, author_id, title, content, created_at
    ),
    ${buildCreatedMessageCte()}
    select
      case
        when exists (select 1 from inserted_message) then ${MESSAGE_MUTATION_STATUS.created}
        when exists (select 1 from replayed_message) then ${MESSAGE_MUTATION_STATUS.replayed}
        -- The key conflicted with a publication committed concurrently, outside this statement's snapshot.
        when ${clientRequestId}::uuid is not null
          and exists (select 1 from target_channel where public.can_write_tribe_channel(target_channel.id))
          then ${MESSAGE_MUTATION_STATUS.replayed}
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
      created_message.message_created_at,
      created_message.author_id,
      created_message.author_name,
      created_message.author_image,
      created_message.author_role,
      (select replayed_message.id from replayed_message) as replayed_message_id
    from (select 1) result
    left join created_message
      on true
  `;
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

  async findPublicationByClientRequestId(query: MessagePublicationKeyQuery): Promise<string | null> {
    return this.executeWithDatabase(async (database) => {
      const storedResult = await database.execute(sql`
        select messages.id
        from public.messages
        inner join public.tribes
          on tribes.id = messages.tribe_id
        where tribes.slug = ${query.tribeSlug}
          and messages.author_id = ${query.authorId}
          and messages.client_request_id = ${query.clientRequestId}::uuid
        limit 1
      `);

      return ((storedResult.rows[0] ?? null) as { id: string } | null)?.id ?? null;
    });
  }

  async toggle(command: ToggleMessageLikeCommand): Promise<MessageLikeToggleResult> {
    return this.executeWithDatabase(async (database) => {
      const targetMessageResult = await database.execute(sql`
        select
          messages.id as message_id,
          messages.tribe_id,
          public.can_write_tribe_channel(messages.channel_id) as can_write
        from public.messages
        inner join public.tribes
          on tribes.id = messages.tribe_id
        where messages.id = ${command.messageId}
          and tribes.slug = ${command.tribeSlug}
        limit 1
      `);
      const targetMessage = (targetMessageResult.rows[0] ?? null) as TargetMessageRow | null;

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

      let status: typeof MESSAGE_MUTATION_STATUS.liked | typeof MESSAGE_MUTATION_STATUS.unliked;
      // A desired "liked" never deletes, so repeating it after a lost response keeps the like.
      const deletedReaction = command.liked === true
        ? null
        : ((await database.execute(sql`
          delete from public.message_reactions
          where message_reactions.message_id = ${targetMessage.message_id}
            and message_reactions.user_id = ${command.userId}
            and message_reactions.type = ${MESSAGE_REACTION_TYPE.like}
          returning message_reactions.id
        `)).rows[0] ?? null) as DeletedReactionRow | null;

      // A desired "not liked" never inserts, whether or not a like existed.
      if (deletedReaction || command.liked === false) {
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
        ((likeCountResult.rows[0] ?? null) as LikeCountRow | null)?.like_count ?? 0
      );

      if (status === MESSAGE_MUTATION_STATUS.liked) {
        return {
          likedByViewer: true,
          likeCount,
          status,
        };
      }

      return {
        likedByViewer: false,
        likeCount,
        status,
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
      const targetMessage = (targetMessageResult.rows[0] ?? null) as
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

      return this.pinMessage(database, targetMessage, command.userId);
    });
  }

  private async pinMessage(
    database: RequestDatabase,
    targetMessage: PinTargetMessageRow,
    userId: string
  ): Promise<MessagePinToggleResult> {
    await database.execute(sql`
      select pg_advisory_xact_lock(hashtext(${targetMessage.tribe_id}))
    `);

    const existingPinResult = await database.execute(sql`
      select message_pins.pinned_at
      from public.message_pins
      where message_pins.message_id = ${targetMessage.message_id}
      limit 1
    `);
    const existingPin = (existingPinResult.rows[0] ?? null) as
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
      ((pinnedCountResult.rows[0] ?? null) as PinCountRow | null)?.pinned_count ?? 0
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
        ${userId},
        timezone('utc', now())
      )
      on conflict (message_id) do update
      set pinned_by = excluded.pinned_by,
          pinned_at = excluded.pinned_at
      returning pinned_at
    `);
    const insertedPin = (insertedPinResult.rows[0] ?? null) as
      | InsertedPinRow
      | null;

    return {
      isPinned: true,
      pinnedAt: insertedPin?.pinned_at
        ? formatMessageDateTimeValue(insertedPin.pinned_at)
        : null,
      status: MESSAGE_MUTATION_STATUS.pinned,
    };
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
      const validOptionIds = (validOptionsResult.rows as { option_id: string }[])
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
                and public.can_write_tribe_channel(messages.channel_id)
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
      const row = (result.rows[0] ?? null) as MutationStatusRow | null;

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
      const row = (result.rows[0] ?? null) as UpdatedCreatedAtRow | null;

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
        const targetMessage = await this.findEditTarget(database, command);

        if (!targetMessage) {
          return { status: MESSAGE_MUTATION_STATUS.notFound };
        }

        if (!targetMessage.can_edit) {
          return { status: MESSAGE_MUTATION_STATUS.forbidden };
        }

        const pollRejection = await this.findPollEditRejection(
          database,
          command,
          targetMessage
        );

        if (pollRejection) {
          return pollRejection;
        }

        const updatedMessageResult = await database.execute(sql`
          update public.messages
          set title = ${command.title},
              content = ${command.content},
              updated_at = timezone('utc', now())
          where messages.id = ${command.messageId}
          returning messages.id as message_id
        `);
        const updatedMessage = (updatedMessageResult.rows[0] ?? null) as
          | UpdatedMessageRow
          | null;

        if (!updatedMessage?.message_id) {
          return { status: MESSAGE_MUTATION_STATUS.forbidden };
        }

        const updatedFiles =
          command.files !== undefined
            ? await this.replaceMessageFiles(database, {
                files: command.files,
                messageId: command.messageId,
                tribeId: targetMessage.tribe_id,
                userId: command.userId,
              })
            : undefined;
        const updatedMedia = await this.replaceEditedMedia(
          database,
          command,
          targetMessage.tribe_id
        );
        const updatedPoll =
          command.poll && targetMessage.poll_id
            ? await this.replaceEditedPollOptions(database, {
                poll: command.poll,
                pollId: targetMessage.poll_id,
                tribeId: targetMessage.tribe_id,
              })
            : undefined;

        return {
          content: command.content,
          ...(updatedFiles !== undefined ? { files: updatedFiles } : {}),
          ...(updatedMedia !== undefined ? { media: updatedMedia } : {}),
          messageId: command.messageId,
          ...(updatedPoll !== undefined ? { poll: updatedPoll } : {}),
          status: MESSAGE_MUTATION_STATUS.updated,
          title: command.title,
        };
      });
    } catch (error) {
      return mapAttachmentConflictError(error);
    }
  }

  private async findEditTarget(
    database: RequestDatabase,
    command: UpdateTribeMessageContentRepositoryCommand
  ): Promise<TargetEditMessageRow | null> {
    const targetResult = await database.execute(sql`
      select
        messages.id as message_id,
        messages.tribe_id,
        (
          messages.author_id = ${command.userId}
          and public.can_write_tribe_channel(messages.channel_id)
        ) as can_edit,
        existing_poll.id as poll_id,
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

    return (targetResult.rows[0] ?? null) as TargetEditMessageRow | null;
  }

  /**
   * A poll edit replaces the options, so it needs an existing poll without votes; the vote count is
   * read again under the replacement lock to close the race with a concurrent vote.
   * @returns The rejection to answer, or null when the edit may continue.
   */
  private async findPollEditRejection(
    database: RequestDatabase,
    command: UpdateTribeMessageContentRepositoryCommand,
    targetMessage: TargetEditMessageRow
  ): Promise<MessageContentUpdateResult | null> {
    if (!command.poll) {
      return null;
    }

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

    return null;
  }

  private async replaceEditedMedia(
    database: RequestDatabase,
    command: UpdateTribeMessageContentRepositoryCommand,
    tribeId: string
  ): Promise<MessageMediaResult[] | undefined> {
    if (command.images === undefined && command.videos === undefined) {
      return undefined;
    }

    const attachedImages =
      command.images !== undefined
        ? await this.replaceMessageImages(database, {
            images: command.images,
            messageId: command.messageId,
            tribeId,
            userId: command.userId,
          })
        : [];
    const attachedVideos =
      command.videos !== undefined
        ? await this.replaceMessageVideos(database, {
            messageId: command.messageId,
            tribeId,
            videos: command.videos,
          })
        : [];

    return sortMessageMediaBySortOrder([
      ...attachedImages,
      ...attachedVideos,
    ]);
  }

  private async replaceEditedPollOptions(
    database: RequestDatabase,
    {
      poll,
      pollId,
      tribeId,
    }: {
      poll: NonNullable<UpdateTribeMessageContentRepositoryCommand["poll"]>;
      pollId: string;
      tribeId: string;
    }
  ): Promise<MessagePollResult> {
    await database.execute(sql`
      update public.message_polls
      set allow_multiple_votes = ${poll.allowMultipleVotes},
          updated_at = timezone('utc', now())
      where message_polls.id = ${pollId}
    `);

    await database.execute(sql`
      delete from public.message_poll_options
      where message_poll_options.poll_id = ${pollId}
    `);

    const insertedOptionsResult = await database.execute(sql`
      with inserted_options as (
        insert into public.message_poll_options (poll_id, tribe_id, text, sort_order, created_at)
        select
          ${pollId},
          ${tribeId},
          poll_option.text,
          poll_option.sort_order::integer,
          timezone('utc', now())
        from unnest(${sql.param(poll.options)}::text[]) with ordinality as poll_option(text, sort_order)
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
      ((insertedOptionsResult.rows[0] ?? null) as InsertedEditedOptionsRow | null)
        ?.poll_options ?? [];

    if (insertedOptions.length !== poll.options.length) {
      throw new Error(MESSAGE_CREATION_DATABASE_ERROR.pollOptionsNotInserted);
    }

    return {
      allowMultipleVotes: poll.allowMultipleVotes,
      id: pollId,
      options: createUnvotedPollOptions(insertedOptions),
      totalVoteCount: 0,
      viewerHasVoted: false,
    };
  }

  private async createMessage(
    command: CreateTribeMessageRepositoryCommand
  ): Promise<MessageCreationResult> {
    const clientRequestId = command.clientRequestId ?? null;

    try {
      return await this.executeWithDatabase(async (database) => {
        const messageResult = await database.execute(
          buildCreateMessageQuery(command, clientRequestId)
        );
        const createdMessage = (messageResult.rows[0] ?? null) as
          | CreatedMessageRow
          | null;

        if (createdMessage?.status === MESSAGE_MUTATION_STATUS.replayed) {
          return { messageId: createdMessage.replayed_message_id ?? null, status: MESSAGE_MUTATION_STATUS.replayed };
        }

        if (
          createdMessage?.status !== MESSAGE_MUTATION_STATUS.created ||
          !createdMessage.message_id
        ) {
          return mapCreatedMessage(createdMessage);
        }

        return this.attachCreatedMessageContent(
          database,
          command,
          createdMessage,
          createdMessage.message_id
        );
      });
    } catch (error) {
      return mapAttachmentConflictError(error);
    }
  }

  private async attachCreatedMessageContent(
    database: RequestDatabase,
    command: CreateTribeMessageRepositoryCommand,
    createdMessage: CreatedMessageRow,
    messageId: string
  ): Promise<MessageCreationResult> {
    const mediaItems: MessageMediaResult[] = [];

    if (command.images?.length || command.videos?.length) {
      if (!createdMessage.message_tribe_id) {
        return { status: MESSAGE_MUTATION_STATUS.invalidMedia };
      }

      if (command.images?.length) {
        const attachedImages = await this.replaceMessageImages(database, {
          images: command.images,
          messageId,
          tribeId: createdMessage.message_tribe_id,
          userId: command.authorId,
        });

        mediaItems.push(...attachedImages);
      }

      if (command.videos?.length) {
        const attachedVideos = await this.replaceMessageVideos(database, {
          messageId,
          tribeId: createdMessage.message_tribe_id,
          videos: command.videos,
        });

        mediaItems.push(...attachedVideos);
      }
    }

    const media = sortMessageMediaBySortOrder(mediaItems);
    let attachedFiles: MessageFileResult[] = [];

    if (command.files?.length) {
      if (!createdMessage.message_tribe_id) {
        return { status: MESSAGE_MUTATION_STATUS.invalidFile };
      }

      attachedFiles = await this.replaceMessageFiles(database, {
        files: command.files,
        messageId,
        tribeId: createdMessage.message_tribe_id,
        userId: command.authorId,
      });
    }

    if (!command.poll) {
      return mapCreatedMessage(createdMessage, media, attachedFiles);
    }

    const insertedPoll = await this.insertCreatedMessagePoll(database, {
      authorId: command.authorId,
      messageId,
      poll: command.poll,
      tribeSlug: command.tribeSlug,
    });

    return mapCreatedMessage(
      { ...createdMessage, ...insertedPoll },
      media,
      attachedFiles
    );
  }

  private async insertCreatedMessagePoll(
    database: RequestDatabase,
    command: {
      authorId: string;
      messageId: string;
      poll: NonNullable<CreateTribeMessageRepositoryCommand["poll"]>;
      tribeSlug: string;
    }
  ): Promise<{
    poll_allow_multiple_votes: InsertedPollRow["poll_allow_multiple_votes"];
    poll_id: string;
    poll_options: NonNullable<InsertedPollOptionsRow["poll_options"]>;
  }> {
    const pollResult = await database.execute(sql`
      insert into public.message_polls (message_id, tribe_id, allow_multiple_votes, status, created_at, updated_at)
      select messages.id, messages.tribe_id, ${command.poll.allowMultipleVotes}, ${MESSAGE_POLL_STATUS.open}, timezone('utc', now()), timezone('utc', now())
      from public.messages
      inner join public.tribes
        on tribes.id = messages.tribe_id
      where messages.id = ${command.messageId}
        and tribes.slug = ${command.tribeSlug}
        and messages.author_id = ${command.authorId}
      returning
        id as poll_id,
        allow_multiple_votes as poll_allow_multiple_votes
    `);
    const insertedPoll = (pollResult.rows[0] ?? null) as InsertedPollRow | null;

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
    const insertedPollOptions = (pollOptionsResult.rows[0] ?? null) as
      | InsertedPollOptionsRow
      | null;
    const pollOptions = insertedPollOptions?.poll_options ?? [];

    if (pollOptions.length !== command.poll.options.length) {
      throw new Error(MESSAGE_CREATION_DATABASE_ERROR.pollOptionsNotInserted);
    }

    return {
      poll_allow_multiple_votes: insertedPoll.poll_allow_multiple_votes,
      poll_id: insertedPoll.poll_id,
      poll_options: pollOptions,
    };
  }

  private async replaceMessageFiles(
    database: RequestDatabase,
    command: {
      files: MessageFileAttachmentDraft[];
      messageId: string;
      tribeId: string;
      userId: string;
    }
  ): Promise<MessageFileResult[]> {
    await database.execute(sql`
      update public.message_files
      set status = ${MESSAGE_FILE_STATUS.pendingDelete},
          sort_order = null,
          updated_at = timezone('utc', now())
      where message_files.message_id = ${command.messageId}
        and message_files.tribe_id = ${command.tribeId}
        and message_files.status = ${MESSAGE_FILE_STATUS.attached}
    `);

    if (command.files.length === 0) {
      return [];
    }

    const attachedFilesResult = await database.execute(
      buildAttachMessageFilesQuery(command)
    );
    const attachedFiles =
      ((attachedFilesResult.rows[0] ?? null) as PersistedMessageFilesRow | null)
        ?.message_files ?? [];

    if (attachedFiles.length !== command.files.length) {
      throw new MessageFileAttachmentConflictError();
    }

    return attachedFiles.map((file) => ({
      fileName: file.file_name,
      fileSizeBytes: Number(file.file_size_bytes ?? 0),
      id: file.id,
      mimeType: file.mime_type,
      sortOrder: Number(file.sort_order ?? 0),
    }));
  }

  private async replaceMessageImages(
    database: RequestDatabase,
    command: {
      images: MessageImageAttachmentDraft[];
      messageId: string;
      tribeId: string;
      userId: string;
    }
  ): Promise<MessageMediaResult[]> {
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

    const attachedImagesResult = await database.execute(
      buildAttachMessageImagesQuery(command)
    );
    const attachedImages =
      ((attachedImagesResult.rows[0] ?? null) as PersistedMessageImagesRow | null)
        ?.message_images ?? [];

    if (attachedImages.length !== command.images.length) {
      throw new MessageImageAttachmentConflictError();
    }

    return attachedImages.map((image) => ({
      altText: image.alt_text ?? "",
      id: image.id,
      kind: MESSAGE_MEDIA_KIND.image,
      sortOrder: Number(image.sort_order ?? 0),
      url: image.url,
    }));
  }

  private async replaceMessageVideos(
    database: RequestDatabase,
    command: {
      messageId: string;
      tribeId: string;
      videos: MessageVideoRepositoryDraft[];
    }
  ): Promise<MessageMediaResult[]> {
    await database.execute(sql`
      delete from public.message_videos
      where message_videos.message_id = ${command.messageId}
        and message_videos.tribe_id = ${command.tribeId}
    `);

    if (command.videos.length === 0) {
      return [];
    }

    const insertedVideosResult = await database.execute(
      buildInsertMessageVideosQuery(command)
    );
    const insertedVideos =
      ((insertedVideosResult.rows[0] ?? null) as PersistedMessageVideosRow | null)
        ?.message_videos ?? [];

    if (insertedVideos.length !== command.videos.length) {
      throw new MessageVideoAttachmentConflictError();
    }

    return insertedVideos.map((video) => ({
      externalId: video.external_video_id,
      id: video.id,
      kind: MESSAGE_MEDIA_KIND.video,
      provider: video.external_video_provider as VideoProvider,
      sortOrder: Number(video.sort_order ?? 0),
      thumbnailResolved: false,
      thumbnailUrl: null,
    }));
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
        public.can_write_tribe_channel(messages.channel_id) as can_write
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

    return (targetResult.rows[0] ?? null) as PollTargetRow | null;
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
    const row = (result.rows[0] ?? null) as PollVoteCountRow | null;

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
    const rows = optionsResult.rows as Array<PollOptionRow & {
      allow_multiple_votes: boolean;
      poll_id: string;
      total_vote_count: number | string | null;
    }>;
    const firstRow = rows.at(0);
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
          selectedByViewer: row.selected_by_viewer,
          text: row.option_text,
          voteCount,
        };
      }),
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
          select messages.id, messages.tribe_id, messages.channel_id
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
          where public.can_write_tribe_channel(target_message.channel_id)
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

      return mapCreatedReply((result.rows[0] ?? null) as CreatedReplyRow | null);
    });
  }
}
