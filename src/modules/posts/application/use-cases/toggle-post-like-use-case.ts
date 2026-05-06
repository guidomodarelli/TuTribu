import type { TogglePostLikeCommand } from "@/src/modules/posts/application/commands/tribe-post-command";
import type { PostLikeToggleResult } from "@/src/modules/posts/application/results/post-mutation-result";
import type { PostReactionRepository } from "@/src/modules/posts/domain/repositories/post-reaction-repository";

type TogglePostLikeDependencies = {
  postReactionRepository: PostReactionRepository;
};

export function togglePostLike({
  postReactionRepository,
}: TogglePostLikeDependencies) {
  return async (
    command: TogglePostLikeCommand
  ): Promise<PostLikeToggleResult> =>
    postReactionRepository.toggle({
      ...command,
      tribeSlug: command.tribeSlug.trim(),
    });
}
