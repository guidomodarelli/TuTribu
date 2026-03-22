import { render, screen } from "@testing-library/react";

import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders the scaffold hero content", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: /academiaonline is ready to evolve into a focused online community platform/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open dashboard scaffold/i })
    ).toHaveAttribute("href", "/dashboard");
  });
});
