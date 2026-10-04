import { describe, expect, it } from "vitest";
import { dateRange, formatDayMonth, isFree, parseRango, selectFeatured } from "../lib/discovery";
import type { CatalogEvent, CatalogEventSource } from "@mishow/catalog-client";

// `now` fijo: 2026-12-12T18:00:00Z. En Santiago (verano, -03:00) son las
// 15:00 del 12-dic, así que el día local es el 12-dic.
const now = new Date("2026-12-12T18:00:00Z");

function src(partial: Partial<CatalogEventSource>): CatalogEventSource {
  return { source: "puntoticket", source_url: "https://www.puntoticket.com/x", status: "unknown", ...partial };
}

function evt(id: number, nextAt: string | null): CatalogEvent {
  return {
    id,
    slug: `evento-${id}`,
    name: `Evento ${id}`,
    category: "musica",
    subcategory: null,
    status: "unknown",
    image_url: null,
    needs_review: false,
    first_seen_at: "2026-01-01T00:00:00Z",
    last_seen_at: "2026-01-01T00:00:00Z",
    next_performance_at: nextAt,
    next_performance_time_known: null,
    artists: [],
    venue: null,
    sources: [],
    performances: []
  };
}

describe("dateRange (America/Santiago)", () => {
  it("hoy: cubre el día local completo (00:00 a 23:59:59.999)", () => {
    const r = dateRange("hoy", now);
    // Santiago -03:00 => 00:00 local del 12-dic == 03:00Z del 12-dic.
    expect(r.gteISO).toBe("2026-12-12T03:00:00.000Z");
    // 23:59:59.999 local == 02:59:59.999Z del 13-dic.
    expect(r.lteISO).toBe("2026-12-13T02:59:59.999Z");
  });

  it("semana: desde ahora hasta +7 días", () => {
    const r = dateRange("semana", now);
    expect(r.gteISO).toBe("2026-12-12T18:00:00.000Z");
    expect(r.lteISO).toBe("2026-12-19T18:00:00.000Z");
  });

  it("mes: desde ahora hasta +30 días", () => {
    const r = dateRange("mes", now);
    expect(r.gteISO).toBe("2026-12-12T18:00:00.000Z");
    expect(r.lteISO).toBe("2027-01-11T18:00:00.000Z");
  });
});

describe("parseRango", () => {
  it("acepta valores válidos", () => {
    expect(parseRango("hoy")).toBe("hoy");
    expect(parseRango("semana")).toBe("semana");
    expect(parseRango("mes")).toBe("mes");
    expect(parseRango("gratis")).toBe("gratis");
  });

  it("devuelve null para valores ausentes o inválidos", () => {
    expect(parseRango(null)).toBeNull();
    expect(parseRango("")).toBeNull();
    expect(parseRango("otro")).toBeNull();
    expect(parseRango("HOY")).toBeNull();
  });
});

describe("selectFeatured", () => {
  it("ordena por next_performance_at asc y recorta a n", () => {
    const events = [
      evt(1, "2026-12-20T00:00:00Z"),
      evt(2, "2026-12-10T00:00:00Z"),
      evt(3, "2026-12-15T00:00:00Z")
    ];
    const result = selectFeatured(events, 2);
    expect(result.map((e) => e.id)).toEqual([2, 3]);
  });

  it("deja los nulos al final", () => {
    const events = [evt(1, null), evt(2, "2026-12-10T00:00:00Z"), evt(3, null), evt(4, "2026-12-05T00:00:00Z")];
    const result = selectFeatured(events, 4);
    expect(result.map((e) => e.id)).toEqual([4, 2, 1, 3]);
  });

  it("no muta el arreglo recibido", () => {
    const events = [evt(1, "2026-12-20T00:00:00Z"), evt(2, "2026-12-10T00:00:00Z")];
    const original = events.map((e) => e.id);
    selectFeatured(events, 1);
    expect(events.map((e) => e.id)).toEqual(original);
  });

  it("devuelve vacío para n <= 0", () => {
    expect(selectFeatured([evt(1, "2026-12-20T00:00:00Z")], 0)).toEqual([]);
  });
});

describe("isFree", () => {
  it("es true cuando alguna fuente tiene price_min 0", () => {
    expect(isFree([src({ price_min: 0 })])).toBe(true);
    expect(isFree([src({ price_min: 12000 }), src({ source: "ticketmaster", price_min: 0 })])).toBe(true);
  });

  it("es false sin precios o con precio > 0", () => {
    expect(isFree([src({ price_min: 12000 })])).toBe(false);
    expect(isFree([src({})])).toBe(false);
    expect(isFree([])).toBe(false);
    expect(isFree(null)).toBe(false);
  });
});

describe("formatDayMonth", () => {
  it("devuelve día y mes en mayúsculas sin hora", () => {
    const result = formatDayMonth("2026-12-12T18:00:00Z")!;
    expect(result.day).toBe("12");
    expect(result.month).toBe("DIC");
    expect(result.month).not.toMatch(/\d/);
    expect(`${result.day} ${result.month}`).not.toMatch(/\d{1,2}:\d\d/);
  });

  it("respeta la zona Santiago sin correr el día", () => {
    // 2026-12-13T02:00:00Z == 23:00 del 12-dic en Santiago (-03:00).
    const result = formatDayMonth("2026-12-13T02:00:00Z")!;
    expect(result.day).toBe("12");
  });

  it("ignora timeKnown (nunca introduce hora)", () => {
    const known = formatDayMonth("2026-12-12T18:00:00Z", true);
    const unknown = formatDayMonth("2026-12-12T18:00:00Z", false);
    expect(known).toEqual(unknown);
  });

  it("devuelve undefined para instantes vacíos o inválidos", () => {
    expect(formatDayMonth(null)).toBeUndefined();
    expect(formatDayMonth("no-es-fecha")).toBeUndefined();
  });
});
