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

export type TribePostCategoryResult = {
  accessScope: PostCategoryAccessScope;
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
  category: TribePostCategoryResult;
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
  activeCategoryId: string | null;
  categories: TribePostCategoryResult[];
  posts: TribeFeedPostResult[];
  viewerPermissions: TribeFeedPermissionsResult;
};
