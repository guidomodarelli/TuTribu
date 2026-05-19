import type { ColumnType, Generated } from "kysely";

type TimestampColumn = ColumnType<Date, Date | string | undefined, Date | string>;

type TribeCreatorWhitelistTable = {
  created_at: TimestampColumn;
  created_by: string | null;
  email: string;
  id: Generated<string>;
  notes: string | null;
};

type TribesTable = {
  created_by: string;
  created_at: TimestampColumn;
  id: Generated<string>;
  name: string;
  slug: string;
  visibility: string;
};

type TribeInvitationsTable = {
  created_at: TimestampColumn;
  created_by: string;
  id: string;
  revoked_at: TimestampColumn | null;
  status: string;
  token_hash: string;
  tribe_id: string;
};

type TribeMembersTable = {
  created_at: TimestampColumn;
  id: Generated<string>;
  role: string;
  status: string;
  status_reason: ColumnType<string, string | undefined, string>;
  tribe_id: string;
  user_id: string;
};

type TribeSubscriptionPricesTable = {
  amount_cents: number;
  currency: string;
  frequency: string;
  id: Generated<string>;
  is_current: boolean;
  mercado_pago_preapproval_plan_id: string | null;
  name: string;
  status: string;
  tribe_id: string;
};

type TribeChannelsTable = {
  access_scope: string;
  created_at: TimestampColumn;
  emoji: string;
  id: Generated<string>;
  name: string;
  slug: string;
  sort_order: number;
  tribe_id: string;
  updated_at: TimestampColumn;
};

type MessagesTable = {
  author_id: string;
  channel_id: string;
  content: string;
  created_at: TimestampColumn;
  id: Generated<string>;
  title: string | null;
  tribe_id: string;
  updated_at: TimestampColumn;
};

type MessageRepliesTable = {
  author_id: string;
  content: string;
  created_at: TimestampColumn;
  id: Generated<string>;
  message_id: string;
  tribe_id: string;
};

type MessageReactionsTable = {
  created_at: TimestampColumn;
  id: Generated<string>;
  message_id: string;
  tribe_id: string;
  type: string;
  user_id: string;
};

type MessagePinsTable = {
  message_id: string;
  pinned_at: TimestampColumn;
  pinned_by: string;
  tribe_id: string;
};

type MessagePollsTable = {
  allow_multiple_votes: boolean;
  created_at: TimestampColumn;
  id: Generated<string>;
  message_id: string;
  question: string;
  status: string;
  tribe_id: string;
  updated_at: TimestampColumn;
};

type MessagePollOptionsTable = {
  created_at: TimestampColumn;
  id: Generated<string>;
  poll_id: string;
  sort_order: number;
  text: string;
  tribe_id: string;
};

type MessagePollVotesTable = {
  created_at: TimestampColumn;
  id: Generated<string>;
  option_id: string;
  poll_id: string;
  tribe_id: string;
  user_id: string;
};

type EventsTable = {
  created_at: TimestampColumn;
  created_by: string;
  description: string | null;
  ends_at: TimestampColumn | null;
  id: Generated<string>;
  meeting_url: string | null;
  starts_at: TimestampColumn;
  title: string;
  tribe_id: string;
  updated_at: TimestampColumn;
};

type UsersTable = {
  createdAt: TimestampColumn;
  email: string;
  emailVerified: boolean;
  id: string;
  image: string | null;
  name: string;
  updatedAt: TimestampColumn;
};

export type KyselyRequestDatabaseSchema = {
  events: EventsTable;
  message_pins: MessagePinsTable;
  message_poll_options: MessagePollOptionsTable;
  message_poll_votes: MessagePollVotesTable;
  message_polls: MessagePollsTable;
  message_reactions: MessageReactionsTable;
  message_replies: MessageRepliesTable;
  messages: MessagesTable;
  tribe_creator_whitelist: TribeCreatorWhitelistTable;
  tribe_channels: TribeChannelsTable;
  tribe_invitations: TribeInvitationsTable;
  tribe_members: TribeMembersTable;
  tribe_subscription_prices: TribeSubscriptionPricesTable;
  tribes: TribesTable;
  user: UsersTable;
};
