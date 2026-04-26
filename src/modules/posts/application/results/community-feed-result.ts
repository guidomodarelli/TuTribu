import type {
  POST_AUTHOR_ROLE,
  POST_MEMBERSHIP_STATUS,
} from "@/src/modules/posts/constants/post-feed";

export type PostAuthorRole =
  (typeof POST_AUTHOR_ROLE)[keyof typeof POST_AUTHOR_ROLE];

export type PostMembershipStatus =
  (typeof POST_MEMBERSHIP_STATUS)[keyof typeof POST_MEMBERSHIP_STATUS];

export type CommunityFeedAuthorResult = {
  avatarFallback: string;
  id: string;
  image: string | null;
  name: string;
  role: PostAuthorRole;
};

export type CommunityFeedCommentResult = {
  author: CommunityFeedAuthorResult;
  content: string;
  createdAt: string;
  id: string;
};

export type CommunityFeedPostResult = {
  author: CommunityFeedAuthorResult;
  comments: CommunityFeedCommentResult[];
  content: string;
  createdAt: string;
  id: string;
  likedByViewer: boolean;
  likeCount: number;
};

export type CommunityFeedPermissionsResult = {
  canComment: boolean;
  canCreatePost: boolean;
  canReact: boolean;
};

export type CommunityFeedResult = {
  posts: CommunityFeedPostResult[];
  viewerPermissions: CommunityFeedPermissionsResult;
};
