import { COMMUNITY_POST_CONTENT, POST_MUTATION_STATUS } from "@/src/modules/posts/constants/post-feed";
import type { CreateCommunityPostCommand } from "@/src/modules/posts/application/commands/community-post-command";
import type { PostCreationResult } from "@/src/modules/posts/application/results/post-mutation-result";
import type { PostCreationRepository } from "@/src/modules/posts/domain/repositories/post-creation-repository";

type CreateCommunityPostDependencies = {
  postCreationRepository: PostCreationRepository;
};

function normalizePostContent(content: string): string {
  return content.trim();
}

function isInvalidPostContent(content: string): boolean {
  return (
    content.length < COMMUNITY_POST_CONTENT.minLength ||
    content.length > COMMUNITY_POST_CONTENT.maxLength
  );
}

export function createCommunityPost({
  postCreationRepository,
}: CreateCommunityPostDependencies) {
  return async (
    command: CreateCommunityPostCommand
  ): Promise<PostCreationResult> => {
    const content = normalizePostContent(command.content);

    if (isInvalidPostContent(content)) {
      return {
        status: POST_MUTATION_STATUS.invalidContent,
      };
    }

    return postCreationRepository.create({
      ...command,
      communitySlug: command.communitySlug.trim(),
      content,
    });
  };
}
