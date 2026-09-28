import { beforeEach, describe, it, expect, vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CreateTribeFormContainer } from "@/app/(platform)/-/crear/create-tribe-form-container";
import { CreateTribeForm } from "@/components/tribes/create-tribe-form";
import { navigateToUrl } from "@/lib/browser-navigation";

// Project-owned navigation boundary: jsdom cannot perform a real document
// navigation, so the test observes the requested URL instead.
vi.mock("@/lib/browser-navigation", () => ({
  navigateToUrl: vi.fn(),
}));

const fetchMock = global.fetch as Mock;

function respondWithJson(body: unknown, status: number) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );
}

function renderEnhancedForm() {
  const user = userEvent.setup();

  render(<CreateTribeFormContainer submitPath="/api/tribes" />);

  return user;
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/nombre de la tribu/i), "Matematica Pro");
  await user.click(screen.getByRole("button", { name: /^crear tribu$/i }));
}

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
        errorField="slug"
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

describe("CreateTribeFormContainer (enhanced submission)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    (navigateToUrl as Mock).mockReset();
  });

  it("posts the form fields asking for JSON and navigates to the created tribe", async () => {
    respondWithJson({ redirectUrl: "/matematica-pro", status: "created" }, 201);
    const user = renderEnhancedForm();

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(navigateToUrl).toHaveBeenCalledWith("/matematica-pro");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestPath, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = requestInit.body as FormData;

    expect(requestPath).toBe("/api/tribes");
    expect(requestInit.method).toBe("POST");
    expect(new Headers(requestInit.headers).get("accept")).toBe("application/json");
    expect(requestBody.get("name")).toBe("Matematica Pro");
    expect(requestBody.get("slug")).toBe("matematica-pro");
    expect(screen.getByRole("button", { name: /creando tribu/i })).toBeDisabled();
  });

  it("shows a slug conflict inline on the slug field without navigating", async () => {
    respondWithJson(
      {
        message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
        status: "slug-conflict",
        suggestedSlug: "matematica-pro-2",
      },
      409
    );
    const user = renderEnhancedForm();

    await fillAndSubmit(user);

    const slugInput = screen.getByLabelText(/^slug$/i);

    expect(await screen.findByText(/ese slug ya esta en uso/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(slugInput).toHaveFocus();
    });
    expect(slugInput).toHaveAttribute("aria-invalid", "true");
    expect(slugInput).toHaveAccessibleDescription(/ese slug ya esta en uso/i);
    expect(navigateToUrl).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^crear tribu$/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /usar sugerencia/i }));

    expect(slugInput).toHaveValue("matematica-pro-2");
    expect(slugInput).toHaveFocus();
    expect(slugInput).not.toHaveAttribute("aria-invalid");
  });

  it("marks the name field invalid and focuses it when the name is rejected", async () => {
    respondWithJson(
      { message: "Define un nombre para tu tribu.", status: "invalid-name" },
      422
    );
    const user = renderEnhancedForm();

    await fillAndSubmit(user);

    const nameInput = screen.getByLabelText(/nombre de la tribu/i);

    expect(await screen.findByText("Define un nombre para tu tribu.")).toBeInTheDocument();
    await waitFor(() => {
      expect(nameInput).toHaveFocus();
    });
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAccessibleDescription("Define un nombre para tu tribu.");
    expect(screen.getByLabelText(/^slug$/i)).not.toHaveAttribute("aria-invalid");
    expect(navigateToUrl).not.toHaveBeenCalled();

    await user.type(nameInput, " 2");

    expect(nameInput).not.toHaveAttribute("aria-invalid");
  });

  it("shows a safe Spanish message and re-enables submit when the network fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = renderEnhancedForm();

    await fillAndSubmit(user);

    const submitButton = await screen.findByRole("button", { name: /^crear tribu$/i });

    expect(
      await screen.findByText("No pudimos crear tu tribu. Intentalo otra vez.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
    expect(submitButton).toBeEnabled();
    await waitFor(() => {
      expect(submitButton).toHaveFocus();
    });
    expect(submitButton).toHaveAccessibleDescription(
      "No pudimos crear tu tribu. Intentalo otra vez."
    );
    expect(navigateToUrl).not.toHaveBeenCalled();
  });

  it("treats a response outside the public contract as an unexpected failure", async () => {
    respondWithJson({ redirectUrl: "//evil.example.com", status: "created" }, 201);
    const user = renderEnhancedForm();

    await fillAndSubmit(user);

    expect(
      await screen.findByText("No pudimos crear tu tribu. Intentalo otra vez.")
    ).toBeInTheDocument();
    expect(navigateToUrl).not.toHaveBeenCalled();
  });

  it("sends a single request while a submission is in flight", async () => {
    let resolveResponse: (response: Response) => void = () => undefined;

    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      })
    );
    const user = renderEnhancedForm();

    await fillAndSubmit(user);
    fireEvent.submit(screen.getByRole("button", { name: /creando tribu/i }).closest("form")!);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse(
      new Response(JSON.stringify({ redirectUrl: "/matematica-pro", status: "created" }), {
        status: 201,
      })
    );

    await waitFor(() => {
      expect(navigateToUrl).toHaveBeenCalledWith("/matematica-pro");
    });
  });

  it("lets the user resubmit after an error and hides the stale message", async () => {
    respondWithJson(
      {
        message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
        status: "slug-conflict",
        suggestedSlug: "matematica-pro-2",
      },
      409
    );
    const user = renderEnhancedForm();

    await fillAndSubmit(user);
    await user.click(await screen.findByRole("button", { name: /usar sugerencia/i }));

    respondWithJson({ redirectUrl: "/matematica-pro-2", status: "created" }, 201);
    await user.click(screen.getByRole("button", { name: /^crear tribu$/i }));

    await waitFor(() => {
      expect(navigateToUrl).toHaveBeenCalledWith("/matematica-pro-2");
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].body
    ).toBeInstanceOf(FormData);
    expect(
      ((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as FormData).get("slug")
    ).toBe("matematica-pro-2");
  });

  it("sends an expired session to sign in", async () => {
    respondWithJson(
      { redirectUrl: "/auth/signin?callbackUrl=%2F-%2Fcrear", status: "unauthenticated" },
      401
    );
    const user = renderEnhancedForm();

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(navigateToUrl).toHaveBeenCalledWith("/auth/signin?callbackUrl=%2F-%2Fcrear");
    });
  });
});
