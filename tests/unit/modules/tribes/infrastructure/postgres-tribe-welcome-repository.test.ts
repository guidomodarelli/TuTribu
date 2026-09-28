import { vi, describe, it, expect } from "vitest";
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
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            links_heading: "Recursos para empezar",
            selection_modal_benefit: null,
            selection_modal_description:
              "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.",
            selection_modal_title: "Elegí cómo querés empezar",
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
        "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.",
      selectionModalTitle: "Elegí cómo querés empezar",
      welcomeMessage: "Bienvenido/a a Matematica Pro",
    });
  });

  it("returns the default simple welcome when storage is not migrated", async () => {
    const execute = vi.fn(async (...args: unknown[]) => { void args;
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
        "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.",
      selectionModalTitle: "Elegí cómo querés empezar",
      welcomeMessage: "Nos alegra que te sumes. Antes de activar tu acceso, leé los acuerdos y elegí cómo querés empezar.",
    });
  });

  it("maps leader save results to updated", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          status: "updated" as const,
        },
      ],
    }); });
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
          "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.",
        selectionModalTitle: "Elegí cómo querés empezar",
        tribeSlug: "matematica-pro",
        welcomeMessage: "Bienvenido/a",
      })
    ).resolves.toEqual({ status: "updated" as const });
  });

  it("serializes welcome rules and links with database column names", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          status: "updated" as const,
        },
      ],
    }); });
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
          "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.",
        selectionModalTitle: "Elegí cómo querés empezar",
        tribeSlug: "matematica-pro",
        welcomeMessage: "Bienvenido/a",
      })
    ).resolves.toEqual({ status: "updated" as const });

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

  it("preserves member selections by upserting unchanged links before deleting removed ones", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          status: "updated" as const,
        },
      ],
    }); });
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
        "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.",
      selectionModalTitle: "Elegí cómo querés empezar",
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
  });

});
