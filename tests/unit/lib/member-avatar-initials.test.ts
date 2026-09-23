import { describe, expect, it } from "vitest";

import { getMemberAvatarInitials } from "@/lib/members/member-avatar-initials";

describe("getMemberAvatarInitials", () => {
  it("takes the first letter of up to two name parts", () => {
    expect(getMemberAvatarInitials("ana maría pérez")).toBe("AM");
    expect(getMemberAvatarInitials("  Sol ")).toBe("S");
  });

  it("falls back to a placeholder for empty names", () => {
    expect(getMemberAvatarInitials("   ")).toBe("?");
  });

  it("skips punctuation and symbols when picking initials", () => {
    expect(getMemberAvatarInitials('Lucía "Lu", Díaz')).toBe("LL");
    expect(getMemberAvatarInitials("¡Ana! — Gómez")).toBe("AG");
    expect(getMemberAvatarInitials('=HYPERLINK("x")')).toBe("H");
    expect(getMemberAvatarInitials("*** ---")).toBe("?");
  });

  it("limits the initials to the requested amount", () => {
    expect(getMemberAvatarInitials("Ana Pérez", { maxInitials: 1 })).toBe("A");
  });
});
