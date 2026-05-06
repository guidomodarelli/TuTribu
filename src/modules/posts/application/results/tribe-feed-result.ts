import type {
  POST_AUTHOR_ROLE,
  TRIBE_CHANNEL_ACCESS_SCOPE,
  POST_MEMBERSHIP_STATUS,
} from "@/src/modules/posts/constants/post-feed";

export type PostAuthorRole =
  (typeof POST_AUTHOR_ROLE)[keyof typeof POST_AUTHOR_ROLE];

export type PostMembershipStatus =
  (typeof POST_MEMBERSHIP_STATUS)[keyof typeof POST_MEMBERSHIP_STATUS];

export type TribeChannelAccessScope =
  (typeof TRIBE_CHANNEL_ACCESS_SCOPE)[keyof typeof TRIBE_CHANNEL_ACCESS_SCOPE];

export type TribeChannelResult = {
  accessScope: TribeChannelAccessScope;
  emoji: string;
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
};

export type TribeFeedAuthorResult = {
  avatarFallback: string;
  id: string;
  image: string | null;
  name: string;
  role: PostAuthorRole;
};

export type TribeFeedCommentResult = {
  author: TribeFeedAuthorResult;
  content: string;
  createdAt: string;
  id: string;
};

export type TribeFeedPostResult = {
  author: TribeFeedAuthorResult;
  channel: TribeChannelResult;
  comments: TribeFeedCommentResult[];
  content: string;
  createdAt: string;
  id: string;
  likedByViewer: boolean;
  likeCount: number;
  title: string | null;
};

export type TribeFeedPermissionsResult = {
  canComment: boolean;
  canCreatePost: boolean;
  canReact: boolean;
};

export type TribeFeedResult = {
  activeChannelId: string | null;
  channels: TribeChannelResult[];
  posts: TribeFeedPostResult[];
  viewerPermissions: TribeFeedPermissionsResult;
};
