import type {
  JoinTribeFreeCommand,
  TribeFreeJoinRepository,
  TribeFreeJoinResult,
} from "@/src/modules/tribes/domain/repositories/tribe-free-join-repository";

type TribeFreeJoinDependencies = {
  tribeFreeJoinRepository: TribeFreeJoinRepository;
};

function normalizeText(value: string): string {
  return value.trim();
}

export function joinTribeFree({
  tribeFreeJoinRepository,
}: TribeFreeJoinDependencies) {
  return async (command: JoinTribeFreeCommand): Promise<TribeFreeJoinResult> =>
    tribeFreeJoinRepository.join({
      tribeSlug: normalizeText(command.tribeSlug),
    });
}
