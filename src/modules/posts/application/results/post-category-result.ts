import type { POST_CATEGORY_MUTATION_STATUS } from "@/src/modules/posts/constants/post-feed";
import type { CommunityPostCategoryResult } from "./community-feed-result";

export type PostCategoryMutationStatus =
  (typeof POST_CATEGORY_MUTATION_STATUS)[keyof typeof POST_CATEGORY_MUTATION_STATUS];

export type PostCategoryListResult = {
  categories: CommunityPostCategoryResult[];
};

export type PostCategoryCreationResult =
  | {
      category: CommunityPostCategoryResult;
      status: typeof POST_CATEGORY_MUTATION_STATUS.created;
    }
  | {
      status:
        | typeof POST_CATEGORY_MUTATION_STATUS.duplicateSlug
        | typeof POST_CATEGORY_MUTATION_STATUS.forbidden
        | typeof POST_CATEGORY_MUTATION_STATUS.invalidName
        | typeof POST_CATEGORY_MUTATION_STATUS.notFound;
    };

export type PostCategoryUpdateResult =
  | {
      category: CommunityPostCategoryResult;
      status: typeof POST_CATEGORY_MUTATION_STATUS.updated;
    }
  | {
      status:
        | typeof POST_CATEGORY_MUTATION_STATUS.duplicateSlug
        | typeof POST_CATEGORY_MUTATION_STATUS.forbidden
        | typeof POST_CATEGORY_MUTATION_STATUS.invalidName
        | typeof POST_CATEGORY_MUTATION_STATUS.notFound;
    };

export type PostCategoryDeletionResult = {
  status:
    | typeof POST_CATEGORY_MUTATION_STATUS.categoryHasPosts
    | typeof POST_CATEGORY_MUTATION_STATUS.deleted
    | typeof POST_CATEGORY_MUTATION_STATUS.forbidden
    | typeof POST_CATEGORY_MUTATION_STATUS.invalidCategory
    | typeof POST_CATEGORY_MUTATION_STATUS.lastCategory
    | typeof POST_CATEGORY_MUTATION_STATUS.movedAndDeleted
    | typeof POST_CATEGORY_MUTATION_STATUS.notFound;
};
