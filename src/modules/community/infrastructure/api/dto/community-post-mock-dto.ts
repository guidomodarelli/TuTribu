import type { CommunityPostDto } from "./community-post-dto";

export const communityPostMockDtos: CommunityPostDto[] = [
  {
    id: "post-weekly-wins",
    title: "Weekly wins and shipping notes",
    excerpt:
      "Members use this space to share what moved forward during the week and what still needs sharper execution.",
    replyCount: 18,
    publishedAt: "Monday, March 17",
    author: {
      id: "member-sofia",
      name: "Sofia Calderon",
      role: "Community Host",
      avatarFallback: "SC",
    },
  },
  {
    id: "post-course-feedback",
    title: "Feedback thread for the new launch module",
    excerpt:
      "A focused thread for improving pacing, examples, and implementation notes before the next cohort opens.",
    replyCount: 9,
    publishedAt: "Wednesday, March 19",
    author: {
      id: "member-ramiro",
      name: "Ramiro Velez",
      role: "Growth Mentor",
      avatarFallback: "RV",
    },
  },
  {
    id: "post-accountability",
    title: "Accountability checkpoints for builders",
    excerpt:
      "Members document the one commitment they will finish before the next office hours and why it matters now.",
    replyCount: 13,
    publishedAt: "Friday, March 21",
    author: {
      id: "member-valentina",
      name: "Valentina Arias",
      role: "Member",
      avatarFallback: "VA",
    },
  },
];
