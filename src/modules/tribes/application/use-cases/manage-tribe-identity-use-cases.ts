import type { TribeIdentityResult } from "@/src/modules/tribes/application/results/tribe-identity-result";
import type {
  GetTribeIdentityQuery,
  SaveTribeIdentityCommand,
  TribeIdentityRepository,
  TribeIdentitySaveResult,
} from "@/src/modules/tribes/domain/repositories/tribe-identity-repository";
import {
  normalizeNullableText,
  normalizeText,
} from "@/src/modules/shared/application/validation/text-normalization";

type TribeIdentityDependencies = {
  tribeIdentityRepository: TribeIdentityRepository;
};

export function getTribeIdentity({
  tribeIdentityRepository,
}: TribeIdentityDependencies) {
  return async (
    query: GetTribeIdentityQuery
  ): Promise<TribeIdentityResult | null> =>
    tribeIdentityRepository.getByTribeSlug({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

export function saveTribeIdentity({
  tribeIdentityRepository,
}: TribeIdentityDependencies) {
  return async (
    command: SaveTribeIdentityCommand
  ): Promise<TribeIdentitySaveResult> =>
    tribeIdentityRepository.save({
      coverUrl: normalizeNullableText(command.coverUrl),
      logoUrl: normalizeNullableText(command.logoUrl),
      tribeSlug: normalizeText(command.tribeSlug),
    });
}
