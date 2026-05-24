import type {
  MESSAGE_AUTHOR_ROLE,
  TRIBE_CHANNEL_ACCESS_SCOPE,
  MESSAGE_MEMBERSHIP_STATUS,
} from "@/src/modules/messages/constants/message-round";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";

export type MessageAuthorRole =
  (typeof MESSAGE_AUTHOR_ROLE)[keyof typeof MESSAGE_AUTHOR_ROLE];

export type MessageMembershipStatus =
  (typeof MESSAGE_MEMBERSHIP_STATUS)[keyof typeof MESSAGE_MEMBERSHIP_STATUS];

type TribeChannelAccessScope =
  (typeof TRIBE_CHANNEL_ACCESS_SCOPE)[keyof typeof TRIBE_CHANNEL_ACCESS_SCOPE];

export type TribeChannelResult = {
  accessScope: TribeChannelAccessScope;
  emoji: string;
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
};

export type TribeRoundAuthorResult = {
  avatarFallback: string;
  id: string;
  image: string | null;
  name: string;
  role: MessageAuthorRole;
};

export type TribeRoundReplyResult = {
  author: TribeRoundAuthorResult;
  content: string;
  createdAt: string;
  id: string;
};

export type MessagePollOptionResult = {
  id: string;
  percentage: number;
  selectedByViewer: boolean;
  text: string;
  voteCount: number;
};

export type MessagePollResult = {
  allowMultipleVotes: boolean;
  id: string;
  options: MessagePollOptionResult[];
  question: string;
  totalVoteCount: number;
  viewerHasVoted: boolean;
};

export type MessageVideoResult = {
  externalId: string;
  provider: VideoProvider;
};

export type TribeRoundMessagePermissionsResult = {
  canDelete: boolean;
};

export type TribeRoundSharedMessageResult = {
  author: TribeRoundAuthorResult;
  channel: TribeChannelResult;
  content: string;
  createdAt: string;
  id: string;
  isPinned?: boolean;
  likeCount: number;
  permissions?: TribeRoundMessagePermissionsResult;
  pinnedAt?: string | null;
  poll?: MessagePollResult | null;
  title: string | null;
  video?: MessageVideoResult | null;
};

export type TribeRoundMessageResult = TribeRoundSharedMessageResult & {
  hasLoadedReplies?: boolean;
  likedByViewer: boolean;
  replies: TribeRoundReplyResult[];
};

export type TribeRoundPermissionsResult = {
  canReply: boolean;
  canCreateMessage: boolean;
  canPinMessages?: boolean;
  canReact: boolean;
};

export type TribeRoundSharedDataResult = {
  activeChannelId: string | null;
  channels: TribeChannelResult[];
  messages: TribeRoundSharedMessageResult[];
  pagination: TribeRoundPaginationResult;
};

export type TribeRoundViewerStateResult = {
  likedMessageIds: string[];
  selectedPollOptionIds: string[];
  viewerId: string;
  viewerPermissions: TribeRoundPermissionsResult;
};

export type TribeRoundPaginationResult = {
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  pageSize: number;
};

export type TribeRoundResult = {
  activeChannelId: string | null;
  channels: TribeChannelResult[];
  messages: TribeRoundMessageResult[];
  pagination: TribeRoundPaginationResult;
  viewerPermissions: TribeRoundPermissionsResult;
};

export type TribeRoundRepliesResult =
  | {
      replies: TribeRoundReplyResult[];
      status: "found";
    }
  | {
      status: "forbidden" | "not_found";
    };
