const spaceGrotesk = jest.fn(() => ({
  variable: "space-grotesk-variable",
}));
const ibmPlexMono = jest.fn(() => ({
  variable: "ibm-plex-mono-variable",
}));

jest.mock("next/font/google", () => ({
  IBM_Plex_Mono: ibmPlexMono,
  Space_Grotesk: spaceGrotesk,
}));

describe("font preload config", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps the root sans font preloaded and avoids globally preloading the supporting mono font", async () => {
    await import("@/app/layout");

    expect(spaceGrotesk).toHaveBeenCalledWith(
      expect.objectContaining({
        subsets: ["latin"],
        variable: "--font-space-grotesk",
      })
    );
    expect(ibmPlexMono).toHaveBeenCalledWith(
      expect.objectContaining({
        preload: false,
        subsets: ["latin"],
        variable: "--font-ibm-plex-mono",
        weight: ["400", "500"],
      })
    );
  });

  it("keeps the global error page from preloading the supporting mono font", async () => {
    await import("@/app/global-error");

    expect(ibmPlexMono).toHaveBeenCalledWith(
      expect.objectContaining({
        preload: false,
        subsets: ["latin"],
        variable: "--font-ibm-plex-mono",
        weight: ["400", "500"],
      })
    );
  });
});
