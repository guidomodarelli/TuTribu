import type { MemberProfile } from "@/src/features/members/types";

export type CommunityPostSummary = {
  id: string;
  title: string;
  excerpt: string;
  replyCount: number;
  publishedAt: string;
  author: MemberProfile;
};
