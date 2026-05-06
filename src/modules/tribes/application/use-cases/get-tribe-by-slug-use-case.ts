import type { TribeReadRepository } from "@/src/modules/tribes/domain/repositories/tribe-read-repository";

import type { TribeResult } from "../results/tribe-result";

type GetTribeBySlugDependencies = {
  tribeReadRepository: TribeReadRepository;
};

export function getTribeBySlug({
  tribeReadRepository,
}: GetTribeBySlugDependencies) {
  return async ({ slug }: { slug: string }): Promise<TribeResult | null> => {
    return tribeReadRepository.findBySlug(slug.trim().toLowerCase());
  };
}
