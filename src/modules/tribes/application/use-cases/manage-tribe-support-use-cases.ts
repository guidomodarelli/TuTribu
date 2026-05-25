import type { TribeSupportSettingsResult } from "@/src/modules/tribes/application/results/tribe-support-result";
import type {
  GetTribeSupportQuery,
  SaveTribeSupportCommand,
  TribeSupportRepository,
  TribeSupportSaveResult,
} from "@/src/modules/tribes/domain/repositories/tribe-support-repository";

type TribeSupportDependencies = {
  tribeSupportRepository: TribeSupportRepository;
};

function normalizeText(value: string): string {
  return value.trim();
}

function normalizeNullableText(value: string | null): string | null {
  const normalizedValue = value?.trim() ?? "";

  return normalizedValue.length > 0 ? normalizedValue : null;
}

export function getTribeSupport({
  tribeSupportRepository,
}: TribeSupportDependencies) {
  return async (
    query: GetTribeSupportQuery
  ): Promise<TribeSupportSettingsResult | null> =>
    tribeSupportRepository.getByTribeSlug({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

export function saveTribeSupport({
  tribeSupportRepository,
}: TribeSupportDependencies) {
  return async (
    command: SaveTribeSupportCommand
  ): Promise<TribeSupportSaveResult> =>
    tribeSupportRepository.save({
      channel: command.channel,
      message: normalizeNullableText(command.message),
      phoneNumber: normalizeText(command.phoneNumber),
      tribeSlug: normalizeText(command.tribeSlug),
    });
}
