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
});
