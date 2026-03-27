import type { CreateCommunityCommand } from "@/src/modules/communities/application/commands/create-community-command";
import {
  CREATE_COMMUNITY_ERROR_MESSAGE,
  CREATE_COMMUNITY_MEMBER_ROLE,
  CREATE_COMMUNITY_STATUS,
  type CreateCommunityResult,
} from "@/src/modules/communities/application/results/create-community-result";
import { CommunitySlugConflictError } from "@/src/modules/communities/domain/errors/community-slug-conflict-error";
import type { CommunityCreationRepository } from "@/src/modules/communities/domain/repositories/community-creation-repository";
import type { CommunityCreatorWhitelistRepository } from "@/src/modules/communities/domain/repositories/community-creator-whitelist-repository";
import {
  buildCommunitySlugSuggestion,
  isReservedCommunitySlug,
  normalizeCommunitySlug,
} from "@/src/modules/communities/domain/value-objects/community-slug";

const DEFAULT_COMMUNITY_VISIBILITY = "private" as const;
const INITIAL_SLUG_SUGGESTION_INDEX = 2;

function normalizeEmail(email: string | null): string | null {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";

  return normalizedEmail.length > 0 ? normalizedEmail : null;
}

async function findAvailableSuggestedSlug(
  baseSlug: string,
  communityCreationRepository: CommunityCreationRepository
): Promise<string> {
  let suggestionIndex = INITIAL_SLUG_SUGGESTION_INDEX;

  while (true) {
    const suggestedSlug = buildCommunitySlugSuggestion(baseSlug, suggestionIndex);

    if (
      !isReservedCommunitySlug(suggestedSlug) &&
      !(await communityCreationRepository.isSlugTaken(suggestedSlug))
    ) {
      return suggestedSlug;
    }

    suggestionIndex += 1;
  }
}

export class CreateCommunityUseCase {
  constructor(
    private readonly communityCreatorWhitelistRepository: CommunityCreatorWhitelistRepository,
    private readonly communityCreationRepository: CommunityCreationRepository
  ) {}

  async execute(command: CreateCommunityCommand): Promise<CreateCommunityResult> {
    const normalizedEmail = normalizeEmail(command.creatorEmail);

    if (!normalizedEmail) {
      return {
        status: CREATE_COMMUNITY_STATUS.notAllowed,
      };
    }

    const normalizedName = command.name.trim();

    if (!normalizedName) {
      return {
        status: CREATE_COMMUNITY_STATUS.invalidName,
        message: CREATE_COMMUNITY_ERROR_MESSAGE[CREATE_COMMUNITY_STATUS.invalidName],
      };
    }

    const isCreatorAllowed =
      await this.communityCreatorWhitelistRepository.isEmailAllowed(normalizedEmail);

    if (!isCreatorAllowed) {
      return {
        status: CREATE_COMMUNITY_STATUS.notAllowed,
      };
    }

    const normalizedSlug = normalizeCommunitySlug(command.slug);

    if (!normalizedSlug) {
      return {
        status: CREATE_COMMUNITY_STATUS.invalidSlug,
        message: CREATE_COMMUNITY_ERROR_MESSAGE[CREATE_COMMUNITY_STATUS.invalidSlug],
      };
    }

    const slugIsUnavailable =
      isReservedCommunitySlug(normalizedSlug) ||
      (await this.communityCreationRepository.isSlugTaken(normalizedSlug));

    if (slugIsUnavailable) {
      return {
        status: CREATE_COMMUNITY_STATUS.slugConflict,
        message: CREATE_COMMUNITY_ERROR_MESSAGE[CREATE_COMMUNITY_STATUS.slugConflict],
        suggestedSlug: await findAvailableSuggestedSlug(
          normalizedSlug,
          this.communityCreationRepository
        ),
      };
    }

    let createdCommunity;

    try {
      createdCommunity =
        await this.communityCreationRepository.createCommunityWithOwnerMembership({
          name: normalizedName,
          ownerId: command.creatorId,
          slug: normalizedSlug,
          visibility: DEFAULT_COMMUNITY_VISIBILITY,
        });
    } catch (error) {
      if (error instanceof CommunitySlugConflictError) {
        return {
          status: CREATE_COMMUNITY_STATUS.slugConflict,
          message: CREATE_COMMUNITY_ERROR_MESSAGE[CREATE_COMMUNITY_STATUS.slugConflict],
          suggestedSlug: await findAvailableSuggestedSlug(
            normalizedSlug,
            this.communityCreationRepository
          ),
        };
      }

      throw error;
    }

    return {
      status: CREATE_COMMUNITY_STATUS.created,
      communityId: createdCommunity.id,
      name: createdCommunity.name,
      ownerMemberRole: CREATE_COMMUNITY_MEMBER_ROLE.owner,
      slug: createdCommunity.slug,
    };
  }
}
