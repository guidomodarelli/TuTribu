/** Exercises real shared controls and viewer-scoped workflow with doubles only at own application ports. @module academy-invitation-management-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemedToaster } from "@golfo/ui";
import { InvitationsContainer } from "@/app/(platform)/[slug]/academia/admissions/invitations/invitations-container";
import type { PersonalInvitationManagementPageState } from "@/src/modules/academy-admissions/application/results/personal-invitation-management-page-state";
import type { PersonalInvitationManagementBrowserClient } from "@/src/modules/academy-admissions/application/ports/personal-invitation-management-browser-client";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { PERSONAL_INVITATION_MANAGEMENT_COPY } from "@/src/modules/academy-admissions/constants/personal-invitation-management-browser";
import { fromBuenosAiresMinuteKey, toBuenosAiresMinuteKey } from "@/src/modules/shared/application/date-time/buenos-aires-minute";

const CONFIRMATION = "Confirmo esta acción sobre la invitación personal.";

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
  return { initial, client, metadata, invitationUrl };
}
/** @returns After the native viewer observation enables the first step. */
async function ready() { await waitFor(() => expect(screen.getByLabelText("Nombre interno")).toBeEnabled()); }
/** @param data - Own fixture. @returns Mounted real container after its native viewer observation. */
async function mount(data: ReturnType<typeof fixture>) { render(<InvitationsContainer initialState={data.initial} client={data.client} />); await ready(); }
/** @param user - Actual DOM interaction driver. @returns After pressing the flow's own Continue. */
async function next(user: ReturnType<typeof userEvent.setup>) { await user.click(screen.getByRole("button", { name: "Continuar" })); }
/** @param user - Actual DOM interaction driver. @returns On the review step of a valid explicit email proposal, after its confirmation. */
async function emailProposal(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nombre interno"), "Grupo inicial");
  await user.type(screen.getByLabelText("Correo destinatario"), "recipient@example.test");
  await next(user);
  await user.click(screen.getByRole("checkbox", { name: /Reconozco la dispensa/ }));
  await next(user); await next(user);
  await user.click(screen.getByRole("checkbox", { name: CONFIRMATION }));
}

