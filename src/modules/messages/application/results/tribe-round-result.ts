import type {
  MESSAGE_AUTHOR_ROLE,
  MESSAGE_MEDIA_KIND,
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
  totalVoteCount: number;
  viewerHasVoted: boolean;
};

export type MessageVideoResult = {
  externalId: string;
  provider: VideoProvider;
};

export type MessageImageResult = {
  altText: string;
  id: string;
  url: string;
};

/**
 * A single media attachment of a message, projected for the unified gallery.
 *
 * Images and external videos share one global `sortOrder` slot space, so the
 * UI can render every attachment in the exact order the author arranged them.
 */
export type MessageMediaResult =
  | ({
      kind: typeof MESSAGE_MEDIA_KIND.image;
      sortOrder: number;
    } & MessageImageResult)
  | ({
      id: string;
      kind: typeof MESSAGE_MEDIA_KIND.video;
      sortOrder: number;
    } & MessageVideoResult);

export type TribeRoundMessagePermissionsResult = {
  canDelete: boolean;
  canEdit: boolean;
};

export type TribeRoundSharedMessageResult = {
  author: TribeRoundAuthorResult;
  channel: TribeChannelResult;
  content: string;
  createdAt: string;
  id: string;
  isPinned?: boolean;
  likeCount: number;
  media?: MessageMediaResult[];
  permissions?: TribeRoundMessagePermissionsResult;
  pinnedAt?: string | null;
  poll?: MessagePollResult | null;
  replyAuthorsPreview?: TribeRoundAuthorResult[];
  replyCount: number;
  title: string | null;
};

export type TribeRoundMessageResult = TribeRoundSharedMessageResult & {
  hasLoadedReplies?: boolean;
  likedByViewer: boolean;
  replies: TribeRoundReplyResult[];
};

export type TribeRoundPermissionsResult = {
  canReply: boolean;
  canCreateMessage: boolean;
  canEditMessageCreatedAt?: boolean;
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

export type MessageLikerResult = TribeRoundAuthorResult;

export type TribeRoundLikersResult =
  | {
      likers: MessageLikerResult[];
      status: "found";
      totalCount: number;
    }
  | {
      status: "forbidden" | "not_found";
    };
