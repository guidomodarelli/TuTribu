import type { CreateTribeCommand } from "@/src/modules/tribes/application/commands/create-tribe-command";
import {
  CREATE_TRIBE_ERROR_MESSAGE,
  CREATE_TRIBE_MEMBER_ROLE,
  CREATE_TRIBE_STATUS,
  type CreateTribeResult,
} from "@/src/modules/tribes/application/results/create-tribe-result";
import { TribeSlugConflictError } from "@/src/modules/tribes/domain/errors/tribe-slug-conflict-error";
import type { TribeCreationRepository } from "@/src/modules/tribes/domain/repositories/tribe-creation-repository";
import type { TribeCreatorWhitelistRepository } from "@/src/modules/tribes/domain/repositories/tribe-creator-whitelist-repository";
import {
  buildTribeSlugSuggestion,
  isReservedTribeSlug,
  normalizeTribeSlug,
} from "@/src/modules/tribes/domain/value-objects/tribe-slug";

const DEFAULT_TRIBE_VISIBILITY = "private" as const;
const INITIAL_SLUG_SUGGESTION_INDEX = 2;

type CreateTribeDependencies = {
  tribeCreatorWhitelistRepository: TribeCreatorWhitelistRepository;
  tribeCreationRepository: TribeCreationRepository;
};

function normalizeEmail(email: string | null): string | null {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";

  return normalizedEmail.length > 0 ? normalizedEmail : null;
}

async function findAvailableSuggestedSlug(
  baseSlug: string,
  tribeCreationRepository: TribeCreationRepository
): Promise<string> {
  let suggestionIndex = INITIAL_SLUG_SUGGESTION_INDEX;

  while (true) {
    const suggestedSlug = buildTribeSlugSuggestion(baseSlug, suggestionIndex);

    if (
      !isReservedTribeSlug(suggestedSlug) &&
      !(await tribeCreationRepository.isSlugTaken(suggestedSlug))
    ) {
      return suggestedSlug;
    }

    suggestionIndex += 1;
  }
}

export function createTribe({
  tribeCreatorWhitelistRepository,
  tribeCreationRepository,
}: CreateTribeDependencies) {
  return async (
    command: CreateTribeCommand
  ): Promise<CreateTribeResult> => {
    const normalizedEmail = normalizeEmail(command.creatorEmail);

    if (!normalizedEmail) {
      return {
        status: CREATE_TRIBE_STATUS.notAllowed,
      };
    }

    const normalizedName = command.name.trim();

    if (!normalizedName) {
      return {
        status: CREATE_TRIBE_STATUS.invalidName,
        message: CREATE_TRIBE_ERROR_MESSAGE[CREATE_TRIBE_STATUS.invalidName],
      };
    }

    const isCreatorAllowed =
      await tribeCreatorWhitelistRepository.isEmailAllowed(normalizedEmail);

    if (!isCreatorAllowed) {
      return {
        status: CREATE_TRIBE_STATUS.notAllowed,
      };
    }

    const normalizedSlug = normalizeTribeSlug(command.slug);

    if (!normalizedSlug) {
      return {
        status: CREATE_TRIBE_STATUS.invalidSlug,
        message: CREATE_TRIBE_ERROR_MESSAGE[CREATE_TRIBE_STATUS.invalidSlug],
      };
    }

    const slugIsUnavailable =
      isReservedTribeSlug(normalizedSlug) ||
      (await tribeCreationRepository.isSlugTaken(normalizedSlug));

    if (slugIsUnavailable) {
      return {
        status: CREATE_TRIBE_STATUS.slugConflict,
        message: CREATE_TRIBE_ERROR_MESSAGE[CREATE_TRIBE_STATUS.slugConflict],
        suggestedSlug: await findAvailableSuggestedSlug(
          normalizedSlug,
          tribeCreationRepository
        ),
      };
    }

    let createdTribe;

    try {
      createdTribe =
        await tribeCreationRepository.createTribeWithLeaderMembership({
          name: normalizedName,
          leaderId: command.creatorId,
          slug: normalizedSlug,
          visibility: DEFAULT_TRIBE_VISIBILITY,
        });
    } catch (error) {
      if (error instanceof TribeSlugConflictError) {
        return {
          status: CREATE_TRIBE_STATUS.slugConflict,
          message: CREATE_TRIBE_ERROR_MESSAGE[CREATE_TRIBE_STATUS.slugConflict],
          suggestedSlug: await findAvailableSuggestedSlug(
            normalizedSlug,
            tribeCreationRepository
          ),
        };
      }

      throw error;
    }

    return {
      status: CREATE_TRIBE_STATUS.created,
      tribeId: createdTribe.id,
      name: createdTribe.name,
      leaderMemberRole: CREATE_TRIBE_MEMBER_ROLE.leader,
      slug: createdTribe.slug,
    };
  };
}
