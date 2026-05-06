import type { Tribe } from "@/src/modules/tribes/domain/entities/tribe";

export interface TribeCreationRepository {
  createTribeWithLeaderMembership(input: {
    name: string;
    leaderId: string;
    slug: string;
    visibility: "private";
  }): Promise<Tribe>;
  isSlugTaken(slug: string): Promise<boolean>;
}
