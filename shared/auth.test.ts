import { describe, expect, it } from "vitest";
import { safeRedirect, signUpSchema } from "./auth";

describe("safeRedirect", () => {
  it.each([
    ["/projects/123?aba=1", "/projects/123?aba=1"],
    ["/", "/"],
    [undefined, "/projects"],
    ["", "/projects"],
    ["https://evil.example.com", "/projects"],
    ["//evil.example.com", "/projects"],
    ["/\\evil.example.com", "/projects"],
    ["javascript:alert(1)", "/projects"],
  ])("%s → %s", (target, expected) => {
    expect(safeRedirect(target)).toBe(expected);
  });
});

describe("signUpSchema", () => {
  it("normaliza nome e email", () => {
    expect(
      signUpSchema.parse({ name: "  Ana  ", email: " ana@exemplo.com ", password: "12345678" }),
    ).toEqual({ name: "Ana", email: "ana@exemplo.com", password: "12345678" });
  });
});
