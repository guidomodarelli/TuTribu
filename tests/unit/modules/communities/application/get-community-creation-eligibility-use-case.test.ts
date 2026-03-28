import { getCommunityCreationEligibility } from "@/src/modules/communities/application/use-cases/get-community-creation-eligibility-use-case";

describe("getCommunityCreationEligibility", () => {
  it("allows creation when the normalized email is present in the whitelist", async () => {
    const isEmailAllowed = jest.fn(async () => true);
    const execute = getCommunityCreationEligibility({
      communityCreatorWhitelistRepository: {
        isEmailAllowed,
      },
    });

    await expect(
      execute({
        creatorEmail: "  PROMETIDO@Example.com ",
      })
    ).resolves.toEqual({
      canCreate: true,
    });

    expect(isEmailAllowed).toHaveBeenCalledWith("prometido@example.com");
  });

  it("returns false when the authenticated user has no email", async () => {
    const isEmailAllowed = jest.fn();
    const execute = getCommunityCreationEligibility({
      communityCreatorWhitelistRepository: {
        isEmailAllowed,
      },
    });

    await expect(
      execute({
        creatorEmail: null,
      })
    ).resolves.toEqual({
      canCreate: false,
    });

    expect(isEmailAllowed).not.toHaveBeenCalled();
  });
});
