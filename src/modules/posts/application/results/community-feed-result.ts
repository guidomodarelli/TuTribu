import type {
  POST_AUTHOR_ROLE,
  POST_CATEGORY_ACCESS_SCOPE,
  POST_MEMBERSHIP_STATUS,
} from "@/src/modules/posts/constants/post-feed";

export type PostAuthorRole =
  (typeof POST_AUTHOR_ROLE)[keyof typeof POST_AUTHOR_ROLE];

export type PostMembershipStatus =
  (typeof POST_MEMBERSHIP_STATUS)[keyof typeof POST_MEMBERSHIP_STATUS];

export type PostCategoryAccessScope =
  (typeof POST_CATEGORY_ACCESS_SCOPE)[keyof typeof POST_CATEGORY_ACCESS_SCOPE];

export type CommunityPostCategoryResult = {
  accessScope: PostCategoryAccessScope;
  emoji: string;
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
};

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
  category: CommunityPostCategoryResult;
  comments: CommunityFeedCommentResult[];
  content: string;
  createdAt: string;
  id: string;
  likedByViewer: boolean;
  likeCount: number;
  title: string | null;
};

export type CommunityFeedPermissionsResult = {
  canComment: boolean;
  canCreatePost: boolean;
  canReact: boolean;
};

export type CommunityFeedResult = {
  activeCategoryId: string | null;
  categories: CommunityPostCategoryResult[];
  posts: CommunityFeedPostResult[];
  viewerPermissions: CommunityFeedPermissionsResult;
};
