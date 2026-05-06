import type { CreateTribePostCommand } from "@/src/modules/posts/application/commands/tribe-post-command";
import type { PostCreationResult } from "@/src/modules/posts/application/results/post-mutation-result";

export interface PostCreationRepository {
  create(command: CreateTribePostCommand): Promise<PostCreationResult>;
}
