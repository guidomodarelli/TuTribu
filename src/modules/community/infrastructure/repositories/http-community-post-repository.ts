import type { CommunityPost } from "@/src/modules/community/domain/entities/community-post";
import type { CommunityPostRepository } from "@/src/modules/community/domain/repositories/community-post-repository";

import { COMMUNITY_V1_ENDPOINTS } from "../api/contracts/v1";
import { parseCommunityPostsResponseDto } from "../api/dto/community-post-dto";
import { mapCommunityPostDtoToEntity } from "../api/mapper";

type HttpResponse = {
  ok: boolean;
  json(): Promise<unknown>;
};

type HttpFetcher = (input: string, init?: RequestInit) => Promise<HttpResponse>;

export class HttpCommunityPostRepository implements CommunityPostRepository {
  constructor(
    private readonly backendBaseUrl: string,
    private readonly fetcher: HttpFetcher = fetch as unknown as HttpFetcher
  ) {}

  async listCommunityPosts(): Promise<CommunityPost[]> {
    const response = await this.fetcher(
      `${this.backendBaseUrl}${COMMUNITY_V1_ENDPOINTS.listPosts}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch community posts");
    }

    const payload = await response.json();
    const parsed = parseCommunityPostsResponseDto(payload);

    return parsed.items.map(mapCommunityPostDtoToEntity);
  }
}
