import {
  COMMUNITY_POST_CONTENT,
  COMMUNITY_POST_TITLE,
  POST_MUTATION_STATUS,
} from "@/src/modules/posts/constants/post-feed";
import type { CreateCommunityPostCommand } from "@/src/modules/posts/application/commands/community-post-command";
import type { PostCreationResult } from "@/src/modules/posts/application/results/post-mutation-result";
import type { PostCreationRepository } from "@/src/modules/posts/domain/repositories/post-creation-repository";

type CreateCommunityPostDependencies = {
  postCreationRepository: PostCreationRepository;
};

function normalizePostContent(content: string): string {
  return content.trim();
}

function normalizePostTitle(title: string): string {
  return title.trim();
}

function isInvalidText(value: string, limits: { maxLength: number; minLength: number }): boolean {
  return (
    value.length < limits.minLength ||
    value.length > limits.maxLength
  );
}

export function createCommunityPost({
  postCreationRepository,
}: CreateCommunityPostDependencies) {
  return async (
    command: CreateCommunityPostCommand
  ): Promise<PostCreationResult> => {
    const content = normalizePostContent(command.content);
    const title = normalizePostTitle(command.title);
    const categoryId = command.categoryId.trim();

    if (
      isInvalidText(content, COMMUNITY_POST_CONTENT) ||
      isInvalidText(title, COMMUNITY_POST_TITLE)
    ) {
      return {
        status: POST_MUTATION_STATUS.invalidContent,
      };
    }

    if (!categoryId) {
      return {
        status: POST_MUTATION_STATUS.invalidCategory,
      };
    }

    return postCreationRepository.create({
      ...command,
      categoryId,
      communitySlug: command.communitySlug.trim(),
      content,
      title,
    });
  };
}
