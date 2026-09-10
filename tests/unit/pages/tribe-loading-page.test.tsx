import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import TribeLoadingPage from "@/app/(platform)/[slug]/loading";

describe("TribeLoadingPage", () => {
  it("renders an accessible tribe route loading state", () => {
    render(<TribeLoadingPage />);

    expect(
      screen.getByRole("status", {
        name: "Cargando seccion de tribu",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Cargando seccion de tribu")).toBeInTheDocument();
  });
});
