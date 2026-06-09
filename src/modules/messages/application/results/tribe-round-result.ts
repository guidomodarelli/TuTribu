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
  /**
   * Persisted preview/thumbnail URL resolved through the provider's oEmbed
   * endpoint. Absent for YouTube (whose thumbnail is derived deterministically
   * from the id) and `null` until a lazy resolution has run for the others.
   */
  thumbnailUrl?: string | null;
  /**
   * Whether thumbnail resolution for this video has reached a terminal state:
   * a thumbnail was found, or the lazy backfill gave up after exhausting its
   * retry attempts (private, deleted, or persistently failing). A miss that is
   * still within its retry budget keeps this `false` so the backfill picks the
   * video up again on a later render, without re-fetching on every render.
   */
  thumbnailResolved?: boolean;
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

/**
 * A file attachment of a message, projected for the downloads list rendered
 * under the message body. The binary lives in R2 and is reachable only through
 * the authorized download route, so no storage URL is ever exposed here.
 */
export type MessageFileResult = {
  fileName: string;
  fileSizeBytes: number;
  id: string;
  mimeType: string;
  sortOrder: number;
};

export type TribeRoundMessagePermissionsResult = {
  canDelete: boolean;
  canEdit: boolean;
};

export type TribeRoundSharedMessageResult = {
  author: TribeRoundAuthorResult;
  channel: TribeChannelResult;
  content: string;
  createdAt: string;
  files?: MessageFileResult[];
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
