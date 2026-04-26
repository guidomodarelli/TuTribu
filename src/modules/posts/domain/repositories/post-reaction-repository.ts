import type { TogglePostLikeCommand } from "@/src/modules/posts/application/commands/community-post-command";
import type { PostLikeToggleResult } from "@/src/modules/posts/application/results/post-mutation-result";

export interface PostReactionRepository {
  toggle(command: TogglePostLikeCommand): Promise<PostLikeToggleResult>;
}
