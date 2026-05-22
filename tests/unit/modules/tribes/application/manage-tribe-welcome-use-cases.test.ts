import {
  getEditableTribeWelcome,
  getTribeWelcome,
  getTribeWelcomeByInvitation,
  saveTribeWelcome,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-welcome-use-cases";
import { TRIBE_WELCOME_LINK_TYPE } from "@/src/modules/tribes/constants/tribe-welcome";
import type { TribeWelcomeRepository } from "@/src/modules/tribes/domain/repositories/tribe-welcome-repository";

function buildRepository(
  overrides: Partial<TribeWelcomeRepository> = {}
): TribeWelcomeRepository {
  return {
    getEditableByTribeSlug: jest.fn(async () => ({
      links: [],
      rules: [],
      welcomeMessage: "Bienvenido/a a la tribu",
    })),
    getByInvitation: jest.fn(async () => ({
      links: [],
      rules: [],
      welcomeMessage: "Bienvenido/a a la tribu",
    })),
    getByTribeSlug: jest.fn(async () => ({
      links: [],
      rules: [],
      welcomeMessage: "Bienvenido/a a la tribu",
    })),
    save: jest.fn(async () => ({ status: "updated" })),
    ...overrides,
  };
}

describe("manage tribe welcome use cases", () => {
  it("gets the internal welcome configuration with a normalized tribe slug", async () => {
    const repository = buildRepository();
    const useCase = getTribeWelcome({
      tribeWelcomeRepository: repository,
    });

    await useCase({
      tribeSlug: " matematica-pro ",
    });

    expect(repository.getByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("gets the editable welcome configuration with a normalized tribe slug", async () => {
    const repository = buildRepository();
    const useCase = getEditableTribeWelcome({
      tribeWelcomeRepository: repository,
    });

    await useCase({
      tribeSlug: " matematica-pro ",
    });

    expect(repository.getEditableByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("gets the invitation welcome configuration with a normalized token", async () => {
    const repository = buildRepository();
    const useCase = getTribeWelcomeByInvitation({
      tribeWelcomeRepository: repository,
    });

    await useCase({
      token: " invitation-token ",
      tribeSlug: " matematica-pro ",
    });

    expect(repository.getByInvitation).toHaveBeenCalledWith({
      token: "invitation-token",
      tribeSlug: "matematica-pro",
    });
  });

  it("normalizes welcome edits before saving them", async () => {
    const repository = buildRepository();
    const useCase = saveTribeWelcome({
      tribeWelcomeRepository: repository,
    });

    await useCase({
      links: [
        {
          badgeLabel: " Comunidad WA ",
          description: "  Contacto directo  ",
          id: " link-1 ",
          isActive: true,
          label: " Comunidad ",
          message: " Hola, quiero entrar ",
          phoneNumber: " +54 11 5555-5555 ",
          sortOrder: 2,
          type: TRIBE_WELCOME_LINK_TYPE.whatsappButton,
          url: " ",
        },
      ],
      rules: [
        {
          id: " rule-1 ",
          isActive: true,
          label: " Presentate al entrar ",
          sortOrder: 1,
        },
      ],
      tribeSlug: " matematica-pro ",
      welcomeMessage: " Bienvenido/a ",
    });

    expect(repository.save).toHaveBeenCalledWith({
      links: [
        {
          badgeLabel: "Comunidad WA",
          description: "Contacto directo",
          id: "link-1",
          isActive: true,
          label: "Comunidad",
          message: "Hola, quiero entrar",
          phoneNumber: "+54 11 5555-5555",
          sortOrder: 2,
          type: TRIBE_WELCOME_LINK_TYPE.whatsappButton,
          url: null,
        },
      ],
      rules: [
        {
          id: "rule-1",
          isActive: true,
          label: "Presentate al entrar",
          sortOrder: 1,
        },
      ],
      tribeSlug: "matematica-pro",
      welcomeMessage: "Bienvenido/a",
    });
  });
});
