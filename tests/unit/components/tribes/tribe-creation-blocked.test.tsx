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

  it("renders the mail link as a native anchor that keeps its layout block", () => {
    render(<TribeCreationBlocked contactEmail="hola@tutribu.app" />);

    const contactLink = screen.getByRole("link", { name: "Escribir a hola@tutribu.app" });

    // The provider's routed links mark themselves with `data-slot`; the email client needs a plain browser anchor.
    expect(contactLink).not.toHaveAttribute("data-slot");
    expect(contactLink).toHaveClass("TribeCreationBlocked__contact");
  });

  it("explains who to contact when there is no contact email configured", () => {
    render(<TribeCreationBlocked contactEmail={null} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByText(/para pedir habilitación\.$/)
    ).toBeInTheDocument();
  });
});
