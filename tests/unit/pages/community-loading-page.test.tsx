import { render, screen } from "@testing-library/react";

import CommunityLoadingPage from "@/app/(platform)/tribu/[slug]/loading";

describe("CommunityLoadingPage", () => {
  it("renders an accessible community route loading state", () => {
    render(<CommunityLoadingPage />);

    expect(
      screen.getByRole("status", {
        name: "Cargando seccion de tribu",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Cargando seccion de tribu")).toBeInTheDocument();
  });
});
