import {
  TRIBE_POST_CONTENT,
  TRIBE_POST_TITLE,
  POST_MUTATION_STATUS,
} from "@/src/modules/posts/constants/post-feed";
import type { CreateTribePostCommand } from "@/src/modules/posts/application/commands/tribe-post-command";
import type { PostCreationResult } from "@/src/modules/posts/application/results/post-mutation-result";
import type { PostCreationRepository } from "@/src/modules/posts/domain/repositories/post-creation-repository";

type CreateTribePostDependencies = {
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

export function createTribePost({
  postCreationRepository,
}: CreateTribePostDependencies) {
  return async (
    command: CreateTribePostCommand
  ): Promise<PostCreationResult> => {
    const content = normalizePostContent(command.content);
    const title = normalizePostTitle(command.title);
    const channelId = command.channelId.trim();

    if (
      isInvalidText(content, TRIBE_POST_CONTENT) ||
      isInvalidText(title, TRIBE_POST_TITLE)
    ) {
      return {
        status: POST_MUTATION_STATUS.invalidContent,
      };
    }

    if (!channelId) {
      return {
        status: POST_MUTATION_STATUS.invalidChannel,
      };
    }

    return postCreationRepository.create({
      ...command,
      channelId,
      tribeSlug: command.tribeSlug.trim(),
      content,
      title,
    });
  };
}
