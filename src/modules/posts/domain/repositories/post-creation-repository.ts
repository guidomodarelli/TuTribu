import type { CreateCommunityPostCommand } from "@/src/modules/posts/application/commands/community-post-command";
import type { PostCreationResult } from "@/src/modules/posts/application/results/post-mutation-result";

export interface PostCreationRepository {
  create(command: CreateCommunityPostCommand): Promise<PostCreationResult>;
}
