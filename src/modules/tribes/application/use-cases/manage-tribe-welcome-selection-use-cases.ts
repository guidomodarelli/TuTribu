import type {
  ListTribeWelcomeSelectionsQuery,
  RecordTribeWelcomeSelectionCommand,
  TribeWelcomeSelectionRepository,
} from "@/src/modules/tribes/domain/repositories/tribe-welcome-selection-repository";

type TribeWelcomeSelectionDependencies = {
  tribeWelcomeSelectionRepository: TribeWelcomeSelectionRepository;
};

function normalizeText(value: string): string {
  return value.trim();
}

export function recordTribeWelcomeSelection({
  tribeWelcomeSelectionRepository,
}: TribeWelcomeSelectionDependencies) {
  return async (command: RecordTribeWelcomeSelectionCommand) =>
    tribeWelcomeSelectionRepository.record({
      tribeSlug: normalizeText(command.tribeSlug),
      welcomeLinkId: normalizeText(command.welcomeLinkId),
    });
}

export function listTribeWelcomeSelections({
  tribeWelcomeSelectionRepository,
}: TribeWelcomeSelectionDependencies) {
  return async (query: ListTribeWelcomeSelectionsQuery) =>
    tribeWelcomeSelectionRepository.listByTribeSlug({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

export function listCurrentMemberTribeWelcomeSelections({
  tribeWelcomeSelectionRepository,
}: TribeWelcomeSelectionDependencies) {
  return async (query: ListTribeWelcomeSelectionsQuery) =>
    tribeWelcomeSelectionRepository.listByTribeSlugForCurrentMember({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}
