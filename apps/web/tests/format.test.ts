import { describe, expect, it } from "vitest";
import { formatDate, formatPrice, formatRelativeTime, performanceStatusLabel, sourceLinks, statusLabel } from "../lib/format";
import type { CatalogEventSource } from "@mishow/catalog-client";

const now = new Date("2026-09-13T15:00:00Z");

function src(partial: Partial<CatalogEventSource>): CatalogEventSource {
  return { source: "puntoticket", source_url: "https://www.puntoticket.com/x", status: "unknown", ...partial };
}

describe("formatPrice (multi-fuente)", () => {
  it("returns undefined when no source has a price", () => {
    expect(formatPrice([])).toBeUndefined();
    expect(formatPrice([src({})])).toBeUndefined();
    expect(formatPrice(null)).toBeUndefined();
  });

  it("combines the min and max across sources", () => {
    const combined = formatPrice([
      src({ source: "puntoticket", price_min: 30000, price_max: 60000, currency: "CLP" }),
      src({ source: "ticketmaster", price_min: 21000, price_max: 100000, currency: "CLP" })
    ]);
    expect(combined).toContain("21.000");
    expect(combined).toContain("100.000");
    expect(combined).toContain("–");
  });

  it("shows a single value when min equals max", () => {
    expect(formatPrice([src({ price_min: 25000, price_max: 25000, currency: "CLP" })])).not.toContain("–");
  });
});

describe("sourceLinks", () => {
  it("uses a generic label for a single source", () => {
    expect(sourceLinks([src({ source: "puntoticket", source_url: "https://www.puntoticket.com/a" })]))
      .toEqual([{ url: "https://www.puntoticket.com/a", label: "Ir a la ticketera" }]);
  });

  it("names each ticketera when there are several", () => {
    const links = sourceLinks([
      src({ source: "puntoticket", source_url: "https://www.puntoticket.com/a" }),
      src({ source: "ticketmaster", source_url: "https://www.ticketmaster.cl/b" })
    ]);
    expect(links).toEqual([
      { url: "https://www.puntoticket.com/a", label: "Ir a PuntoTicket" },
      { url: "https://www.ticketmaster.cl/b", label: "Ir a Ticketmaster" }
    ]);
  });

  it("returns empty for no sources", () => {
    expect(sourceLinks([])).toEqual([]);
    expect(sourceLinks(null)).toEqual([]);
  });
});

describe("statusLabel", () => {
  it("assumes an event is confirmed when there is no availability evidence", () => {
    expect(statusLabel("unknown")).toBe("Confirmado");
  });

  it("keeps explicit states", () => {
    expect(statusLabel("available")).toBe("Disponible");
    expect(statusLabel("sold_out")).toBe("Agotado");
    expect(statusLabel("upcoming")).toBe("Próximamente");
  });

  it("falls back to confirmed for unexpected values", () => {
    expect(statusLabel("weird")).toBe("Confirmado");
  });
});

describe("performanceStatusLabel", () => {
  it("hides the label when a performance has no availability info", () => {
    expect(performanceStatusLabel("unknown")).toBeUndefined();
    expect(performanceStatusLabel("weird")).toBeUndefined();
  });

  it("keeps explicit states", () => {
    expect(performanceStatusLabel("available")).toBe("Disponible");
    expect(performanceStatusLabel("sold_out")).toBe("Agotado");
    expect(performanceStatusLabel("upcoming")).toBe("Próximamente");
  });
});

describe("formatDate", () => {
  it("muestra fecha y hora cuando la hora es conocida", () => {
    const label = formatDate("2026-11-15T21:00:00-03:00", { timeKnown: true });
    expect(label).toContain("15");
    // El formateador usa reloj de 12 h (es-CL): 21:00 => "09:00 p. m.".
    expect(label).toContain("09:00");
    expect(label).toMatch(/p\.?\s?m\.?/i);
  });

  it("muestra solo la fecha cuando la hora es desconocida (sin hora ni leyenda)", () => {
    const label = formatDate("2026-11-15T00:00:00-03:00", { timeKnown: false });
    expect(label).toContain("15");
    expect(label).toContain("nov");
    expect(label).not.toContain("00:00");
    expect(label).not.toMatch(/\d{1,2}:\d\d/);
    expect(label).not.toMatch(/[ap]\.?\s?m\.?/i);
  });

  it("muestra la hora para una medianoche real (hora conocida)", () => {
    // Medianoche real: time_known=true => se muestra la hora (12:00 a. m.), no se omite.
    const label = formatDate("2026-11-15T00:00:00-03:00", { timeKnown: true });
    expect(label).toContain("12:00");
    expect(label).toMatch(/a\.?\s?m\.?/i);
  });

  it("no corre el día por la zona en una fecha sin hora", () => {
    const label = formatDate("2026-11-15T00:00:00-03:00", { timeKnown: false });
    expect(label).toContain("15");
    expect(label).not.toContain("14");
    expect(label).not.toContain("16");
  });

  it("sin opciones mantiene el comportamiento legacy (fecha + hora)", () => {
    expect(formatDate("2026-11-15T21:00:00-03:00")).toContain("09:00");
  });

  it("devuelve undefined para instantes vacíos o inválidos", () => {
    expect(formatDate(null)).toBeUndefined();
    expect(formatDate("no-es-fecha")).toBeUndefined();
  });
});

describe("formatRelativeTime", () => {
  it("returns undefined for empty or invalid instants", () => {
    expect(formatRelativeTime(undefined, now)).toBeUndefined();
    expect(formatRelativeTime(null, now)).toBeUndefined();
    expect(formatRelativeTime("no-es-fecha", now)).toBeUndefined();
  });

  it("returns undefined for future instants (clock skew)", () => {
    expect(formatRelativeTime("2026-09-13T16:00:00Z", now)).toBeUndefined();
  });

  it("describes very recent runs", () => {
    expect(formatRelativeTime("2026-09-13T14:59:30Z", now)).toBe("actualizado hace instantes");
  });

  it("uses minutes, then hours, then days", () => {
    expect(formatRelativeTime("2026-09-13T14:57:00Z", now)).toBe("actualizado hace 3 minutos");
    expect(formatRelativeTime("2026-09-13T14:59:00Z", now)).toBe("actualizado hace 1 minuto");
    expect(formatRelativeTime("2026-09-13T12:00:00Z", now)).toBe("actualizado hace 3 horas");
    expect(formatRelativeTime("2026-09-13T14:00:00Z", now)).toBe("actualizado hace 1 hora");
    expect(formatRelativeTime("2026-09-11T15:00:00Z", now)).toBe("actualizado hace 2 días");
    expect(formatRelativeTime("2026-09-12T15:00:00Z", now)).toBe("actualizado hace 1 día");
  });

  it("falls back to an absolute Santiago date for old instants", () => {
    const label = formatRelativeTime("2026-08-01T15:00:00Z", now);
    expect(label).toBeDefined();
    expect(label?.startsWith("actualizado el ")).toBe(true);
  });
});
