import type { Tribe } from "@/src/modules/tribes/domain/entities/tribe";

export interface TribeCreationRepository {
  createTribeWithOwnerMembership(input: {
    name: string;
    ownerId: string;
    slug: string;
    visibility: "private";
  }): Promise<Tribe>;
  isSlugTaken(slug: string): Promise<boolean>;
}
