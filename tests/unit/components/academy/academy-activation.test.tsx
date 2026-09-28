import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";

import { AcademyActivation } from "@/components/academy/academy-activation";
import type { AcademySettingsDto } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";

// Framework boundary: jsdom has no Next router.
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

const fetchMock = global.fetch as Mock;
const refreshMock = vi.fn();

function respondWithJson(body: unknown, status: number) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status })
  );
}

function settings(overrides: Partial<AcademySettingsDto> = {}): AcademySettingsDto {
  return {
    accessModel: "legacy",
    admissionEnabled: false,
    benefits: [],
    configVersion: 0,
    description: "",
    offerVersion: 1,
    salesEnabled: false,
    title: "",
    ...overrides,
  };
}

describe("AcademyActivation", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    refreshMock.mockReset();
    (useRouter as Mock).mockReturnValue({ refresh: refreshMock });
  });

  it("activates the academy only after the leader confirms the effects", async () => {
    const user = userEvent.setup();
    respondWithJson(settings({ accessModel: "academy", configVersion: 1 }), 200);

    render(<AcademyActivation settings={settings()} tribeSlug="matematica-pro" />);

    expect(screen.getByText("Modo clásico")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Activar academia" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Tus integrantes actuales conservan todo lo que ven hoy, sin vencimiento.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sí, activar academia" }));

    await waitFor(() => expect(screen.getByText("Modo academia activo")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/academy/activation",
      expect.objectContaining({
        body: JSON.stringify({ expectedConfigVersion: 0 }),
        method: "POST",
      })
    );
    expect(screen.getByRole("status")).toHaveTextContent("Activaste la academia");
    expect(screen.getByRole("link", { name: "Gestionar academia" })).toHaveAttribute(
      "href",
      "/matematica-pro/academia/gestionar"
    );
    expect(refreshMock).toHaveBeenCalledOnce();
  });

  it("shows the current state when the configuration changed meanwhile", async () => {
    const user = userEvent.setup();
    respondWithJson(settings({ accessModel: "academy", configVersion: 2 }), 409);

    render(<AcademyActivation settings={settings()} tribeSlug="matematica-pro" />);
    await user.click(screen.getByRole("button", { name: "Activar academia" }));
    await user.click(screen.getByRole("button", { name: "Sí, activar academia" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("La configuración cambió")
    );
    expect(screen.getByText("Modo academia activo")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("keeps the tribe classic and explains the error when the server refuses", async () => {
    const user = userEvent.setup();
    respondWithJson({ message: "No tenés permisos para esta acción." }, 403);

    render(<AcademyActivation settings={settings()} tribeSlug="matematica-pro" />);
    await user.click(screen.getByRole("button", { name: "Activar academia" }));
    await user.click(screen.getByRole("button", { name: "Sí, activar academia" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("No tenés permisos para esta acción.")
    );
    expect(screen.getByText("Modo clásico")).toBeInTheDocument();
  });

  it("links to the management page when the academy is already active", () => {
    render(
      <AcademyActivation
        settings={settings({ accessModel: "academy", configVersion: 3 })}
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.queryByRole("button", { name: "Activar academia" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gestionar academia" })).toBeInTheDocument();
  });
});
