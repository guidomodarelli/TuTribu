import { describe, expect, it, vi } from "vitest";

import {
  getOwnAcademyAccess,
  grantAcademyBonus,
  listAcademyMembers,
  saveAcademyOffer,
  setAcademyAvailability,
} from "@/src/modules/product-access/application/use-cases/manage-academy-access-use-cases";
import type {
  OwnAcademyAccessSnapshot,
  ProductAccessRepository,
} from "@/src/modules/product-access/domain/repositories/product-access-repository";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const IDEMPOTENCY_KEY = "7f5c9a0e-8d1b-4c3e-9a2f-1b2c3d4e5f60";

function buildRepository(overrides: Partial<ProductAccessRepository> = {}): ProductAccessRepository {
  return {
    getAcademySettings: vi.fn(async () => null),
    getPublicOffer: vi.fn(async () => null),
    grantBonus: vi.fn(async () => ({ status: "forbidden" as const })),
    listMembers: vi.fn(async () => ({ status: "forbidden" as const })),
    readOwnAccessSnapshot: vi.fn(async () => null),
    revokeBonus: vi.fn(async () => ({ status: "not_found" as const })),
    saveOffer: vi.fn(async () => ({ status: "forbidden" as const })),
    setAvailability: vi.fn(async () => ({ status: "forbidden" as const })),
    ...overrides,
  };
}

const verifiedSnapshot: OwnAcademyAccessSnapshot = {
  accessModel: "academy",
  admissionEnabled: true,
  firstActivatedAt: null,
  grants: [],
  membership: { role: "tribemate", status: "active" },
  offerPurchasable: true,
  salesEnabled: true,
};

describe("getOwnAcademyAccess", () => {
  it("combines the snapshot with verification and renewal readers", async () => {
    const execute = getOwnAcademyAccess({
      isAcademySalesActivationAllowed: () => true,
      now: () => NOW,
      ownAcademyRenewalReader: { getOwnAcademyRenewalStatus: vi.fn(async () => "none" as const) },
      ownVerificationStatesReader: {
        listOwnVerificationStates: vi.fn(async () => ["verified" as const]),
      },
      productAccessRepository: buildRepository({
        readOwnAccessSnapshot: vi.fn(async () => verifiedSnapshot),
      }),
    });

    await expect(execute({ tribeSlug: " Matematica-Pro " })).resolves.toMatchObject({
      access: { canStartCheckout: true, eligibility: "verified", nextAction: "view_offer" },
      accessModel: "academy",
      status: "ok",
    });
  });

  it("keeps checkout closed while the deployment has not enabled sales", async () => {
    const execute = getOwnAcademyAccess({
      isAcademySalesActivationAllowed: () => false,
      now: () => NOW,
      ownAcademyRenewalReader: { getOwnAcademyRenewalStatus: vi.fn(async () => "none" as const) },
      ownVerificationStatesReader: {
        listOwnVerificationStates: vi.fn(async () => ["verified" as const]),
      },
      productAccessRepository: buildRepository({
        readOwnAccessSnapshot: vi.fn(async () => verifiedSnapshot),
      }),
    });

    await expect(execute({ tribeSlug: "matematica-pro" })).resolves.toMatchObject({
      access: { canStartCheckout: false },
    });
  });

  it("reports not found for an unknown or hidden tribe", async () => {
    const execute = getOwnAcademyAccess({
      isAcademySalesActivationAllowed: () => true,
      now: () => NOW,
      ownAcademyRenewalReader: { getOwnAcademyRenewalStatus: vi.fn() },
      ownVerificationStatesReader: { listOwnVerificationStates: vi.fn() },
      productAccessRepository: buildRepository(),
    });

    await expect(execute({ tribeSlug: "otra" })).resolves.toEqual({ status: "not_found" });
  });
});

