import { ListCommunityPostsUseCase } from "@/src/modules/community/application/use-cases/list-community-posts-use-case";
import { resolveBackendBaseUrl } from "@/src/modules/shared/infrastructure/backend/backend-base-url";

import { HttpCommunityPostRepository } from "../repositories/http-community-post-repository";
import { MockCommunityPostRepository } from "../repositories/mock-community-post-repository";

export function createListCommunityPostsUseCase(): ListCommunityPostsUseCase {
  const backendBaseUrl = resolveBackendBaseUrl();

  if (backendBaseUrl) {
    return new ListCommunityPostsUseCase(
      new HttpCommunityPostRepository(backendBaseUrl)
    );
  }

  return new ListCommunityPostsUseCase(new MockCommunityPostRepository());
}
