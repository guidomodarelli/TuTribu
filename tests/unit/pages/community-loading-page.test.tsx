import { render, screen } from "@testing-library/react";

import CommunityLoadingPage from "@/app/(platform)/comunidad/[slug]/loading";

describe("CommunityLoadingPage", () => {
  it("renders an accessible community route loading state", () => {
    render(<CommunityLoadingPage />);

    expect(
      screen.getByRole("status", {
        name: "Cargando seccion de comunidad",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Cargando seccion de comunidad")).toBeInTheDocument();
  });
});
