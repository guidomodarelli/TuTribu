import type { CreatePostCommentCommand } from "@/src/modules/posts/application/commands/community-post-command";
import type { PostCommentCreationResult } from "@/src/modules/posts/application/results/post-mutation-result";

export interface PostCommentRepository {
  create(command: CreatePostCommentCommand): Promise<PostCommentCreationResult>;
}
