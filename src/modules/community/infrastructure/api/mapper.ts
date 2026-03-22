import type { CommunityPost } from "@/src/modules/community/domain/entities/community-post";

import type { CommunityPostDto } from "./dto/community-post-dto";

export function mapCommunityPostDtoToEntity(dto: CommunityPostDto): CommunityPost {
  return {
    id: dto.id,
    title: dto.title,
    excerpt: dto.excerpt,
    replyCount: dto.replyCount,
    publishedAt: dto.publishedAt,
    author: {
      id: dto.author.id,
      name: dto.author.name,
      role: dto.author.role,
      avatarFallback: dto.author.avatarFallback,
    },
  };
}
