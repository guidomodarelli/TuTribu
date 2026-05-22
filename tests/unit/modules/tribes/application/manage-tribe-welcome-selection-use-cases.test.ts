import {
  listCurrentMemberTribeWelcomeSelections,
  listTribeWelcomeSelections,
  recordTribeWelcomeSelection,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-welcome-selection-use-cases";
import { TRIBE_WELCOME_SELECTION_STATUS } from "@/src/modules/tribes/constants/tribe-welcome";
import type { TribeWelcomeSelectionRepository } from "@/src/modules/tribes/domain/repositories/tribe-welcome-selection-repository";

function buildRepository(
  overrides: Partial<TribeWelcomeSelectionRepository> = {}
): TribeWelcomeSelectionRepository {
  return {
    listByTribeSlugForCurrentMember: jest.fn(async () => []),
    listByTribeSlug: jest.fn(async () => []),
    record: jest.fn(async () => ({
      status: TRIBE_WELCOME_SELECTION_STATUS.recorded,
    })),
    ...overrides,
  };
}

describe("manage tribe welcome selection use cases", () => {
  it("records a selection with a normalized tribe slug and link id", async () => {
    const repository = buildRepository();
    const useCase = recordTribeWelcomeSelection({
      tribeWelcomeSelectionRepository: repository,
    });

    await useCase({
      tribeSlug: " matematica-pro ",
      welcomeLinkId: " 1bc8b6f8-1abf-4d80-87c4-a14e6e3a9e62 ",
    });

    expect(repository.record).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      welcomeLinkId: "1bc8b6f8-1abf-4d80-87c4-a14e6e3a9e62",
    });
  });

  it("lists selections with a normalized tribe slug", async () => {
    const repository = buildRepository();
    const useCase = listTribeWelcomeSelections({
      tribeWelcomeSelectionRepository: repository,
    });

    await useCase({
      tribeSlug: " matematica-pro ",
    });

    expect(repository.listByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("lists current member selections with a normalized tribe slug", async () => {
    const repository = buildRepository();
    const useCase = listCurrentMemberTribeWelcomeSelections({
      tribeWelcomeSelectionRepository: repository,
    });

    await useCase({
      tribeSlug: " matematica-pro ",
    });

    expect(repository.listByTribeSlugForCurrentMember).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
    expect(repository.listByTribeSlug).not.toHaveBeenCalled();
  });
});
