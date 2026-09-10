import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import TribeSegmentLayout from "@/app/(platform)/[slug]/layout";

const useParamsMock = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => useParamsMock(),
}));

describe("TribeSegmentLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    useParamsMock.mockReturnValue({ slug: "matematica-pro" });
  });

  it("renders the page content untouched and mounts the presence heartbeat without reading params", () => {
    render(
      <TribeSegmentLayout>
        <main>Contenido de la tribu</main>
      </TribeSegmentLayout>
    );

    expect(screen.getByRole("main")).toHaveTextContent("Contenido de la tribu");
    // The layout itself takes no `params`: the slug is resolved on the client.
    expect(TribeSegmentLayout.length).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/presence",
      expect.objectContaining({ method: "POST" })
    );
  });
});
