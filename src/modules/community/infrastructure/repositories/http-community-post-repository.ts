import type { CommunityPost } from "@/src/modules/community/domain/entities/community-post";
import type { CommunityPostRepository } from "@/src/modules/community/domain/repositories/community-post-repository";
import {
  fetchWithResilience,
  type FetchResilienceOptions,
  type HttpFetcher,
} from "@/src/modules/shared/infrastructure/http/fetch-with-resilience";

import { COMMUNITY_V1_ENDPOINTS } from "../api/contracts/v1";
import { parseCommunityPostsResponseDto } from "../api/dto/community-post-dto";
import { mapCommunityPostDtoToEntity } from "../api/mapper";

export class HttpCommunityPostRepository implements CommunityPostRepository {
  constructor(
    private readonly backendBaseUrl: string,
    private readonly fetcher: HttpFetcher = fetch as unknown as HttpFetcher,
    private readonly resilienceOptions?: Partial<FetchResilienceOptions>
  ) {}

  async listCommunityPosts(): Promise<CommunityPost[]> {
    const response = await fetchWithResilience(
      this.fetcher,
      `${this.backendBaseUrl}${COMMUNITY_V1_ENDPOINTS.listPosts}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
      this.resilienceOptions
    );

    if (!response.ok) {
      throw new Error("Failed to fetch community posts");
    }

    const payload = await response.json();
    const parsed = parseCommunityPostsResponseDto(payload);

    return parsed.items.map(mapCommunityPostDtoToEntity);
  }
}
