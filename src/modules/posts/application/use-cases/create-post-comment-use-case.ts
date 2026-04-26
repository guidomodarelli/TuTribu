import { POST_COMMENT_CONTENT, POST_MUTATION_STATUS } from "@/src/modules/posts/constants/post-feed";
import type { CreatePostCommentCommand } from "@/src/modules/posts/application/commands/community-post-command";
import type { PostCommentCreationResult } from "@/src/modules/posts/application/results/post-mutation-result";
import type { PostCommentRepository } from "@/src/modules/posts/domain/repositories/post-comment-repository";

type CreatePostCommentDependencies = {
  postCommentRepository: PostCommentRepository;
};

function normalizeCommentContent(content: string): string {
  return content.trim();
}

function isInvalidCommentContent(content: string): boolean {
  return (
    content.length < POST_COMMENT_CONTENT.minLength ||
    content.length > POST_COMMENT_CONTENT.maxLength
  );
}

export function createPostComment({
  postCommentRepository,
}: CreatePostCommentDependencies) {
  return async (
    command: CreatePostCommentCommand
  ): Promise<PostCommentCreationResult> => {
    const content = normalizeCommentContent(command.content);

    if (isInvalidCommentContent(content)) {
      return {
        status: POST_MUTATION_STATUS.invalidContent,
      };
    }

    return postCommentRepository.create({
      ...command,
      communitySlug: command.communitySlug.trim(),
      content,
    });
  };
}
