import { readBooleanField } from "@/app/api/tribes/[slug]/courses/route-helpers";

describe("courses route helpers", () => {
  it("parses boolean fields from PATCH payloads", () => {
    expect(readBooleanField({ isActive: true }, "isActive")).toBe(true);
    expect(readBooleanField({ isActive: false }, "isActive")).toBe(false);
    expect(readBooleanField({ isActive: "true" }, "isActive")).toBe(true);
    expect(readBooleanField({ isActive: "false" }, "isActive")).toBe(false);
  });

  it("does not coerce missing or invalid boolean fields to false", () => {
    expect(readBooleanField({}, "isActive")).toBeNull();
    expect(readBooleanField({ isActive: "no" }, "isActive")).toBeNull();
    expect(readBooleanField({ isActive: 0 }, "isActive")).toBeNull();
  });
});
