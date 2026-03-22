import { parseCommunityPostsResponseDto } from "@/src/modules/community/infrastructure/api/dto/community-post-dto";

describe("parseCommunityPostsResponseDto", () => {
  it("throws when payload does not include items array", () => {
    expect(() => parseCommunityPostsResponseDto({})).toThrow(
      "Invalid community posts payload"
    );
  });

  it("throws when any item has invalid author shape", () => {
    expect(() =>
      parseCommunityPostsResponseDto({
        items: [
          {
            id: "post-1",
            title: "Weekly wins",
            excerpt: "Checkpoint",
            replyCount: 3,
            publishedAt: "Monday, March 17",
            author: {
              id: "member-1",
              name: "Sofia",
              role: "Host",
            },
          },
        ],
      })
    ).toThrow("Invalid community post item payload");
  });
});
