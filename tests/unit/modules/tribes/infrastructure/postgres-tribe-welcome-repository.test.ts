import { PostgresTribeWelcomeRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-welcome-repository";
import { TRIBE_WELCOME_LINK_TYPE } from "@/src/modules/tribes/constants/tribe-welcome";

type DrizzleQueryWithChunks = {
  queryChunks?: unknown[];
};

function readQueryText(query: unknown): string {
  if (!query || typeof query !== "object" || !("queryChunks" in query)) {
    return "";
  }

  const { queryChunks } = query as DrizzleQueryWithChunks;

  return (queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value?: unknown }).value)
      ) {
        return (chunk as { value: unknown[] }).value.join("");
      }

      return "";
    })
    .join(" ");
}

function readJsonArrayParameters(query: unknown): unknown[][] {
  if (!query || typeof query !== "object" || !("queryChunks" in query)) {
    return [];
  }

  const { queryChunks } = query as DrizzleQueryWithChunks;

  return (queryChunks ?? [])
    .filter((chunk): chunk is string => typeof chunk === "string")
    .map((chunk) => {
      try {
        return JSON.parse(chunk) as unknown;
      } catch {
        return null;
      }
    })
    .filter((chunk): chunk is unknown[] => Array.isArray(chunk));
}

describe("PostgresTribeWelcomeRepository", () => {
  it("maps internal welcome settings, rules, and links", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            links_heading: "Recursos para empezar",
            selection_modal_benefit: null,
            selection_modal_description:
              "Elegí una opción para empezar. Cualquiera te da acceso a los recursos del grupo. Podés cerrar y elegir más tarde.",
            selection_modal_title: "Elegí una opción para empezar",
            welcome_message: "Bienvenido/a a Matematica Pro",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "rule-1",
            is_active: true,
            label: "Presentate al entrar",
            sort_order: 1,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            badge_label: "Soporte",
            description: null,
            id: "link-1",
            is_active: true,
            label: "Soporte",
            message: null,
            phone_number: null,
            sort_order: 1,
            type: TRIBE_WELCOME_LINK_TYPE.customButton,
            url: "https://soporte.example.com",
          },
        ],
      });
    const repository = new PostgresTribeWelcomeRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.getByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      linksHeading: "Recursos para empezar",
      links: [
        {
          badgeLabel: "Soporte",
          description: null,
          id: "link-1",
          isActive: true,
          label: "Soporte",
          message: null,
          phoneNumber: null,
          sortOrder: 1,
          type: TRIBE_WELCOME_LINK_TYPE.customButton,
          url: "https://soporte.example.com",
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
      selectionModalBenefit: null,
      selectionModalDescription:
        "Elegí una opción para empezar. Cualquiera te da acceso a los recursos del grupo. Podés cerrar y elegir más tarde.",
      selectionModalTitle: "Elegí una opción para empezar",
      welcomeMessage: "Bienvenido/a a Matematica Pro",
    });
  });

  it("returns the default simple welcome when storage is not migrated", async () => {
    const execute = jest.fn(async () => {
      throw {
        cause: {
          code: "42P01",
        },
      };
    });
    const repository = new PostgresTribeWelcomeRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.getByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      linksHeading: "Recursos para empezar",
      links: [],
      rules: [],
      selectionModalBenefit: null,
      selectionModalDescription:
        "Elegí una opción para empezar. Cualquiera te da acceso a los recursos del grupo. Podés cerrar y elegir más tarde.",
      selectionModalTitle: "Elegí una opción para empezar",
      welcomeMessage: "Bienvenido/a a la tribu",
    });
  });

  it("maps leader save results to updated", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          status: "updated",
        },
      ],
    }));
    const repository = new PostgresTribeWelcomeRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.save({
        linksHeading: "Recursos para empezar",
        links: [],
        rules: [],
        selectionModalBenefit: null,
        selectionModalDescription:
          "Elegí una opción para empezar. Cualquiera te da acceso a los recursos del grupo. Podés cerrar y elegir más tarde.",
        selectionModalTitle: "Elegí una opción para empezar",
        tribeSlug: "matematica-pro",
        welcomeMessage: "Bienvenido/a",
      })
    ).resolves.toEqual({ status: "updated" });
  });

  it("serializes welcome rules and links with database column names", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          status: "updated",
        },
      ],
    }));
    const repository = new PostgresTribeWelcomeRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.save({
        links: [
          {
            badgeLabel: "Soporte",
            description: "Para soporte técnico",
            id: "link-1",
            isActive: true,
            label: "Soporte",
            message: "Hola",
            phoneNumber: "+5491155555555",
            sortOrder: 1,
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
        linksHeading: "Recursos para empezar",
        selectionModalBenefit: null,
        selectionModalDescription:
          "Elegí una opción para empezar. Cualquiera te da acceso a los recursos del grupo. Podés cerrar y elegir más tarde.",
        selectionModalTitle: "Elegí una opción para empezar",
        tribeSlug: "matematica-pro",
        welcomeMessage: "Bienvenido/a",
      })
    ).resolves.toEqual({ status: "updated" });

    const [rules, links] = execute.mock.calls.flatMap(([query]) =>
      readJsonArrayParameters(query)
    );

    expect(rules).toEqual([
      expect.objectContaining({
        id: "rule-1",
        is_active: true,
        label: "Presentate al entrar",
        sort_order: 1,
      }),
    ]);
    expect(links).toEqual([
      expect.objectContaining({
        badge_label: "Soporte",
        description: "Para soporte técnico",
        id: "link-1",
        is_active: true,
        label: "Soporte",
        phone_number: "+5491155555555",
        sort_order: 1,
        type: TRIBE_WELCOME_LINK_TYPE.whatsappButton,
      }),
    ]);
  });

  it("orders welcome replacement writes after resolving an editable tribe", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          status: "updated",
        },
      ],
    }));
    const repository = new PostgresTribeWelcomeRepository(async (callback) =>
      callback({ execute } as never)
    );

    await repository.save({
      links: [
        {
          badgeLabel: "Soporte",
          description: null,
          id: "link-1",
          isActive: true,
          label: "Soporte",
          message: "Hola",
          phoneNumber: "+5491155555555",
          sortOrder: 1,
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
      linksHeading: "Recursos para empezar",
      selectionModalBenefit: null,
      selectionModalDescription:
        "Elegí una opción para empezar. Cualquiera te da acceso a los recursos del grupo. Podés cerrar y elegir más tarde.",
      selectionModalTitle: "Elegí una opción para empezar",
      tribeSlug: "matematica-pro",
      welcomeMessage: "Bienvenido/a",
    });

    expect(execute).toHaveBeenCalledTimes(5);
  });

  it("preserves member selections by upserting unchanged links before deleting removed ones", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          status: "updated",
        },
      ],
    }));
    const repository = new PostgresTribeWelcomeRepository(async (callback) =>
      callback({ execute } as never)
    );

    await repository.save({
      links: [
        {
          badgeLabel: "Soporte",
          description: null,
          id: "11111111-1111-4111-8111-111111111111",
          isActive: true,
          label: "Soporte",
          message: null,
          phoneNumber: null,
          sortOrder: 1,
          type: TRIBE_WELCOME_LINK_TYPE.customButton,
          url: "https://soporte.example.com",
        },
      ],
      rules: [],
      linksHeading: "Recursos para empezar",
      selectionModalBenefit: null,
      selectionModalDescription:
        "Elegí una opción para empezar. Cualquiera te da acceso a los recursos del grupo. Podés cerrar y elegir más tarde.",
      selectionModalTitle: "Elegí una opción para empezar",
      tribeSlug: "matematica-pro",
      welcomeMessage: "Bienvenido/a",
    });

    const queryTexts = execute.mock.calls.map(([query]) =>
      readQueryText(query)
    );
    const linkUpsertIndex = queryTexts.findIndex((queryText) =>
      queryText.includes("insert into public.tribe_welcome_links")
    );
    const removedLinkDeleteIndex = queryTexts.findIndex((queryText) =>
      queryText.includes("delete from public.tribe_welcome_links")
    );

    expect(linkUpsertIndex).toBeGreaterThan(-1);
    expect(removedLinkDeleteIndex).toBeGreaterThan(linkUpsertIndex);
    expect(queryTexts[linkUpsertIndex]).toContain(
      "on conflict (id) do update"
    );
    expect(queryTexts[removedLinkDeleteIndex]).toContain("not exists");
  });

  it("filters inactive items for regular welcome reads", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            welcome_message: "Bienvenido/a a Matematica Pro",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresTribeWelcomeRepository(async (callback) =>
      callback({ execute } as never)
    );

    await repository.getByTribeSlug({
      tribeSlug: "matematica-pro",
    });

    const ruleQueryChunks = (execute.mock.calls[1][0] as { queryChunks: unknown[] })
      .queryChunks;
    const linkQueryChunks = (execute.mock.calls[2][0] as { queryChunks: unknown[] })
      .queryChunks;

    expect(ruleQueryChunks).toContain(false);
    expect(linkQueryChunks).toContain(false);
  });
});
