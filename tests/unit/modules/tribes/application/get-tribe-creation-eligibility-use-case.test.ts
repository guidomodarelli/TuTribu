import { getTribeCreationEligibility } from "@/src/modules/tribes/application/use-cases/get-tribe-creation-eligibility-use-case";

describe("getTribeCreationEligibility", () => {
  it("allows creation when the normalized email is present in the whitelist", async () => {
    const isEmailAllowed = jest.fn(async () => true);
    const execute = getTribeCreationEligibility({
      tribeCreatorWhitelistRepository: {
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
    const execute = getTribeCreationEligibility({
      tribeCreatorWhitelistRepository: {
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