describe("grantAcademyBonus", () => {
  const validCommand = {
    allowUnverifiedRecipient: false,
    correlationId: "request-1",
    endsAt: new Date("2026-07-15T12:00:00.000Z"),
    idempotencyKey: IDEMPOTENCY_KEY,
    reason: "  Alumna destacada  ",
    recipientUserId: " user-1 ",
    replacesGrantId: null,
    tribeSlug: "Matematica-Pro",
  };

  it("normalizes the command before granting", async () => {
    const grantBonus = vi.fn(async () => ({ status: "forbidden" as const }));
    const execute = grantAcademyBonus({
      now: () => NOW,
      productAccessRepository: buildRepository({ grantBonus }),
    });

    await execute(validCommand);

    expect(grantBonus).toHaveBeenCalledWith({
      ...validCommand,
      reason: "Alumna destacada",
      recipientUserId: "user-1",
      tribeSlug: "matematica-pro",
    });
  });

  it.each([
    ["an end in the past", { endsAt: new Date("2026-06-15T11:59:59.000Z") }],
    ["an end exactly now", { endsAt: NOW }],
    ["an end beyond one year", { endsAt: new Date("2027-06-20T00:00:00.000Z") }],
    ["a short reason", { reason: "ok" }],
    ["a malformed idempotency key", { idempotencyKey: "retry" }],
  ])("rejects %s without touching the repository", async (_label, override) => {
    const grantBonus = vi.fn();
    const execute = grantAcademyBonus({
      now: () => NOW,
      productAccessRepository: buildRepository({ grantBonus }),
    });

    await expect(execute({ ...validCommand, ...override })).resolves.toEqual({
      status: "invalid_input",
    });
    expect(grantBonus).not.toHaveBeenCalled();
  });
});

describe("saveAcademyOffer", () => {
  it("drops empty benefits and trims the copy", async () => {
    const saveOffer = vi.fn(async () => ({ status: "forbidden" as const }));
    const execute = saveAcademyOffer({ productAccessRepository: buildRepository({ saveOffer }) });

    await execute({
      benefits: ["  Clases en vivo  ", "   "],
      correlationId: "request-1",
      description: "Formación práctica.  \n",
      expectedConfigVersion: 2,
      title: " Academia ",
      tribeSlug: "matematica-pro",
    });

    expect(saveOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        benefits: ["Clases en vivo"],
        description: "Formación práctica.",
        title: "Academia",
      })
    );
  });

  it("rejects control characters instead of storing them", async () => {
    const saveOffer = vi.fn();
    const execute = saveAcademyOffer({ productAccessRepository: buildRepository({ saveOffer }) });

    await expect(
      execute({
        benefits: [],
        correlationId: "request-1",
        description: "",
        expectedConfigVersion: 1,
        title: "Academia\u0007",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "invalid_input" });
    expect(saveOffer).not.toHaveBeenCalled();
  });
});

describe("setAcademyAvailability", () => {
  it("refuses to open sales while the deployment switch is off", async () => {
    const setAvailability = vi.fn();
    const execute = setAcademyAvailability({
      isAcademySalesActivationAllowed: () => false,
      productAccessRepository: buildRepository({ setAvailability }),
    });

    await expect(
      execute({
        admissionEnabled: true,
        correlationId: "request-1",
        expectedConfigVersion: 3,
        salesEnabled: true,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "sales_activation_disabled" });
    expect(setAvailability).not.toHaveBeenCalled();
  });

  it("allows pausing sales and admissions at any time", async () => {
    const setAvailability = vi.fn(async () => ({ status: "forbidden" as const }));
    const execute = setAcademyAvailability({
      isAcademySalesActivationAllowed: () => false,
      productAccessRepository: buildRepository({ setAvailability }),
    });

    await execute({
      admissionEnabled: false,
      correlationId: "request-1",
      expectedConfigVersion: 3,
      salesEnabled: false,
      tribeSlug: "matematica-pro",
    });

    expect(setAvailability).toHaveBeenCalledOnce();
  });
});

describe("listAcademyMembers", () => {
  it("bounds pagination and search", async () => {
    const listMembers = vi.fn(async () => ({ status: "forbidden" as const }));
    const execute = listAcademyMembers({ productAccessRepository: buildRepository({ listMembers }) });

    await execute({ page: -4, pageSize: 1000, search: `  ${"a".repeat(200)}  `, tribeSlug: "x" });

    expect(listMembers).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50,
      search: "a".repeat(80),
      tribeSlug: "x",
    });
  });
});
