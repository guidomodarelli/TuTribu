import { beforeEach, describe, expect, it, type Mock } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { ThemedToaster } from "@golfo/ui";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
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
    expect(screen.queryByRole("navigation", { name: "Admisiones y mensajería" })).not.toBeInTheDocument();
  });

  it("gives the leader a visible way into admission and messaging setup without requesting anything", () => {
    render(<AcademyManagement {...props()} />);

    const shortcuts = screen.getByRole("navigation", { name: "Admisiones y mensajería" });
    expect(within(shortcuts).getByRole("link", { name: "Reglas de admisión" })).toHaveAttribute("href", "/tribu/academia/admissions/settings");
    expect(within(shortcuts).getByRole("link", { name: "Solicitudes de ingreso" })).toHaveAttribute("href", "/tribu/academia/admissions");
    expect(within(shortcuts).getByRole("link", { name: "Países y cupos de mensajería" })).toHaveAttribute("href", "/tribu/academia/admissions/messaging");
    expect(within(shortcuts).getByRole("link", { name: "Conexión de mensajería" })).toHaveAttribute("href", "/tribu/academia/admissions/messaging/connections");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("points a legacy tribe to Ajustes and labels an inactive provider", () => {
    render(
      <AcademyManagement
        {...props({
          providers: [
            {
              displayName: "Broker B",
              id: "8e4f5c2b-9b7f-4d2e-8a3f-4c5b6d7e8f90",
              instructions: "",
              isActive: false,
              key: "broker-b",
              linkUrl: null,
            },
          ],
          settings: {
            accessModel: "legacy",
            admissionEnabled: false,
            benefits: [],
            configVersion: 1,
            description: "",
            offerVersion: 1,
            salesEnabled: false,
            title: "Academia",
          },
        })}
      />
    );

    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/tribu/ajustes");
    expect(screen.getByRole("switch", { name: "Admisiones abiertas" })).toBeDisabled();
    const providerRow = screen.getByText("Broker B").closest("li") as HTMLElement;

    expect(within(providerRow).getByText("Inactivo")).toBeInTheDocument();
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

  it("announces a saved offer once, next to the form", async () => {
    const user = userEvent.setup();
    const base = props();
    respondWithJson({ ...base.settings, configVersion: 3, title: "Academia nueva" }, 200);

    render(<AppUIProvider><AcademyManagement {...base} /><ThemedToaster /></AppUIProvider>);
    const offer = screen.getByRole("heading", { name: "Oferta" }).closest("section") ?? document.body;
    await user.clear(within(offer as HTMLElement).getByRole("textbox", { name: /Título/ }));
    await user.type(within(offer as HTMLElement).getByRole("textbox", { name: /Título/ }), "Academia nueva");
    await user.click(within(offer as HTMLElement).getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Oferta guardada.")).toBeInTheDocument();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(screen.getAllByText("Oferta guardada.")).toHaveLength(1);
  });

  it("revokes a bonus through an accessible dialog that sends once and then reloads the members", async () => {
    const user = userEvent.setup();
    const bonus = { endsAt: "2026-12-31T23:59:59.000Z", id: "7f5e6d3c-0a8b-4e3f-9b4a-5c6d7e8f9012", note: null, revokedAt: null, sourceType: "manual_bonus" as const, startsAt: "2026-06-01T00:00:00.000Z" };
    let finishRevoke!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finishRevoke = resolve; }));
    respondWithJson({ members: [{ ...member, grants: [{ ...bonus, revokedAt: "2026-06-03T00:00:00.000Z" }] }], page: 1, total: 1, viewerRole: "leader" }, 200);
    render(<AcademyManagement {...props({ initialMembers: { members: [{ ...member, grants: [bonus] }], page: 1, total: 1, viewerRole: "leader" } })} />);

    await user.click(screen.getByRole("button", { name: "Revocar" }));
    const dialog = await screen.findByRole("dialog", { name: "Revocar bonificación" });
    const submit = within(dialog).getByRole("button", { name: "Revocar bonificación" });
    expect(submit).toBeDisabled();

    await user.type(within(dialog).getByLabelText("Motivo de la revocación"), "Error de carga");
    await user.click(submit);
    await user.click(submit);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("button", { name: "Revocando…" })).toBeDisabled();

    await act(async () => { finishRevoke(new Response(JSON.stringify({ message: "La bonificación quedó revocada." }), { headers: { "Content-Type": "application/json" }, status: 200 })); });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/members");
    expect(await screen.findByText(/\(revocado\)/)).toBeInTheDocument();
  });

  it("keeps the failure of a revocation inside its dialog, with the reason still written", async () => {
    const user = userEvent.setup();
    const bonus = { endsAt: null, id: "8a6f7e4d-1b9c-4f4a-8c5b-6d7e8f901234", note: null, revokedAt: null, sourceType: "manual_bonus" as const, startsAt: "2026-06-01T00:00:00.000Z" };
    respondWithJson({ message: "No pudimos revocar la bonificación." }, 503);
    render(<AcademyManagement {...props({ initialMembers: { members: [{ ...member, grants: [bonus] }], page: 1, total: 1, viewerRole: "leader" } })} />);

    await user.click(screen.getByRole("button", { name: "Revocar" }));
    const dialog = await screen.findByRole("dialog", { name: "Revocar bonificación" });
    await user.type(within(dialog).getByLabelText("Motivo de la revocación"), "Error de carga");
    await user.click(within(dialog).getByRole("button", { name: "Revocar bonificación" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("No pudimos revocar la bonificación.");
    expect(within(dialog).getByLabelText("Motivo de la revocación")).toHaveValue("Error de carga");
  });

  it("keeps unsaved offer edits when the availability changes", async () => {
    const user = userEvent.setup();
    const settings = props().settings!;
    respondWithJson({ ...settings, configVersion: 3, salesEnabled: true }, 200);
    render(<AcademyManagement {...props()} />);

    await user.clear(screen.getByLabelText("Título"));
    await user.type(screen.getByLabelText("Título"), "Academia avanzada");
    await user.click(screen.getByRole("switch", { name: "Ventas abiertas" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Ventas abiertas" })).toBeChecked());
    expect(screen.getByLabelText("Título")).toHaveValue("Academia avanzada");
  });

  it("moves a request the leader just verified out of the pending list and reads the page again", async () => {
    const user = userEvent.setup();
    respondWithJson({ ...pendingItem, status: "verified", version: 2 }, 200);
    respondWithJson({ items: [], page: 1, scope: "review", total: 0 }, 200);
    render(<AcademyManagement {...props()} />);

    await user.click(screen.getByRole("button", { name: "Verificar" }));

    await waitFor(() => expect(screen.queryByText("Ana")).not.toBeInTheDocument());
    expect(screen.getByText("No hay solicitudes con esos filtros.")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("recovers the last real page when a reload asks for a page that no longer exists", async () => {
    const user = userEvent.setup();
    const second = { ...pendingItem, id: "0c8b9a6f-3d1e-4b6c-8e7d-8f9012345678", memberDisplayName: "Dani" };
    const next = { ...pendingItem, id: "1d9c0b7a-4e2f-4c7d-9f8e-901234567890", memberDisplayName: "Eva" };
    respondWithJson({ ...pendingItem, status: "verified", version: 2 }, 200);
    // Another decision already emptied page 2: the server answers it empty, with the real total.
    respondWithJson({ items: [], page: 2, scope: "review", total: 20 }, 200);
    respondWithJson({ items: [next], page: 1, scope: "review", total: 20 }, 200);
    render(<AcademyManagement {...props({ initialQueue: { items: [pendingItem, second], page: 2, total: 22 } })} />);

    await user.click(screen.getAllByRole("button", { name: "Verificar" })[0]);

    expect(await screen.findByText("Eva")).toBeInTheDocument();
    expect(new URL(String(fetchMock.mock.calls[2]?.[0]), "https://tutribu.example.invalid").searchParams.get("page")).toBe("1");
  });

  it("goes back to the previous page when the decided request was the only one on its page", async () => {
    const user = userEvent.setup();
    const next = { ...pendingItem, id: "9b7a8f5e-2c0d-4a5b-9d6c-7e8f90123456", memberDisplayName: "Carla" };
    respondWithJson({ ...pendingItem, status: "verified", version: 2 }, 200);
    respondWithJson({ items: [next], page: 1, scope: "review", total: 20 }, 200);
    render(<AcademyManagement {...props({ initialQueue: { items: [pendingItem], page: 2, total: 21 } })} />);

    await user.click(screen.getByRole("button", { name: "Verificar" }));

    expect(await screen.findByText("Carla")).toBeInTheDocument();
    const reload = new URL(String(fetchMock.mock.calls[1]?.[0]), "https://tutribu.example.invalid");
    expect(reload.searchParams.get("page")).toBe("1");
  });

  it("shows that a new member search is loading until its page arrives", async () => {
    const user = userEvent.setup();
    let finishSearch!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finishSearch = resolve; }));
    render(<AcademyManagement {...props()} />);
    const membersSection = screen.getByRole("heading", { name: "Accesos de integrantes" }).closest("section") as HTMLElement;

    await user.type(within(membersSection).getByLabelText("Buscar por nombre"), "Beto");
    await user.click(within(membersSection).getByRole("button", { name: "Buscar" }));
    expect(await within(membersSection).findByRole("status")).toHaveTextContent("Consultando…");

    await act(async () => { finishSearch(new Response(JSON.stringify({ members: [member], page: 1, total: 1, viewerRole: "leader" }), { headers: { "Content-Type": "application/json" }, status: 200 })); });
    await waitFor(() => expect(within(membersSection).queryByRole("status")).not.toBeInTheDocument());
  });
});