beforeEach(() => { window.sessionStorage.clear(); });
describe("personal invitation management controls", () => {
  it("should keep an inactive replacement target blocked after current metadata rather than converting its proposal", async () => {
    const data = fixture(), user = userEvent.setup(); data.initial.page.items = [data.metadata];
    vi.mocked(data.client.write).mockResolvedValueOnce({ status: "failed", code: "invitation_conflict", message: "La invitación cambió.", uncertain: false });
    vi.mocked(data.client.page).mockResolvedValueOnce({ status: "ready", value: { ...data.initial, page: { items: [{ ...data.metadata, status: "redeemed", version: 2, redeemedAt: new Date().toISOString() }], nextCursor: null } } });
    await mount(data); await user.click(screen.getByRole("button", { name: "Reemitir Grupo inicial" }));
    await next(user); await user.click(screen.getByRole("checkbox", { name: /Reconozco la dispensa/ })); await next(user); await next(user);
    await user.click(screen.getByRole("checkbox", { name: /Confirmo revocar/ })); await user.click(screen.getByRole("checkbox", { name: CONFIRMATION })); await user.click(screen.getByRole("button", { name: "Reemitir invitación" }));
    // A conflict blocks the action, so it stays next to the form with the read that resolves it.
    expect(await screen.findByRole("alert")).toHaveTextContent("La invitación cambió");
    await user.click(screen.getByRole("button", { name: "Consultar estado actual" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("reemisión dejó de ser aplicable");
    expect(screen.getByRole("button", { name: "Reemitir invitación" })).toBeDisabled(); expect(data.client.write).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Descartar selección" }));
    expect(screen.getByLabelText("Correo destinatario")).toHaveValue("");
  });
  it("should keep an absent selected resource blocked after a conflict until selection is explicitly discarded", async () => {
    const data = fixture(), user = userEvent.setup(); data.initial.page.items = [data.metadata];
    vi.mocked(data.client.write).mockResolvedValueOnce({ status: "failed", code: "invitation_conflict", message: "La invitación cambió.", uncertain: false });
    vi.mocked(data.client.page).mockResolvedValueOnce({ status: "ready", value: { ...data.initial, page: { items: [], nextCursor: null } } });
    await mount(data); await user.click(screen.getByRole("button", { name: "Renombrar Grupo inicial" }));
    await user.type(screen.getByLabelText("Nombre interno"), " actualizado"); await next(user);
    await user.click(screen.getByRole("checkbox", { name: CONFIRMATION })); await user.click(screen.getByRole("button", { name: "Guardar nombre" }));
    await screen.findByRole("alert"); await user.click(screen.getByRole("button", { name: "Consultar estado actual" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no aparece en esta vista");
    expect(screen.getByRole("button", { name: "Guardar nombre" })).toBeDisabled(); expect(data.client.write).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Descartar selección" }));
    expect(screen.getByLabelText("Correo destinatario")).toHaveValue("");
  });
  it("should allow removing a now-unusable list requirement while keeping replacement recipient immutable", async () => {
    const data = fixture(), user = userEvent.setup(); data.initial.page.items = [{ ...data.metadata, requiresAllowlist: true }];
    await mount(data); await user.click(screen.getByRole("button", { name: "Reemitir Grupo inicial" }));
    expect(screen.getByLabelText("Correo destinatario")).toBeDisabled();
    await next(user);
    const requirement = screen.getByRole("checkbox", { name: "Exigir coincidencia en la lista de habilitados" });
    expect(requirement).toBeEnabled(); expect(requirement).toBeChecked(); await user.click(requirement);
    expect(screen.getByRole("checkbox", { name: /Reconozco la dispensa/ })).not.toBeChecked();
    expect(requirement).toBeDisabled();
    expect(screen.getByText(PERSONAL_INVITATION_MANAGEMENT_COPY.exemptionRequired)).toBeVisible();
    expect(data.client.write).not.toHaveBeenCalled();
  });
  it("should load without mutation and explain each blocked step before the exemption and final confirmation", async () => {
    const data = fixture(), user = userEvent.setup(); await mount(data);
    expect(data.client.write).not.toHaveBeenCalled(); expect(data.client.page).not.toHaveBeenCalled();
    expect(screen.getByText(PERSONAL_INVITATION_MANAGEMENT_COPY.recipientRequired)).toBeVisible();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await user.type(screen.getByLabelText("Nombre interno"), "Grupo inicial");
    await user.type(screen.getByLabelText("Correo destinatario"), "invalid");
    await next(user);
    expect(screen.getByRole("checkbox", { name: "Exigir coincidencia en la lista de habilitados" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Reconozco la dispensa/ })); await next(user); await next(user);
    expect(screen.getByRole("button", { name: "Emitir invitación" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: CONFIRMATION }));
    await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Revisá el destinatario");
    expect(data.client.write).not.toHaveBeenCalled();
  });

  it("should initially require a usable list and submit a future expiry with an explicit UTC label", async () => {
    const data = fixture(), user = userEvent.setup(); data.initial.hasUsableAllowlist = true; await mount(data);
    await user.type(screen.getByLabelText("Nombre interno"), "Grupo futuro");
    await user.type(screen.getByLabelText("Correo destinatario"), "recipient@example.test");
    await next(user);
    expect(screen.getByRole("checkbox", { name: "Exigir coincidencia en la lista de habilitados" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /Reconozco la dispensa/ })).not.toBeInTheDocument();
    await next(user);
    const expiry = screen.getByLabelText("Vencimiento del enlace (hora de Argentina)");
    const expectedDefault = toBuenosAiresMinuteKey(new Date(new Date(data.initial.renderedAt).getTime() + ADMISSION_LIMIT.invitationDefaultValidityMs));
    expect(expiry).toHaveValue(expectedDefault);
    const selectedExpiry = toBuenosAiresMinuteKey(new Date(new Date(data.initial.renderedAt).getTime() + ADMISSION_LIMIT.invitationDefaultValidityMs + ADMISSION_LIMIT.invitationDefaultValidityMs));
    fireEvent.change(expiry, { target: { value: selectedExpiry } });
    await next(user);
    await user.click(screen.getByRole("checkbox", { name: CONFIRMATION }));
    await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    await waitFor(() => expect(data.client.write).toHaveBeenCalledTimes(1));
    const intent = vi.mocked(data.client.write).mock.calls[0][1];
    expect(intent.type).toBe("create_personal_invitation");
    expect(intent.input).toMatchObject({ requiresAllowlist: true, expiresAt: fromBuenosAiresMinuteKey(selectedExpiry)?.toISOString() });
    expect(intent.input).not.toHaveProperty("acknowledgeNoAllowlist");
  });

  it("should focus expired-date feedback before dispatch and clear stale feedback and consent after correction", async () => {
    const data = fixture(), user = userEvent.setup(); await mount(data);
    await user.type(screen.getByLabelText("Nombre interno"), "Grupo inicial");
    await user.type(screen.getByLabelText("Correo destinatario"), "recipient@example.test");
    await next(user); await user.click(screen.getByRole("checkbox", { name: /Reconozco la dispensa/ })); await next(user);
    fireEvent.change(screen.getByLabelText("Vencimiento del enlace (hora de Argentina)"), { target: { value: toBuenosAiresMinuteKey(new Date(data.initial.renderedAt)) } });
    await next(user);
    await user.click(screen.getByRole("checkbox", { name: CONFIRMATION }));
    await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    const feedback = await screen.findByRole("alert");
    await waitFor(() => expect(feedback).toHaveFocus());
    expect(data.client.write).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Atrás" }));
    const futureExpiry = toBuenosAiresMinuteKey(new Date(new Date(data.initial.renderedAt).getTime() + ADMISSION_LIMIT.invitationDefaultValidityMs));
    fireEvent.change(screen.getByLabelText("Vencimiento del enlace (hora de Argentina)"), { target: { value: futureExpiry } });
    await next(user);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: CONFIRMATION })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Emitir invitación" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: CONFIRMATION }));
    await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    await waitFor(() => expect(data.client.write).toHaveBeenCalledTimes(1));
  });

  it("should require a separate warning acknowledgement for no expiry before creating the personal link", async () => {
    const data = fixture(), user = userEvent.setup(); await mount(data);
    await user.type(screen.getByLabelText("Nombre interno"), "Grupo inicial");
    await user.type(screen.getByLabelText("Correo destinatario"), "recipient@example.test");
    await next(user); await user.click(screen.getByRole("checkbox", { name: /Reconozco la dispensa/ })); await next(user);
    await user.click(screen.getByRole("checkbox", { name: "Sin vencimiento" }));
    expect(screen.getByLabelText("Vencimiento del enlace (hora de Argentina)")).toBeDisabled();
    expect(screen.getByText(PERSONAL_INVITATION_MANAGEMENT_COPY.noExpiryRequired)).toBeVisible();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Reconozco que el enlace seguirá utilizable/ }));
    await next(user);
    await user.click(screen.getByRole("checkbox", { name: CONFIRMATION }));
    await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    await waitFor(() => expect(data.client.write).toHaveBeenCalledTimes(1));
    expect(vi.mocked(data.client.write).mock.calls[0][1].input).toMatchObject({ expiresAt: null, acknowledgeNoAllowlist: true });
  });

  it("should show the initial URL only in memory and start over after one confirmed creation", async () => {
    const data = fixture(), user = userEvent.setup(); await mount(data); await emailProposal(user);
    await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    expect(await screen.findByLabelText("Enlace personal")).toHaveValue(data.invitationUrl);
    await waitFor(() => expect(data.client.write).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Renombrar Grupo inicial" })).toBeEnabled();
    expect(JSON.stringify(window.sessionStorage)).not.toContain(data.invitationUrl);
    expect(JSON.stringify(window.sessionStorage)).not.toContain("recipient@example.test");
    // The flow returns to its first step for the next invitation.
    expect(await screen.findByLabelText("Correo destinatario")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Ocultar enlace" }));
    expect(screen.queryByLabelText("Enlace personal")).not.toBeInTheDocument();
  });

  it("should keep the one-time link and its feedback when the leader returns to the window with the same account", async () => {
    const data = fixture(), user = userEvent.setup(); await mount(data); await emailProposal(user);
    await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    expect(await screen.findByLabelText("Enlace personal")).toHaveValue(data.invitationUrl);
    await waitFor(() => expect(data.client.page).toHaveBeenCalledTimes(1));
    const viewerChecks = vi.mocked(data.client.viewer).mock.calls.length;
    await act(async () => { window.dispatchEvent(new FocusEvent("focus")); });
    await waitFor(() => expect(data.client.viewer).toHaveBeenCalledTimes(viewerChecks + 1));
    // Regaining focus rechecks the tribe authority through one page read, without hiding the link or writing again.
    await waitFor(() => expect(data.client.page).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Enlace personal")).toHaveValue(data.invitationUrl);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(data.client.write).toHaveBeenCalledTimes(1);
  });

  it("should hide the one-time link when the leader lost the tribe authority while the window was in the background", async () => {
    const data = fixture(), user = userEvent.setup(); await mount(data); await emailProposal(user);
    await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    expect(await screen.findByLabelText("Enlace personal")).toHaveValue(data.invitationUrl);
    await waitFor(() => expect(data.client.page).toHaveBeenCalledTimes(1));
    vi.mocked(data.client.page).mockResolvedValueOnce({ status: "failed", code: "permission_denied", message: "Sin permiso.", uncertain: false });
    await act(async () => { window.dispatchEvent(new FocusEvent("focus")); });
    expect(await screen.findByRole("alert")).toHaveTextContent(PERSONAL_INVITATION_MANAGEMENT_COPY.account);
    expect(screen.queryByLabelText("Enlace personal")).not.toBeInTheDocument();
    // The closed view keeps a way back instead of leaving only a sentence.
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  });

  it("should discard a slow focus recheck once an explicit read has published a newer page", async () => {
    const data = fixture(), user = userEvent.setup(); data.initial.page.items = [data.metadata];
    let resolveFocusRead!: (value: Awaited<ReturnType<PersonalInvitationManagementBrowserClient["page"]>>) => void;
    vi.mocked(data.client.page)
      .mockImplementationOnce(async () => new Promise((resolve) => { resolveFocusRead = resolve; }))
      .mockResolvedValueOnce({ status: "ready", value: { ...data.initial, page: { items: [{ ...data.metadata, internalName: "Grupo actualizado", version: 2 }], nextCursor: null } } });
    await mount(data);
    await act(async () => { window.dispatchEvent(new FocusEvent("focus")); });
    await waitFor(() => expect(data.client.page).toHaveBeenCalledTimes(1));
    await user.click(screen.getByText("Consultar y ver más")); await user.click(screen.getByRole("button", { name: "Consultar estado actual" }));
    expect(await screen.findByRole("button", { name: "Renombrar Grupo actualizado" })).toBeInTheDocument();
    // The superseded focus answer arrives last with the older page.
    await act(async () => resolveFocusRead({ status: "ready", value: { ...data.initial, page: { items: [data.metadata], nextCursor: null } } }));
    expect(screen.getByRole("button", { name: "Renombrar Grupo actualizado" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Renombrar Grupo inicial" })).not.toBeInTheDocument();
  });

  it("should keep the one-time link silently when the focus recheck cannot reach the server", async () => {
    const data = fixture(), user = userEvent.setup(); await mount(data); await emailProposal(user);
    await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    expect(await screen.findByLabelText("Enlace personal")).toHaveValue(data.invitationUrl);
    await waitFor(() => expect(data.client.page).toHaveBeenCalledTimes(1));
    vi.mocked(data.client.page).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No disponible.", uncertain: false });
    await act(async () => { window.dispatchEvent(new FocusEvent("focus")); });
    await waitFor(() => expect(data.client.page).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Enlace personal")).toHaveValue(data.invitationUrl);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("should hide the one-time link when the window regains focus under another account", async () => {
    const data = fixture(), user = userEvent.setup(); await mount(data); await emailProposal(user);
    await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    expect(await screen.findByLabelText("Enlace personal")).toHaveValue(data.invitationUrl);
    vi.mocked(data.client.viewer).mockResolvedValue({ status: "ready", value: { id: randomUUID() } });
    await act(async () => { window.dispatchEvent(new FocusEvent("focus")); });
    expect(await screen.findByRole("alert")).toHaveTextContent(PERSONAL_INVITATION_MANAGEMENT_COPY.account);
    expect(screen.queryByLabelText("Enlace personal")).not.toBeInTheDocument();
  });

  it("should copy the one-time link within the click, without another request, while the read that follows the write is pending", async () => {
    const data = fixture(), user = userEvent.setup();
    let resolvePage!: (value: Awaited<ReturnType<PersonalInvitationManagementBrowserClient["page"]>>) => void;
    vi.mocked(data.client.page).mockImplementationOnce(async () => new Promise((resolve) => { resolvePage = resolve; }));
    await mount(data); await emailProposal(user);
    await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    expect(await screen.findByLabelText("Enlace personal")).toHaveValue(data.invitationUrl);
    await waitFor(() => expect(data.client.page).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Copiar enlace" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Copiar enlace" }));
    await waitFor(async () => expect(await navigator.clipboard.readText()).toBe(data.invitationUrl));
    // Copying never sends its own request: only the read that follows the write is in flight.
    expect(data.client.page).toHaveBeenCalledTimes(1);
    await act(async () => resolvePage({ status: "ready", value: { ...data.initial, page: { items: [data.metadata], nextCursor: null } } }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Renombrar Grupo inicial" })).toBeEnabled());
    expect(data.client.write).toHaveBeenCalledTimes(1);
  });

  it("should recover a lost creation response by original GET without repeating the POST or recovering its URL", async () => {
    const data = fixture(), user = userEvent.setup();
    vi.mocked(data.client.write).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "La respuesta no llegó.", uncertain: true });
    await mount(data); await emailProposal(user); await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    const original = vi.mocked(data.client.write).mock.calls[0][1].input.operationId;
    await screen.findByRole("button", { name: "Consultar operación original" });
    expect(screen.getByRole("button", { name: "Emitir invitación" })).toBeDisabled();
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
    await mount(data); await emailProposal(user); await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    expect(await screen.findByLabelText("Enlace personal")).toHaveValue(data.invitationUrl);
    expect(await screen.findByText(PERSONAL_INVITATION_MANAGEMENT_COPY.currentRequired)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Consultar operación original" })).not.toBeInTheDocument();
    expect(data.client.write).toHaveBeenCalledTimes(1);
  });

  it("should require explicit replacement and reset consent after selecting or changing a draft", async () => {
    const data = fixture(), user = userEvent.setup(); data.initial.page.items = [data.metadata]; data.initial.hasUsableAllowlist = true;
    await mount(data); await user.click(screen.getByRole("button", { name: "Reemitir Grupo inicial" }));
    await next(user); await user.click(screen.getByRole("checkbox", { name: /Reconozco la dispensa/ })); await next(user); await next(user);
    expect(screen.getByRole("checkbox", { name: /Confirmo revocar Grupo inicial/ })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: CONFIRMATION }));
    expect(screen.getByText(PERSONAL_INVITATION_MANAGEMENT_COPY.replacementRequired)).toBeVisible();
    expect(screen.getByRole("button", { name: "Reemitir invitación" })).toBeDisabled(); expect(data.client.write).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: /Confirmo revocar Grupo inicial/ }));
    expect(screen.getByRole("checkbox", { name: CONFIRMATION })).not.toBeChecked();
  });

  it("should keep phone OFF disabled without sending a hidden verification or creation", async () => {
    const data = fixture(true); data.initial.requiresAdditionalVerification = false;
    render(<InvitationsContainer initialState={data.initial} client={data.client} />);
    expect(await screen.findByText(/código apagado no se emiten/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled(); expect(data.client.write).not.toHaveBeenCalled();
  });

  it("should require a separate redeemed-authorization acknowledgement before the exact withdrawal", async () => {
    const data = fixture(), user = userEvent.setup(), now = new Date().toISOString();
    const redeemed = { ...data.metadata, status: "redeemed" as const, version: 2, redeemedAt: now };
    data.initial.page.items = [redeemed];
    vi.mocked(data.client.page).mockResolvedValue({ status: "ready", value: { ...data.initial, page: { items: [{ ...redeemed, version: 3, authorizationRevokedAt: now }], nextCursor: null } } });
    await mount(data);
    expect(screen.queryByRole("button", { name: "Reemitir Grupo inicial" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revocar Grupo inicial" }));
    expect(screen.getByText(PERSONAL_INVITATION_MANAGEMENT_COPY.reasonRequired)).toBeVisible();
    await user.type(screen.getByLabelText("Motivo interno"), "Retiro confirmado");
    expect(screen.getByText(PERSONAL_INVITATION_MANAGEMENT_COPY.withdrawalRequired)).toBeVisible();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Confirmo retirar la autorización canjeada/ }));
    await next(user);
    await user.click(screen.getByRole("checkbox", { name: CONFIRMATION }));
    await user.click(screen.getByRole("button", { name: "Retirar autorización" }));
    await waitFor(() => expect(data.client.write).toHaveBeenCalledTimes(1));
    expect(data.client.write).toHaveBeenCalledWith("synthetic", expect.objectContaining({ type: "revoke_personal_invitation", invitationId: data.metadata.id, input: expect.objectContaining({ confirmed: true, expectedVersion: 2, revokeRedeemedAuthorization: true, reason: "Retiro confirmado" }) }), expect.any(AbortSignal));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Revocar Grupo inicial" })).not.toBeInTheDocument());
  });

  it("should hide all private content when the native page response belongs to an intermediate viewer", async () => {
    const data = fixture(), user = userEvent.setup(); data.initial.page.items = [data.metadata];
    vi.mocked(data.client.page).mockResolvedValueOnce({ status: "ready", value: { ...data.initial, viewerId: randomUUID() } });
    await mount(data); await user.click(screen.getByText("Consultar y ver más")); await user.click(screen.getByRole("button", { name: "Consultar estado actual" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La cuenta o el acceso cambió");
    expect(screen.queryByText(data.metadata.recipient.value)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Correo destinatario")).not.toBeInTheDocument();
  });

  it("should preserve original progress across a restored document and never POST on pageshow", async () => {
    const data = fixture(), user = userEvent.setup();
    vi.mocked(data.client.write).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "La respuesta no llegó.", uncertain: true });
    await mount(data); await emailProposal(user); await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    await screen.findByRole("button", { name: "Consultar operación original" });
    await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
    await waitFor(() => expect(data.client.viewer).toHaveBeenCalled());
    expect(data.client.write).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeInTheDocument();
  });
});

describe("personal invitation save feedback", () => {
  // Sonner schedules a removal timer after a toast closes; fake timers (advancing with real time in vitest.config)
  // keep the waits intact and restoring real timers discards it before jsdom is torn down.
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  /** @param data - Own fixture. @returns The real container next to the real shared toaster, after its native viewer observation. */
  async function mountWithToaster(data: ReturnType<typeof fixture>) {
    render(<><InvitationsContainer initialState={data.initial} client={data.client} /><ThemedToaster /></>);
    await ready();
  }

  it("should keep the pressed save busy and focused with its own label while the write is pending, then confirm it in its toast", async () => {
    const data = fixture(), user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let resolveWrite!: (value: Awaited<ReturnType<PersonalInvitationManagementBrowserClient["write"]>>) => void;
    vi.mocked(data.client.write).mockImplementationOnce(async () => new Promise((resolve) => { resolveWrite = resolve; }));
    await mountWithToaster(data); await emailProposal(user);
    await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    await waitFor(() => expect(data.client.write).toHaveBeenCalledOnce());
    const save = screen.getByRole("button", { name: "Emitir invitación" });
    expect(save).toHaveAttribute("aria-busy", "true");
    expect(save).not.toBeDisabled();
    expect(save).toHaveFocus();
    expect(screen.getByRole("button", { name: "Atrás" })).toBeDisabled();
    expect(await screen.findByText(PERSONAL_INVITATION_MANAGEMENT_COPY.saving)).toBeInTheDocument();
    const management = screen.getByRole("region", { name: "Gestión de invitaciones personales" });
    expect(within(management).queryByText(PERSONAL_INVITATION_MANAGEMENT_COPY.saving)).not.toBeInTheDocument();
    const intent = vi.mocked(data.client.write).mock.calls[0][1];
    await act(async () => resolveWrite({ status: "ready", value: { viewerId: data.initial.viewerId, outcome: { state: "completed", operationId: intent.input.operationId, replayed: false, result: { invitationId: data.metadata.id, version: 1, changed: true, created: true }, invitationUrl: data.invitationUrl } } }));
    await waitFor(() => expect(document.querySelector("[data-sonner-toaster]")).toHaveTextContent(PERSONAL_INVITATION_MANAGEMENT_COPY.saved));
    expect(within(management).queryByText(PERSONAL_INVITATION_MANAGEMENT_COPY.saved)).not.toBeInTheDocument();
  });

  it("should keep the final action idle while only the current state is read", async () => {
    const data = fixture(), user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let resolvePage!: (value: Awaited<ReturnType<PersonalInvitationManagementBrowserClient["page"]>>) => void;
    vi.mocked(data.client.page).mockImplementationOnce(async () => new Promise((resolve) => { resolvePage = resolve; }));
    await mountWithToaster(data);
    await user.click(screen.getByText("Consultar y ver más"));
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" }));
    await waitFor(() => expect(data.client.page).toHaveBeenCalledOnce());
    expect(screen.getByText(PERSONAL_INVITATION_MANAGEMENT_COPY.reading)).toBeVisible();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await act(async () => resolvePage({ status: "ready", value: { ...data.initial, page: { items: [], nextCursor: null } } }));
    await waitFor(() => expect(document.querySelector("[data-sonner-toaster]")).toHaveTextContent(PERSONAL_INVITATION_MANAGEMENT_COPY.current));
  });

  it("should announce a definitive save failure once, in the write's toast", async () => {
    const data = fixture(), user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime }), message = "No pudimos guardar la invitación. Revisá los datos.";
    vi.mocked(data.client.write).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message, uncertain: false });
    await mountWithToaster(data); await emailProposal(user);
    await user.click(screen.getByRole("button", { name: "Emitir invitación" }));
    await waitFor(() => expect(document.querySelector("[data-sonner-toaster]")).toHaveTextContent(message));
    expect(within(screen.getByRole("region", { name: "Gestión de invitaciones personales" })).queryByText(message)).not.toBeInTheDocument();
    expect(data.client.write).toHaveBeenCalledOnce();
  });
});

describe("invitation history «Ver más»", () => {
  it("should add the next page below the shown invitations without repeating one, start again from the fresh first page after a background reread and show a failure next to its button", async () => {
    const data = fixture(), user = userEvent.setup();
    const older = { ...data.metadata, id: randomUUID(), internalName: "Grupo anterior", recipient: { type: "email" as const, value: "older@example.test" } };
    const failure = "No pudimos consultar más invitaciones. Volvé a intentarlo.";
    const renamed = () => screen.getAllByRole("button", { name: /^Renombrar / }).map((button) => button.getAttribute("aria-label"));
    data.initial.page = { items: [data.metadata], nextCursor: "synthetic-cursor-1" };
    let finish!: (result: Awaited<ReturnType<PersonalInvitationManagementBrowserClient["page"]>>) => void;
    vi.mocked(data.client.page)
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce({ status: "ready", value: { ...data.initial, page: { items: [data.metadata], nextCursor: "synthetic-cursor-1" } } })
      .mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: failure, uncertain: false });
    await mount(data);
    await user.click(screen.getByText("Consultar y ver más"));

    await user.click(screen.getByRole("button", { name: "Ver más invitaciones" }));
    await waitFor(() => expect(data.client.page).toHaveBeenCalledOnce());
    expect(data.client.page).toHaveBeenLastCalledWith(data.initial.slug, { limit: 25, cursor: "synthetic-cursor-1" }, expect.any(AbortSignal));
    // While the next page loads, the shown invitation stays and only its button reports progress.
    expect(renamed()).toEqual([`Renombrar ${data.metadata.internalName}`]);
    expect(screen.getByRole("button", { name: "Ver más invitaciones" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(PERSONAL_INVITATION_MANAGEMENT_COPY.reading)).not.toBeInTheDocument();

    // The next page repeats the shown invitation: it keeps its place and the older one follows.
    await act(async () => { finish({ status: "ready", value: { ...data.initial, page: { items: [older, data.metadata], nextCursor: "synthetic-cursor-2" }, query: { limit: 25, cursor: "synthetic-cursor-1" } } }); });
    await waitFor(() => expect(renamed()).toEqual([`Renombrar ${data.metadata.internalName}`, `Renombrar ${older.internalName}`]));

    // Returning to the window rereads the first page and shows it with its own cursor: an older invitation kept below
    // it could carry a version that a later rename or revocation would send as current.
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(data.client.page).toHaveBeenCalledTimes(2));
    expect(data.client.page).toHaveBeenLastCalledWith(data.initial.slug, { limit: 25 }, expect.any(AbortSignal));
    await waitFor(() => expect(renamed()).toEqual([`Renombrar ${data.metadata.internalName}`]));

    await user.click(screen.getByRole("button", { name: "Ver más invitaciones" }));
    await waitFor(() => expect(data.client.page).toHaveBeenCalledTimes(3));
    expect(data.client.page).toHaveBeenLastCalledWith(data.initial.slug, { limit: 25, cursor: "synthetic-cursor-1" }, expect.any(AbortSignal));
    const alert = await screen.findByText(failure);
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert.parentElement).toContainElement(screen.getByRole("button", { name: "Ver más invitaciones" }));
    expect(renamed()).toHaveLength(1);
  });
});
