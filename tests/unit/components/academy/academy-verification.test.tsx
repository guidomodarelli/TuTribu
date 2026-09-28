import { beforeEach, describe, expect, it, type Mock } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AcademyVerification } from "@/components/academy/academy-verification";

const fetchMock = global.fetch as Mock;

const provider = {
  displayName: "Broker A",
  id: "6e4f5c2b-9b7f-4d2e-8a3f-4c5b6d7e8f90",
  instructions: "Abrí tu cuenta con el enlace.",
  isActive: true,
  key: "broker-a",
  linkUrl: "https://broker.example/alta",
};

describe("AcademyVerification", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("shows providers without a request as not requested and opens the link safely", () => {
    render(<AcademyVerification providers={[provider]} tribeSlug="tribu" verifications={[]} />);

    const link = screen.getByRole("link", { name: "Abrir instrucciones del proveedor" });

    expect(screen.getByText("Sin solicitar")).toBeInTheDocument();
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByLabelText(/dni|clave|contraseña/i)).not.toBeInTheDocument();
  });

  it("requests the verification and shows it as pending", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          declaredEmail: null,
          decisionReason: null,
          id: "5d3f4b1a-8a6e-4c1d-9f2e-3b4a5c6d7e8f",
          providerDisplayName: "Broker A",
          providerId: provider.id,
          status: "pending",
          updatedAt: "2026-06-02T12:00:00.000Z",
          version: 1,
        }),
        { headers: { "Content-Type": "application/json" }, status: 201 }
      )
    );

    render(<AcademyVerification providers={[provider]} tribeSlug="tribu" verifications={[]} />);
    await user.click(screen.getByRole("button", { name: "Solicitar verificación" }));

    const item = screen.getByRole("listitem");
    expect(await within(item).findByText("En revisión")).toBeInTheDocument();
    expect(within(item).getByRole("status")).toHaveTextContent("Tu solicitud está en revisión.");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      declaredEmail: "",
      providerId: provider.id,
    });
  });

  it("shows the safe reason of a rejection", () => {
    render(
      <AcademyVerification
        providers={[provider]}
        tribeSlug="tribu"
        verifications={[
          {
            declaredEmail: null,
            decisionReason: "No encontramos la cuenta",
            id: "5d3f4b1a-8a6e-4c1d-9f2e-3b4a5c6d7e8f",
            providerDisplayName: "Broker A",
            providerId: provider.id,
            status: "rejected",
            updatedAt: "2026-06-02T12:00:00.000Z",
            version: 2,
          },
        ]}
      />
    );

    expect(screen.getByText("Rechazada: No encontramos la cuenta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver a solicitar" })).toBeInTheDocument();
  });
});
