import type { CreateCommunityCommand } from "@/src/modules/communities/application/commands/create-community-command";
import type { CreateCommunityResult } from "@/src/modules/communities/application/results/create-community-result";
import { CommunitySlugConflictError } from "@/src/modules/communities/domain/errors/community-slug-conflict-error";
import type { CommunityCreationRepository } from "@/src/modules/communities/domain/repositories/community-creation-repository";
import type { CommunityCreatorWhitelistRepository } from "@/src/modules/communities/domain/repositories/community-creator-whitelist-repository";
import {
  buildCommunitySlugSuggestion,
  isReservedCommunitySlug,
  normalizeCommunitySlug,
} from "@/src/modules/communities/domain/value-objects/community-slug";

function normalizeEmail(email: string | null): string | null {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";

  return normalizedEmail.length > 0 ? normalizedEmail : null;
}

async function findAvailableSuggestedSlug(
  baseSlug: string,
  communityCreationRepository: CommunityCreationRepository
): Promise<string> {
  let suggestionIndex = 2;

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
        status: "not-allowed",
      };
    }

    const normalizedName = command.name.trim();

    if (!normalizedName) {
      return {
        status: "invalid-name",
        message: "Define un nombre para tu comunidad.",
      };
    }

    const isCreatorAllowed =
      await this.communityCreatorWhitelistRepository.isEmailAllowed(normalizedEmail);

    if (!isCreatorAllowed) {
      return {
        status: "not-allowed",
      };
    }

    const normalizedSlug = normalizeCommunitySlug(command.slug);

    if (!normalizedSlug) {
      return {
        status: "invalid-slug",
        message: "Define un slug valido para tu comunidad.",
      };
    }

    const slugIsUnavailable =
      isReservedCommunitySlug(normalizedSlug) ||
      (await this.communityCreationRepository.isSlugTaken(normalizedSlug));

    if (slugIsUnavailable) {
      return {
        status: "slug-conflict",
        message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
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
          visibility: "private",
        });
    } catch (error) {
      if (error instanceof CommunitySlugConflictError) {
        return {
          status: "slug-conflict",
          message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
          suggestedSlug: await findAvailableSuggestedSlug(
            normalizedSlug,
            this.communityCreationRepository
          ),
        };
      }

      throw error;
    }

    return {
      status: "created",
      communityId: createdCommunity.id,
      name: createdCommunity.name,
      ownerMemberRole: "owner",
      slug: createdCommunity.slug,
    };
  }
}
