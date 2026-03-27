import { GetCommunityCreationEligibilityUseCase } from "@/src/modules/communities/application/use-cases/get-community-creation-eligibility-use-case";

describe("GetCommunityCreationEligibilityUseCase", () => {
  it("allows creation when the normalized email is present in the whitelist", async () => {
    const isEmailAllowed = jest.fn(async () => true);
    const useCase = new GetCommunityCreationEligibilityUseCase({
      isEmailAllowed,
    });

    await expect(
      useCase.execute({
        creatorEmail: "  PROMETIDO@Example.com ",
      })
    ).resolves.toEqual({
      canCreate: true,
    });

    expect(isEmailAllowed).toHaveBeenCalledWith("prometido@example.com");
  });

  it("returns false when the authenticated user has no email", async () => {
    const isEmailAllowed = jest.fn();
    const useCase = new GetCommunityCreationEligibilityUseCase({
      isEmailAllowed,
    });

    await expect(
      useCase.execute({
        creatorEmail: null,
      })
    ).resolves.toEqual({
      canCreate: false,
    });

    expect(isEmailAllowed).not.toHaveBeenCalled();
  });
});
