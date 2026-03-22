export type CommunityPostAuthorDto = {
  id: string;
  name: string;
  role: string;
  avatarFallback: string;
};

export type CommunityPostDto = {
  id: string;
  title: string;
  excerpt: string;
  replyCount: number;
  publishedAt: string;
  author: CommunityPostAuthorDto;
};

export type CommunityPostsResponseDto = {
  items: CommunityPostDto[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCommunityPostAuthorDto(value: unknown): value is CommunityPostAuthorDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.role === "string" &&
    typeof value.avatarFallback === "string"
  );
}

function isCommunityPostDto(value: unknown): value is CommunityPostDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.excerpt === "string" &&
    typeof value.replyCount === "number" &&
    typeof value.publishedAt === "string" &&
    isCommunityPostAuthorDto(value.author)
  );
}

export function parseCommunityPostsResponseDto(
  payload: unknown
): CommunityPostsResponseDto {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("Invalid community posts payload");
  }

  if (!payload.items.every(isCommunityPostDto)) {
    throw new Error("Invalid community post item payload");
  }

  return {
    items: payload.items,
  };
}
