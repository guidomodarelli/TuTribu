import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CreateTribeForm } from "@/components/tribes/create-tribe-form";

describe("CreateTribeForm", () => {
  it("submits tribe creation to the configured path with POST", () => {
    render(<CreateTribeForm submitPath="/api/tribes" />);

    const submitButton = screen.getByRole("button", { name: /crear tribu/i });
    const form = submitButton.closest("form");

    expect(form).toHaveAttribute("action", "/api/tribes");
    expect(form).toHaveAttribute("method", "post");
  });

  it("suggests a slug from the tribe name", async () => {
    const user = userEvent.setup();

    render(<CreateTribeForm submitPath="/-/crear" />);

    await user.type(screen.getByLabelText(/nombre de la tribu/i), "Tribu de Algebra");

    expect(screen.getByLabelText(/slug/i)).toHaveValue("tribu-de-algebra");
    expect(screen.getByText(/\/tribu-de-algebra/i)).toBeInTheDocument();
    expect(screen.getByText(/^sincronizado$/i)).toBeInTheDocument();
  });

  it("stops syncing the slug once the user edits it manually", async () => {
    const user = userEvent.setup();

    render(<CreateTribeForm submitPath="/-/crear" />);

    await user.type(screen.getByLabelText(/nombre de la tribu/i), "Tribu de Algebra");
    await user.clear(screen.getByLabelText(/slug/i));
    await user.type(screen.getByLabelText(/slug/i), "algebra-pro");
    await user.clear(screen.getByLabelText(/nombre de la tribu/i));
    await user.type(screen.getByLabelText(/nombre de la tribu/i), "Tribu de Historia");

    expect(screen.getByLabelText(/slug/i)).toHaveValue("algebra-pro");
    expect(screen.getByText(/^editado$/i)).toBeInTheDocument();
  });

  it("keeps syncing when the initial slug already matches the initial name", async () => {
    const user = userEvent.setup();

    render(
      <CreateTribeForm
        initialName="Tribu de Algebra"
        initialSlug="tribu-de-algebra"
        submitPath="/-/crear"
      />
    );

    await user.clear(screen.getByLabelText(/nombre de la tribu/i));
    await user.type(screen.getByLabelText(/nombre de la tribu/i), "Tribu de Historia");

    expect(screen.getByLabelText(/slug/i)).toHaveValue("tribu-de-historia");
    expect(screen.getByText(/^sincronizado$/i)).toBeInTheDocument();
  });

  it("lets the user resync the slug from the tribe name", async () => {
    const user = userEvent.setup();

    render(<CreateTribeForm submitPath="/-/crear" />);

    await user.type(screen.getByLabelText(/nombre de la tribu/i), "Tribu de Algebra");
    await user.clear(screen.getByLabelText(/slug/i));
    await user.type(screen.getByLabelText(/slug/i), "algebra-pro");
    await user.click(screen.getByRole("button", { name: /sincronizar con el nombre/i }));

    expect(screen.getByLabelText(/slug/i)).toHaveValue("tribu-de-algebra");
    expect(screen.getByText(/\/tribu-de-algebra/i)).toBeInTheDocument();
    expect(screen.getByText(/^sincronizado$/i)).toBeInTheDocument();
  });

  it("lets the user apply the suggested slug from a conflict response", async () => {
    const user = userEvent.setup();

    render(
      <CreateTribeForm
        errorMessage="Ese slug ya esta en uso. Puedes probar con la sugerencia."
        initialName="Matematica Pro"
        initialSlug="matematica-pro"
        submitPath="/-/crear"
        suggestedSlug="matematica-pro-2"
      />
    );

    expect(
      screen.getByText(/ese slug ya esta en uso\. puedes probar con la sugerencia\./i)
    ).toBeInTheDocument();

    const slugInput = screen.getByLabelText(/slug/i);

    expect(slugInput).toHaveAccessibleDescription(
      /ese slug ya esta en uso. puedes probar con la sugerencia./i
    );

    await user.click(screen.getByRole("button", { name: /usar sugerencia/i }));

    expect(slugInput).toHaveValue("matematica-pro-2");
    expect(slugInput).toHaveFocus();
    await waitFor(() => {
      expect(
        screen.queryByText(/ese slug ya esta en uso/i)
      ).not.toBeInTheDocument();
    });
    expect(slugInput).not.toHaveAttribute("aria-describedby");
  });

  it("keeps the slug canonical when the user types a trailing separator", async () => {
    const user = userEvent.setup();

    render(<CreateTribeForm submitPath="/-/crear" />);

    await user.type(screen.getByLabelText(/slug/i), "matematica-pro-");
    expect(screen.getByDisplayValue("matematica-pro-")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("matematica-pro")
    ).toBeInTheDocument();
    expect(screen.getByText(/\/matematica-pro/i)).toBeInTheDocument();

    await user.tab();

    expect(screen.getByLabelText(/slug/i)).toHaveValue("matematica-pro");
  });

  it("locks the submit button after the first submit so the tribe is created once", () => {
    render(<CreateTribeForm initialName="Tribu de Algebra" submitPath="/api/tribes" />);

    const submitButton = screen.getByRole("button", { name: /crear tribu/i });
    const form = submitButton.closest("form");

    expect(form).not.toBeNull();

    const firstSubmitAllowed = fireEvent.submit(form!);
    const secondSubmitAllowed = fireEvent.submit(form!);

    expect(firstSubmitAllowed).toBe(true);
    expect(secondSubmitAllowed).toBe(false);
    expect(screen.getByRole("button", { name: /creando tribu/i })).toBeDisabled();
  });

  it("re-enables the submit button when the page is restored from the back-forward cache", () => {
    render(<CreateTribeForm initialName="Tribu de Algebra" submitPath="/api/tribes" />);

    fireEvent.submit(screen.getByRole("button", { name: /crear tribu/i }).closest("form")!);

    expect(screen.getByRole("button", { name: /creando tribu/i })).toBeDisabled();

    const restoreEvent = new Event("pageshow");

    Object.defineProperty(restoreEvent, "persisted", { value: true });
    fireEvent(window, restoreEvent);

    expect(screen.getByRole("button", { name: /^crear tribu$/i })).toBeEnabled();
  });

  it("disables the resync action while the slug already matches the name", async () => {
    const user = userEvent.setup();

    render(<CreateTribeForm submitPath="/-/crear" />);

    await user.type(screen.getByLabelText(/nombre de la tribu/i), "Tribu de Algebra");

    const resyncButton = screen.getByRole("button", {
      name: /sincronizar con el nombre/i,
    });

    expect(resyncButton).toBeDisabled();

    await user.type(screen.getByLabelText(/slug/i), "-pro");

    expect(resyncButton).toBeEnabled();
    expect(await screen.findByText(/^editado$/i)).toBeInTheDocument();
  });
});
