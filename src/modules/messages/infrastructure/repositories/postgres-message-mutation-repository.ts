import { sql } from "drizzle-orm";

import type {
  CreateTribeMessageCommand,
  CreateMessageReplyCommand,
  ToggleMessageLikeCommand,
  ToggleMessagePinCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type {
  MessageReplyCreationResult,
  MessageCreationResult,
  MessageLikeToggleResult,
  MessagePinToggleResult,
} from "@/src/modules/messages/application/results/message-mutation-result";
import {
  MESSAGE_MUTATION_STATUS,
  MESSAGE_REACTION_TYPE,
  PINNED_TRIBE_MESSAGES_LIMIT,
} from "@/src/modules/messages/constants/message-round";
import type { MessageReplyRepository } from "@/src/modules/messages/domain/repositories/message-reply-repository";
import type { MessageCreationRepository } from "@/src/modules/messages/domain/repositories/message-creation-repository";
import type { MessageReactionRepository } from "@/src/modules/messages/domain/repositories/message-reaction-repository";
import type { MessagePinRepository } from "@/src/modules/messages/domain/repositories/message-pin-repository";
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
  implements MessageCreationRepository, MessageReplyRepository, MessageReactionRepository, MessagePinRepository
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
          likedByViewer: false,
          likeCount: 0,
          status: MESSAGE_MUTATION_STATUS.notFound,
        };
      }

      if (!targetMessage.can_write) {
        return {
          likedByViewer: false,
          likeCount: 0,
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
        likedByViewer: false,
        likeCount,
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
          isPinned: false,
          pinnedAt: null,
          status: MESSAGE_MUTATION_STATUS.notFound,
        };
      }

      if (!targetMessage.can_pin) {
        return {
          isPinned: targetMessage.is_pinned,
          pinnedAt: null,
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
          isPinned: false,
          pinnedAt: null,
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

  private async createMessage(
    command: CreateTribeMessageCommand
  ): Promise<MessageCreationResult> {
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
        inserted_message as (
          insert into public.messages (tribe_id, channel_id, author_id, title, content, created_at, updated_at)
          select target_tribe.id, target_channel.id, ${command.authorId}, ${command.title}, ${command.content}, timezone('utc', now()), timezone('utc', now())
          from target_tribe
          inner join target_channel
            on true
          where public.is_active_tribe_member(target_tribe.id)
          returning id, tribe_id, channel_id, author_id, title, content, created_at
        ),
        created_message as (
          select
            inserted_message.id as message_id,
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
        select
          case
            when exists (select 1 from inserted_message) then ${MESSAGE_MUTATION_STATUS.created}
            when not exists (select 1 from target_tribe) then ${MESSAGE_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_channel) then ${MESSAGE_MUTATION_STATUS.invalidChannel}
            else ${MESSAGE_MUTATION_STATUS.forbidden}
          end as status,
          created_message.message_id,
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
          created_message.author_role
        from (select 1) result
        left join created_message
          on true
      `);

      return mapCreatedMessage((result.rows?.[0] ?? null) as CreatedMessageRow | null);
    });
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
