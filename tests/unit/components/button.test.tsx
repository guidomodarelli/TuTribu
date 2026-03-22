import { render, screen } from "@testing-library/react";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders an accessible button label", () => {
    render(<Button type="button">Launch next step</Button>);

    expect(
      screen.getByRole("button", { name: /launch next step/i })
    ).toBeInTheDocument();
  });
});
