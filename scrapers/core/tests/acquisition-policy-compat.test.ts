import { describe, expect, it } from "vitest";
import type { SecondaryDiscovery, SourceAdapter } from "../src/adapter.js";
import { AcquisitionPolicyError, validateAcquisitionUrl } from "../src/acquisition/policy.js";

const HOST = "www.example.com";

const discovery: SecondaryDiscovery = {
  id: "venues",
  isSecondaryPagePath: (p) => /^\/venues\/[a-z0-9-]+$/.test(p),
  index: { kind: "fixed-list", list: async () => [] },
  parsePage: () => []
};

function makeAdapter(withDiscovery: boolean): SourceAdapter {
  return {
    source: "example",
    name: "Example",
    baseUrl: `https://${HOST}`,
    host: HOST,
    listingUrl: `https://${HOST}/musica`,
    purchasePathPatterns: [],
    ...(withDiscovery ? { discovery } : {}),
    isListingPath: (p) => p === "/musica",
    isDetailPath: (p) => p.startsWith("/evento/"),
    isBlockedPath: (p) => p.startsWith("/admin") || p === "/venues/bloqueado",
    parseListing: () => [],
    parseDetail: () => ({}) as never,
    extractDetail: () => ({}) as never
  } as SourceAdapter;
}

function outcome(fn: () => string): string {
  try {
    return fn();
  } catch (error) {
    if (error instanceof AcquisitionPolicyError) return `ERR:${error.message}`;
    throw error;
  }
}

describe("validateAcquisitionUrl: compatibilidad sin secondaryListing", () => {
  const cases: Array<[string, "listing" | "detail"]> = [
    [`https://${HOST}/musica`, "listing"],
    [`https://${HOST}/musica?x=1#h`, "listing"],
    [`https://${HOST}/venues/teatro-caupolican`, "listing"],
    [`https://${HOST}/admin`, "listing"],
    [`https://${HOST}/otra`, "listing"],
    [`https://${HOST}/evento/abc`, "detail"],
    [`https://${HOST}/venues/teatro-caupolican`, "detail"],
    [`http://${HOST}/musica`, "listing"],
    [`https://otro.com/musica`, "listing"]
  ];

  it.each(cases)("adapter con y sin discovery da el mismo resultado: %s (%s)", (url, stage) => {
    const base = outcome(() => validateAcquisitionUrl(makeAdapter(false), url, stage));
    expect(outcome(() => validateAcquisitionUrl(makeAdapter(true), url, stage))).toBe(base);
    expect(outcome(() => validateAcquisitionUrl(makeAdapter(true), url, stage, undefined, {}))).toBe(base);
    expect(outcome(() => validateAcquisitionUrl(makeAdapter(true), url, stage, undefined, { secondaryListing: false }))).toBe(base);
  });

  it("acepta el listing normal y rechaza una página de venue", () => {
    const a = makeAdapter(true);
    expect(validateAcquisitionUrl(a, `https://${HOST}/musica?x=1`, "listing")).toBe(`https://${HOST}/musica`);
    expect(() => validateAcquisitionUrl(a, `https://${HOST}/venues/teatro`, "listing")).toThrow(AcquisitionPolicyError);
  });
});

describe("validateAcquisitionUrl: secondaryListing", () => {
  const ctx = { secondaryListing: true };

  it("acepta una ruta dentro de la allowlist", () => {
    expect(validateAcquisitionUrl(makeAdapter(true), `https://${HOST}/venues/teatro-caupolican?a=1`, "listing", undefined, ctx)).toBe(
      `https://${HOST}/venues/teatro-caupolican`
    );
  });

  it("rechaza ruta fuera de la allowlist (incluido el listing primario)", () => {
    const a = makeAdapter(true);
    expect(() => validateAcquisitionUrl(a, `https://${HOST}/otra`, "listing", undefined, ctx)).toThrow("Listing no permitido.");
    expect(() => validateAcquisitionUrl(a, `https://${HOST}/musica`, "listing", undefined, ctx)).toThrow("Listing no permitido.");
  });

  it("rechaza ruta bloqueada aunque esté en la allowlist", () => {
    expect(() => validateAcquisitionUrl(makeAdapter(true), `https://${HOST}/venues/bloqueado`, "listing", undefined, ctx)).toThrow(
      "Ruta bloqueada para adquisicion."
    );
  });

  it("rechaza si el adapter no define discovery", () => {
    expect(() => validateAcquisitionUrl(makeAdapter(false), `https://${HOST}/venues/teatro`, "listing", undefined, ctx)).toThrow(
      "Listing no permitido."
    );
  });

  it("sigue exigiendo https y host", () => {
    const a = makeAdapter(true);
    expect(() => validateAcquisitionUrl(a, `http://${HOST}/venues/teatro`, "listing", undefined, ctx)).toThrow("Solo se permite HTTPS.");
    expect(() => validateAcquisitionUrl(a, `https://otro.com/venues/teatro`, "listing", undefined, ctx)).toThrow("Host no permitido.");
  });
});
