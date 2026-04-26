import { createCommunityPost } from "@/src/modules/posts/application/use-cases/create-community-post-use-case";
import { createPostComment } from "@/src/modules/posts/application/use-cases/create-post-comment-use-case";
import { listCommunityFeed } from "@/src/modules/posts/application/use-cases/list-community-feed-use-case";
import { togglePostLike } from "@/src/modules/posts/application/use-cases/toggle-post-like-use-case";
import type { PostCommentRepository } from "@/src/modules/posts/domain/repositories/post-comment-repository";
import type { PostCreationRepository } from "@/src/modules/posts/domain/repositories/post-creation-repository";
import type { PostFeedReadRepository } from "@/src/modules/posts/domain/repositories/post-feed-read-repository";
import type { PostReactionRepository } from "@/src/modules/posts/domain/repositories/post-reaction-repository";

type PostsModuleDependencies = {
  postCommentRepository: PostCommentRepository;
  postCreationRepository: PostCreationRepository;
  postFeedReadRepository: PostFeedReadRepository;
  postReactionRepository: PostReactionRepository;
};

export function buildPostsModule({
  postCommentRepository,
  postCreationRepository,
  postFeedReadRepository,
  postReactionRepository,
}: PostsModuleDependencies) {
  return {
    useCases: {
      createCommunityPost: createCommunityPost({ postCreationRepository }),
      createPostComment: createPostComment({ postCommentRepository }),
      listCommunityFeed: listCommunityFeed({ postFeedReadRepository }),
      togglePostLike: togglePostLike({ postReactionRepository }),
    },
  };
}
