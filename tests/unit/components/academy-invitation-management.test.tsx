/** Exercises real shared controls and viewer-scoped workflow with doubles only at own application ports. @module academy-invitation-management-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvitationsContainer } from "@/app/(platform)/[slug]/academia/admissions/invitations/invitations-container";
import type { PersonalInvitationManagementPageState } from "@/src/modules/academy-admissions/application/results/personal-invitation-management-page-state";
import type { PersonalInvitationManagementBrowserClient } from "@/src/modules/academy-admissions/application/ports/personal-invitation-management-browser-client";
import type { ReauthenticationIntentBrowserClient } from "@/src/modules/auth/application/ports/reauthentication-intent-browser-client";

/** @returns Safe initial props and own ports, with real storage, hooks, controls and validation. */
function fixture(phone = false) {
  const viewerId = randomUUID(), tribeId = randomUUID(), invitationId = randomUUID();
  const initial: Extract<PersonalInvitationManagementPageState, { kind: "ready" }> = { kind: "ready", slug: "synthetic", tribeId, viewerId, renderedAt: new Date().toISOString(), contactType: phone ? "phone" : "email", requiresAdditionalVerification: phone, allowedCountries: ["AR"], hasUsableAllowlist: false, page: { items: [], nextCursor: null }, query: { limit: 25 } };
  const invitationUrl = `https://tutribu.example.test/admissions/invitations/${randomBytes(32).toString("base64url")}`;
  const metadata = { id: invitationId, version: 1, internalName: "Grupo inicial", recipient: { type: "email" as const, value: "recipient@example.test" }, requiresAllowlist: false, expiresAt: null, status: "active" as const, createdAt: initial.renderedAt, redeemedAt: null, revokedAt: null, authorizationRevokedAt: null };
  const client: PersonalInvitationManagementBrowserClient = {
    viewer: vi.fn(async () => ({ status: "ready" as const, value: { id: viewerId } })),
    page: vi.fn(async () => ({ status: "ready" as const, value: { ...initial, page: { items: [metadata], nextCursor: null } } })),
    write: vi.fn(async (_slug, intent) => ({ status: "ready" as const, value: { viewerId, outcome: { state: "completed" as const, operationId: intent.input.operationId, replayed: false, result: { invitationId, version: intent.type === "create_personal_invitation" ? 1 : intent.input.expectedVersion + 1, changed: true, created: intent.type === "create_personal_invitation" }, ...(intent.type === "create_personal_invitation" ? { invitationUrl } : {}) } } })),
    operation: vi.fn(async () => ({ status: "failed" as const, code: "resource_unavailable" as const, message: "Recurso no disponible.", uncertain: false })),
  };
  const reauthentication: ReauthenticationIntentBrowserClient = { create: vi.fn(async () => ({ status: "ready" as const, href: "/auth/reauthenticate?intentId=synthetic" })) };
  return { initial, client, metadata, invitationUrl, reauthentication };
}
/** @param data - Own fixture. @returns Mounted real container after its native viewer observation. */
async function mount(data: ReturnType<typeof fixture>) { render(<InvitationsContainer initialState={data.initial} client={data.client} reauthentication={data.reauthentication} />); await waitFor(() => expect(screen.getByRole("button", { name: "Nueva invitación" })).toBeEnabled()); }
/** @param user - Actual DOM interaction driver. @returns After completing only a valid explicit email proposal. */
async function emailProposal(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nombre interno"), "Grupo inicial");
  await user.type(screen.getByLabelText("Correo destinatario"), "recipient@example.test");
  await user.click(screen.getByRole("checkbox", { name: /Reconozco la dispensa/ }));
  await user.click(screen.getByRole("checkbox", { name: "Confirmo esta acción sobre la invitación personal." }));
}

