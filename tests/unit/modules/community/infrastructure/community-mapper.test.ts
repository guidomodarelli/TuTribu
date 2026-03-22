import { mapCommunityPostDtoToEntity } from "@/src/modules/community/infrastructure/api/mapper";

describe("mapCommunityPostDtoToEntity", () => {
  it("maps community DTO payload into domain entity", () => {
    const result = mapCommunityPostDtoToEntity({
      id: "post-1",
      title: "Weekly wins",
      excerpt: "Checkpoint",
      replyCount: 3,
      publishedAt: "Monday, March 17",
      author: {
        id: "member-1",
        name: "Sofia",
        role: "Host",
        avatarFallback: "SF",
      },
    });

    expect(result).toEqual({
      id: "post-1",
      title: "Weekly wins",
      excerpt: "Checkpoint",
      replyCount: 3,
      publishedAt: "Monday, March 17",
      author: {
        id: "member-1",
        name: "Sofia",
        role: "Host",
        avatarFallback: "SF",
      },
    });
  });
});
