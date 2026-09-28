import { beforeEach, describe, expect, it, type Mock } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AcademyManagement, type AcademyManagementProps } from "@/components/academy/academy-management";

const fetchMock = global.fetch as Mock;

function respondWithJson(body: unknown, status: number) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status })
  );
}

const pendingItem = {
  declaredEmail: null,
  decisionReason: null,
  id: "5d3f4b1a-8a6e-4c1d-9f2e-3b4a5c6d7e8f",
  memberDisplayName: "Ana",
  memberUserId: "user-ana",
  providerDisplayName: "Broker A",
  providerId: "6e4f5c2b-9b7f-4d2e-8a3f-4c5b6d7e8f90",
  reviewedAt: null,
  status: "pending" as const,
  updatedAt: "2026-06-02T12:00:00.000Z",
  version: 1,
};

const member = {
  displayName: "Beto",
  grants: [],
  hasAcademyAccess: false,
  isVerified: false,
  membershipStatus: "active",
  renewalStatus: "active",
  role: "tribemate",
  userId: "user-beto",
};

function props(overrides: Partial<AcademyManagementProps> = {}): AcademyManagementProps {
  return {
    initialMembers: { members: [member], page: 1, total: 1, viewerRole: "leader" },
    initialQueue: { items: [pendingItem], page: 1, total: 1 },
    providers: [],
    settings: {
      accessModel: "academy",
      admissionEnabled: true,
      benefits: [],
      configVersion: 2,
      description: "",
      offerVersion: 1,
      salesEnabled: false,
      title: "Academia",
    },
    tribeSlug: "tribu",
    viewerRole: "leader",
    ...overrides,
  };
}

describe("AcademyManagement", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("hides configuration and bonuses from guardians", () => {
    render(
      <AcademyManagement
        {...props({
          initialMembers: { members: [member], page: 1, total: 1, viewerRole: "guardian" },
          providers: null,
          settings: null,
          viewerRole: "guardian",
        })}
      />
    );

    expect(screen.queryByRole("heading", { name: "Configuración" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bonificar" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Solicitudes de verificación" })).toBeInTheDocument();
  });

  it("requires a reason to reject a request", async () => {
    const user = userEvent.setup();
    render(<AcademyManagement {...props()} />);

    await user.click(screen.getByRole("button", { name: "Rechazar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Indicá un motivo para rechazar o revocar.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the conflict and the current state when another reviewer decided first", async () => {
    const user = userEvent.setup();
    respondWithJson({ ...pendingItem, status: "verified", version: 2 }, 409);
    render(<AcademyManagement {...props()} />);

    await user.click(screen.getByRole("button", { name: "Verificar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Otra persona actualizó este dato. Revisá el estado actual y volvé a intentarlo."
    );
    const row = screen.getByText("Ana").closest("li") as HTMLElement;

    expect(within(row).getByText("Verificada")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Revocar" })).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      decision: "verified",
      expectedVersion: 1,
    });
  });

  it("warns about the active renewal and requires the exception for an unverified member", async () => {
    const user = userEvent.setup();
    render(<AcademyManagement {...props()} />);

    await user.click(screen.getByRole("button", { name: "Bonificar" }));
    const dialog = await screen.findByRole("dialog");

    expect(
      within(dialog).getByText("Esta persona tiene una renovación activa: la bonificación no detiene sus cobros.")
    ).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Válida hasta (inclusive)"), "2099-07-15");
    await user.type(within(dialog).getByLabelText("Motivo (privado)"), "Beca de la comunidad");
    const submit = within(dialog).getByRole("button", { name: "Otorgar bonificación" });

    expect(submit).toBeDisabled();

    await user.click(within(dialog).getByLabelText("Otorgar aunque no esté verificada (excepción)"));

    expect(submit).toBeEnabled();
  });
});
