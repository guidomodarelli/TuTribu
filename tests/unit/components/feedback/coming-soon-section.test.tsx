/** Renders the coming-soon placeholder the way tribe section pages mount it inside the platform layout. */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ComingSoonSection } from "@/components/feedback/coming-soon-section";

describe("ComingSoonSection", () => {
  it("names its region after the section heading and explains it is not available yet", () => {
    render(<ComingSoonSection heading="Méritos" />);

    const region = screen.getByRole("region", { name: "Méritos" });

    expect(within(region).getByRole("heading", { level: 1, name: "Méritos" })).toBeInTheDocument();
    expect(within(region).getByText("Próximamente")).toBeInTheDocument();
    expect(within(region).getByText("Esta sección está en construcción.")).toBeInTheDocument();
  });

  it("stays inside the layout's main landmark instead of opening a second one", () => {
    render(
      <main aria-label="Contenido de la tribu">
        <ComingSoonSection heading="Méritos" />
      </main>
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
  });
});
