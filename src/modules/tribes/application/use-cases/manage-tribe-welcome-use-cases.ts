import type {
  GetTribeWelcomeByInvitationQuery,
  GetTribeWelcomeQuery,
  SaveTribeWelcomeCommand,
  TribeWelcomeRepository,
} from "@/src/modules/tribes/domain/repositories/tribe-welcome-repository";

type TribeWelcomeDependencies = {
  tribeWelcomeRepository: TribeWelcomeRepository;
};

function normalizeText(value: string): string {
  return value.trim();
}

function normalizeNullableText(value: string | null): string | null {
  const normalizedValue = value?.trim() ?? "";

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeRule(rule: SaveTribeWelcomeCommand["rules"][number]) {
  return {
    id: normalizeText(rule.id),
    isActive: rule.isActive,
    label: normalizeText(rule.label),
    sortOrder: rule.sortOrder,
  };
}

function normalizeLink(link: SaveTribeWelcomeCommand["links"][number]) {
  return {
    badgeLabel: normalizeText(link.badgeLabel),
    description: normalizeNullableText(link.description),
    id: normalizeText(link.id),
    isActive: link.isActive,
    label: normalizeText(link.label),
    message: normalizeNullableText(link.message),
    phoneNumber: normalizeNullableText(link.phoneNumber),
    sortOrder: link.sortOrder,
    type: link.type,
    url: normalizeNullableText(link.url),
  };
}

export function getTribeWelcome({
  tribeWelcomeRepository,
}: TribeWelcomeDependencies) {
  return async (query: GetTribeWelcomeQuery) =>
    tribeWelcomeRepository.getByTribeSlug({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

export function getEditableTribeWelcome({
  tribeWelcomeRepository,
}: TribeWelcomeDependencies) {
  return async (query: GetTribeWelcomeQuery) =>
    tribeWelcomeRepository.getEditableByTribeSlug({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

export function getTribeWelcomeByInvitation({
  tribeWelcomeRepository,
}: TribeWelcomeDependencies) {
  return async (query: GetTribeWelcomeByInvitationQuery) =>
    tribeWelcomeRepository.getByInvitation({
      token: normalizeText(query.token),
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

export function saveTribeWelcome({
  tribeWelcomeRepository,
}: TribeWelcomeDependencies) {
  return async (command: SaveTribeWelcomeCommand) =>
    tribeWelcomeRepository.save({
    links: command.links.map(normalizeLink),
    rules: command.rules.map(normalizeRule),
    tribeSlug: normalizeText(command.tribeSlug),
    welcomeMessage: normalizeText(command.welcomeMessage),
  });
}
