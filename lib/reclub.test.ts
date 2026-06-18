import { describe, expect, it } from "vitest";
import { initialsFromName, normalizeReclubUrl, reclubHandle } from "./reclub";

describe("normalizeReclubUrl", () => {
  it("accepts a canonical profile URL unchanged", () => {
    expect(normalizeReclubUrl("https://reclub.co/id/players/@darfat-41")).toBe(
      "https://reclub.co/id/players/@darfat-41"
    );
  });

  it("trims whitespace and a trailing slash", () => {
    expect(normalizeReclubUrl("  https://reclub.co/id/players/@apeha/  ")).toBe(
      "https://reclub.co/id/players/@apeha"
    );
  });

  it("upgrades http to https and lowercases the locale", () => {
    expect(normalizeReclubUrl("http://reclub.co/ID/players/@far2209")).toBe(
      "https://reclub.co/id/players/@far2209"
    );
  });

  it("expands a bare @handle to the id locale", () => {
    expect(normalizeReclubUrl("@darfat-41")).toBe("https://reclub.co/id/players/@darfat-41");
  });

  it("expands a handle without the @", () => {
    expect(normalizeReclubUrl("nurjastore")).toBe("https://reclub.co/id/players/@nurjastore");
  });

  it("rejects non-Reclub URLs and junk", () => {
    expect(normalizeReclubUrl("https://example.com/@darfat")).toBeNull();
    expect(normalizeReclubUrl("https://reclub.co/id/m/ANJLMK")).toBeNull();
    expect(normalizeReclubUrl("")).toBeNull();
    expect(normalizeReclubUrl("not a url with spaces")).toBeNull();
  });
});

describe("reclubHandle", () => {
  it("extracts the @handle", () => {
    expect(reclubHandle("https://reclub.co/id/players/@poundra-nur-okky-245")).toBe(
      "@poundra-nur-okky-245"
    );
  });

  it("returns null for missing/invalid input", () => {
    expect(reclubHandle(null)).toBeNull();
    expect(reclubHandle("https://reclub.co/id/m/ANJLMK")).toBeNull();
  });
});

describe("initialsFromName", () => {
  it("uses first + last initial for multi-word names", () => {
    expect(initialsFromName("Adhitia putra herawan")).toBe("AH");
    expect(initialsFromName("Poundra Nur Okky")).toBe("PO");
  });

  it("uses the first two letters for a single word", () => {
    expect(initialsFromName("Darfat")).toBe("DA");
  });

  it("handles odd spacing and empties", () => {
    expect(initialsFromName("  S Y A F I K  ")).toBe("SK");
    expect(initialsFromName("")).toBe("?");
  });
});
