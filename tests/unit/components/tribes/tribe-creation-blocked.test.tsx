import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { TribeCreationBlocked } from "@/components/tribes/tribe-creation-blocked";

describe("TribeCreationBlocked", () => {
  it("titles the page and offers a mail link to request access", () => {
    render(<TribeCreationBlocked contactEmail="hola@tutribu.app" />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Todavía no tienes permiso para crear una tribu",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Escribir a hola@tutribu.app" })
    ).toHaveAttribute("href", "mailto:hola@tutribu.app");
  });

  it("explains who to contact when there is no contact email configured", () => {
    render(<TribeCreationBlocked contactEmail={null} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByText(/para pedir habilitación\.$/)
    ).toBeInTheDocument();
  });
});
