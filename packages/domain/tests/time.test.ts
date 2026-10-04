import { describe, expect, it } from "vitest";
import { hasKnownTime, toSantiago } from "../src/time.js";

describe("hasKnownTime", () => {
  it("reconoce strings con componente horario como hora conocida", () => {
    expect(hasKnownTime("2026-11-15T21:00:00-03:00")).toBe(true);
    expect(hasKnownTime("2026-11-15 21:00")).toBe(true);
  });

  it("trata una medianoche real explícita como hora conocida", () => {
    expect(hasKnownTime("2026-11-15T00:00:00")).toBe(true);
  });

  it("trata un string date-only como hora desconocida", () => {
    expect(hasKnownTime("2026-12-20")).toBe(false);
  });
});

describe("toSantiago (fecha-only vs fecha+hora)", () => {
  it("convierte date-only a medianoche en America/Santiago sin correr el día", () => {
    expect(toSantiago("2026-11-15")).toBe("2026-11-15T00:00:00-03:00");
  });

  it("conserva la hora cuando el string la trae", () => {
    expect(toSantiago("2026-11-15T21:00:00-03:00")).toBe("2026-11-15T21:00:00-03:00");
  });
});