beforeEach(() => { window.sessionStorage.clear(); });
describe("personal invitation management controls", () => {
  it("should keep an inactive replacement target blocked after current metadata rather than converting its proposal", async () => {
    const data = fixture(), user = userEvent.setup(); data.initial.page.items = [data.metadata];
    vi.mocked(data.client.write).mockResolvedValueOnce({ status: "failed", code: "invitation_conflict", message: "La invitación cambió.", uncertain: false });
    vi.mocked(data.client.page).mockResolvedValueOnce({ status: "ready", value: { ...data.initial, page: { items: [{ ...data.metadata, status: "redeemed", version: 2, redeemedAt: new Date().toISOString() }], nextCursor: null } } });
    await mount(data); await user.click(screen.getByRole("button", { name: "Reemitir Grupo inicial" }));
    await user.click(screen.getByRole("checkbox", { name: /Reconozco la dispensa/ })); await user.click(screen.getByRole("checkbox", { name: /Confirmo revocar/ })); await user.click(screen.getByRole("checkbox", { name: "Confirmo esta acción sobre la invitación personal." })); await user.click(screen.getByRole("button", { name: "Guardar acción" }));
    await screen.findByRole("alert"); await user.click(screen.getByRole("button", { name: "Consultar estado actual" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("reemisión dejó de ser aplicable");
    expect(screen.getByRole("button", { name: "Guardar acción" })).toBeDisabled(); expect(data.client.write).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Descartar selección" }));
    expect(screen.getByLabelText("Correo destinatario")).toHaveValue("");
  });
  it("should keep an absent selected resource blocked after a conflict until selection is explicitly discarded", async () => {
    const data = fixture(), user = userEvent.setup(); data.initial.page.items = [data.metadata];
    vi.mocked(data.client.write).mockResolvedValueOnce({ status: "failed", code: "invitation_conflict", message: "La invitación cambió.", uncertain: false });
    vi.mocked(data.client.page).mockResolvedValueOnce({ status: "ready", value: { ...data.initial, page: { items: [], nextCursor: null } } });
    await mount(data); await user.click(screen.getByRole("button", { name: "Renombrar Grupo inicial" }));
    await user.type(screen.getByLabelText("Nombre interno"), " actualizado"); await user.click(screen.getByRole("checkbox", { name: "Confirmo esta acción sobre la invitación personal." })); await user.click(screen.getByRole("button", { name: "Guardar acción" }));
    await screen.findByRole("alert"); await user.click(screen.getByRole("button", { name: "Consultar estado actual" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no aparece en esta vista");
    expect(screen.getByRole("button", { name: "Guardar acción" })).toBeDisabled(); expect(data.client.write).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Descartar selección" }));
    expect(screen.getByLabelText("Correo destinatario")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "Confirmo esta acción sobre la invitación personal." })).not.toBeChecked();
  });
  it("should allow removing a now-unusable list requirement while keeping replacement recipient immutable", async () => {
    const data = fixture(), user = userEvent.setup(); data.initial.page.items = [{ ...data.metadata, requiresAllowlist: true }];
    await mount(data); await user.click(screen.getByRole("button", { name: "Reemitir Grupo inicial" }));
    expect(screen.getByLabelText("Correo destinatario")).toBeDisabled();
    const requirement = screen.getByRole("checkbox", { name: "Exigir coincidencia en la lista de habilitados" });
    expect(requirement).toBeEnabled(); expect(requirement).toBeChecked(); await user.click(requirement);
    expect(screen.getByRole("checkbox", { name: /Reconozco la dispensa/ })).not.toBeChecked();
    expect(requirement).toBeDisabled();
    expect(data.client.write).not.toHaveBeenCalled();
  });
  it("should load without mutation and preserve independent exemption and final confirmation", async () => {
    const data = fixture(), user = userEvent.setup(); await mount(data);
    expect(data.client.write).not.toHaveBeenCalled(); expect(data.client.page).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Exigir coincidencia en la lista de habilitados" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Guardar acción" })).toBeDisabled();
    await user.type(screen.getByLabelText("Nombre interno"), "Grupo inicial");
    await user.click(screen.getByRole("checkbox", { name: "Confirmo esta acción sobre la invitación personal." }));
    await user.click(screen.getByRole("button", { name: "Guardar acción" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Revisá el destinatario");
    expect(data.client.write).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Correo destinatario"), "recipient@example.test");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Confirmo esta acción sobre la invitación personal." })).not.toBeChecked();
  });

  it("should show the initial URL only in memory and update locally after one confirmed creation", async () => {
    const data = fixture(), user = userEvent.setup(); await mount(data); await emailProposal(user);
    await user.click(screen.getByRole("button", { name: "Guardar acción" }));
    expect(await screen.findByLabelText("Enlace personal")).toHaveValue(data.invitationUrl);
    await waitFor(() => expect(data.client.write).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Renombrar Grupo inicial" })).toBeEnabled();
    expect(JSON.stringify(window.sessionStorage)).not.toContain(data.invitationUrl);
    expect(JSON.stringify(window.sessionStorage)).not.toContain("recipient@example.test");
    expect(screen.getByRole("checkbox", { name: "Confirmo esta acción sobre la invitación personal." })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Ocultar enlace" }));
    expect(screen.queryByLabelText("Enlace personal")).not.toBeInTheDocument();
  });

  it("should recover a lost creation response by original GET without repeating the POST or recovering its URL", async () => {
    const data = fixture(), user = userEvent.setup();
    vi.mocked(data.client.write).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "La respuesta no llegó.", uncertain: true });
    await mount(data); await emailProposal(user); await user.click(screen.getByRole("button", { name: "Guardar acción" }));
    const original = vi.mocked(data.client.write).mock.calls[0][1].input.operationId;
    await screen.findByRole("button", { name: "Consultar operación original" });
    expect(screen.getByRole("button", { name: "Guardar acción" })).toBeDisabled();
    vi.mocked(data.client.operation).mockResolvedValueOnce({ status: "ready", value: { viewerId: data.initial.viewerId, original: { type: "create_personal_invitation", state: "completed", operationId: original, replayed: true, result: { invitationId: data.metadata.id, version: 1, created: true, changed: true } } } });
    await user.click(screen.getByRole("button", { name: "Consultar operación original" }));
    expect(await screen.findByText(/su enlace no se puede recuperar/)).toBeInTheDocument();
    expect(data.client.write).toHaveBeenCalledTimes(1);
    expect(data.client.operation).toHaveBeenCalledWith("synthetic", original, expect.any(AbortSignal));
    expect(screen.queryByLabelText("Enlace personal")).not.toBeInTheDocument();
  });

  it("should preserve confirmed creation when the following current read fails and block another write", async () => {
    const data = fixture(), user = userEvent.setup();
    vi.mocked(data.client.page).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No disponible.", uncertain: false });
    await mount(data); await emailProposal(user); await user.click(screen.getByRole("button", { name: "Guardar acción" }));
    expect(await screen.findByLabelText("Enlace personal")).toHaveValue(data.invitationUrl);
    expect(await screen.findByRole("alert")).toHaveTextContent("acción quedó confirmada");
    expect(screen.getByRole("button", { name: "Guardar acción" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Consultar operación original" })).not.toBeInTheDocument();
    expect(data.client.write).toHaveBeenCalledTimes(1);
  });

  it("should require explicit replacement and reset consent after selecting or changing a draft", async () => {
    const data = fixture(), user = userEvent.setup(); data.initial.page.items = [data.metadata]; data.initial.hasUsableAllowlist = true;
    await mount(data); await user.click(screen.getByRole("button", { name: "Reemitir Grupo inicial" }));
    expect(screen.getByRole("checkbox", { name: /Confirmo revocar Grupo inicial/ })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Confirmo esta acción sobre la invitación personal." }));
    await user.click(screen.getByRole("button", { name: "Guardar acción" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Revisá"); expect(data.client.write).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: /Confirmo revocar Grupo inicial/ }));
    expect(screen.getByRole("checkbox", { name: "Confirmo esta acción sobre la invitación personal." })).not.toBeChecked();
  });

  it("should keep phone OFF disabled without sending a hidden verification or creation", async () => {
    const data = fixture(true); data.initial.requiresAdditionalVerification = false; await mount(data);
    expect(screen.getByText(/código apagado no se emiten/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar acción" })).toBeDisabled(); expect(data.client.write).not.toHaveBeenCalled();
  });

  it("should hide all private content when the native page response belongs to an intermediate viewer", async () => {
    const data = fixture(), user = userEvent.setup(); data.initial.page.items = [data.metadata];
    vi.mocked(data.client.page).mockResolvedValueOnce({ status: "ready", value: { ...data.initial, viewerId: randomUUID() } });
    await mount(data); await user.click(screen.getByRole("button", { name: "Consultar estado actual" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La cuenta o el acceso cambió");
    expect(screen.queryByText(data.metadata.recipient.value)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Correo destinatario")).not.toBeInTheDocument();
  });

  it("should preserve original progress across a restored document and never POST on pageshow", async () => {
    const data = fixture(), user = userEvent.setup();
    vi.mocked(data.client.write).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "La respuesta no llegó.", uncertain: true });
    await mount(data); await emailProposal(user); await user.click(screen.getByRole("button", { name: "Guardar acción" }));
    await screen.findByRole("button", { name: "Consultar operación original" });
    await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
    await waitFor(() => expect(data.client.viewer).toHaveBeenCalled());
    expect(data.client.write).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeInTheDocument();
  });
});
