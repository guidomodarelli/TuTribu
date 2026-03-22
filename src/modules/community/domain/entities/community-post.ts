import type { MemberProfile } from "@/src/modules/shared/domain/entities/member-profile";

export type CommunityPost = {
  id: string;
  title: string;
  excerpt: string;
  replyCount: number;
  publishedAt: string;
  author: MemberProfile;
};
