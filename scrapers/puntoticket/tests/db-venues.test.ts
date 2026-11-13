import { describe, expect, it } from "vitest";
import { buildPuntoticketVenueUrl, createDbVenuesIndex } from "../src/discovery/db-venues.js";
import { createFixedListSource } from "../src/discovery/fixed-list.js";
import { createPuntoticketAdapter } from "../src/adapter.js";

describe("createPuntoticketAdapter con allowlist del índice", () => {
  it("db-venues: acepta solo rutas exactas y respeta bloqueos", async () => {
    const index = createDbVenuesIndex(async () => [
      { source_slug: "claro-arena", source_url: "https://www.puntoticket.com/claro-arena" },
      { source_slug: "pago", source_url: "https://www.puntoticket.com/pago" }
    ]);
    await index.list({ getHtml: async () => "" });
    const d = createPuntoticketAdapter({ venueIndex: index }).discovery!;
    expect(d.isSecondaryPagePath("/claro-arena")).toBe(true);
    expect(d.isSecondaryPagePath("/claro-arena/")).toBe(false);
    expect(d.isSecondaryPagePath("/otro")).toBe(false);
    expect(d.isSecondaryPagePath("/Pago")).toBe(false);
  });

  it("fixed-list sigue funcionando como respaldo", () => {
    const d = createPuntoticketAdapter({ venueIndex: createFixedListSource(["https://www.puntoticket.com/x"]) }).discovery!;
    expect(d.isSecondaryPagePath("/x")).toBe(true);
    expect(d.isSecondaryPagePath("/y")).toBe(false);
  });
});

const ctx = { getHtml: async () => "" };

describe("buildPuntoticketVenueUrl", () => {
  it("construye la URL canónica para slugs válidos", () => {
    expect(buildPuntoticketVenueUrl("santander-arena")).toBe("https://www.puntoticket.com/santander-arena");
  });
  it.each(["", "Claro", "a--b", "-a", "a-", "a/b", "a b", "a?x=1"])("rechaza %j", (slug) => {
    expect(buildPuntoticketVenueUrl(slug)).toBeUndefined();
  });
});

describe("createDbVenuesIndex", () => {
  it("lista URLs válidas, omite inconsistentes y deriva allowlist exacta", async () => {
    const index = createDbVenuesIndex(async (source) => {
      expect(source).toBe("puntoticket");
      return [
        { source_slug: "claro-arena", source_url: "https://www.puntoticket.com/claro-arena/" },
        { source_slug: "otro", source_url: "https://www.puntoticket.com/distinto" },
        { source_slug: "Mal Slug", source_url: "https://www.puntoticket.com/Mal Slug" },
        { source_slug: "claro-arena", source_url: "https://www.puntoticket.com/claro-arena" }
      ];
    });
    expect(index.kind).toBe("db-venues");
    expect(index.allowedPaths().size).toBe(0);
    expect(await index.list(ctx)).toEqual(["https://www.puntoticket.com/claro-arena"]);
    expect([...index.allowedPaths()]).toEqual(["/claro-arena"]);
    expect(index.rejectedRows().map((r) => r.code)).toEqual(["url_rejected", "url_rejected"]);
  });

  it("expone rejections() compatible con SecondaryIndexSource", async () => {
    const index = createDbVenuesIndex(async () => [{ source_slug: "a", source_url: "https://www.puntoticket.com/b" }]);
    await index.list(ctx);
    expect(index.rejections?.().map((r) => r.code)).toEqual(["url_rejected"]);
  });

  it("propaga el fallo del loader", async () => {
    const index = createDbVenuesIndex(async () => {
      throw new Error("boom");
    });
    await expect(index.list(ctx)).rejects.toThrow("boom");
  });
});
