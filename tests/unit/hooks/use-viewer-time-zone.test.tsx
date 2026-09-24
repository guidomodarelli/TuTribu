import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";

function ViewerTimeZoneProbe() {
  return <output>{useViewerTimeZone() ?? "server"}</output>;
}

describe("useViewerTimeZone", () => {
  it("renders no time zone on the server so hydration markup is stable", () => {
    expect(renderToString(<ViewerTimeZoneProbe />)).toContain("server");
  });

  it("reads the browser time zone on the client", () => {
    render(<ViewerTimeZoneProbe />);

    expect(screen.getByRole("status")).toHaveTextContent(
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
  });
});
