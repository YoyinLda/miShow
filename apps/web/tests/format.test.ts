import { describe, expect, it } from "vitest";
import { formatRelativeTime, performanceStatusLabel, statusLabel } from "../lib/format";

const now = new Date("2026-09-13T15:00:00Z");

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
