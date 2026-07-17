import type {
  TouchTribePresenceCommand,
  TribePresenceRepository,
} from "@/src/modules/tribes/domain/repositories/tribe-presence-repository";

type TribePresenceDependencies = {
  tribePresenceRepository: TribePresenceRepository;
};

function normalizeText(value: string): string {
  return value.trim();
}

export function touchTribePresence({
  tribePresenceRepository,
}: TribePresenceDependencies) {
  return async (command: TouchTribePresenceCommand): Promise<boolean> =>
    tribePresenceRepository.touchByTribeSlug({
      tribeSlug: normalizeText(command.tribeSlug),
    });
}
