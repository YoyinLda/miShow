import { describe, expect, it } from "vitest";
import {
  activeFilterChips,
  activeFilterCount,
  clearFilters,
  emptyFilters,
  hasActiveFilters,
  mergeFiltersIntoParams,
  parseFilters,
  removeFilter,
  serializeFilters,
  sourceLabel,
  statusLabel,
  toListEventsFilters,
  type FiltersState
} from "../lib/filters";

describe("parseFilters", () => {
  it("lee fuente/ciudad/estado del querystring con acentos y espacios", () => {
    const state = parseFilters("fuente=ticketmaster&ciudad=Santiago%20Centro&estado=sold_out");
    expect(state.sources).toEqual(["ticketmaster"]);
    expect(state.cities).toEqual(["Santiago Centro"]);
    expect(state.statuses).toEqual(["sold_out"]);
  });

  it("admite multi-valor por CSV y por parámetro repetido, deduplicando", () => {
    const csv = parseFilters("ciudad=Santiago%20Centro,Providencia&estado=available,sold_out");
    expect(csv.cities).toEqual(["Santiago Centro", "Providencia"]);
    expect(csv.statuses).toEqual(["available", "sold_out"]);

    const repeated = parseFilters("ciudad=Providencia&ciudad=Providencia&ciudad=Ñuñoa");
    expect(repeated.cities).toEqual(["Providencia", "Ñuñoa"]);
  });

  it("ignora valores de fuente/estado desconocidos", () => {
    const state = parseFilters("fuente=desconocida&estado=raro&ciudad=");
    expect(state.sources).toEqual([]);
    expect(state.statuses).toEqual([]);
    expect(state.cities).toEqual([]);
  });

  it("acepta URLSearchParams, string o null", () => {
    expect(parseFilters(null)).toEqual(emptyFilters());
    expect(parseFilters(new URLSearchParams("fuente=puntoticket")).sources).toEqual(["puntoticket"]);
  });
});

describe("serializeFilters", () => {
  it("emite un parámetro CSV por faceta no vacía y omite las vacías", () => {
    const state: FiltersState = { sources: ["ticketmaster"], cities: ["Santiago Centro", "Providencia"], statuses: [] };
    const params = serializeFilters(state);
    expect(params.get("fuente")).toBe("ticketmaster");
    expect(params.get("ciudad")).toBe("Santiago Centro,Providencia");
    expect(params.has("estado")).toBe(false);
  });

  it("round-trip parse <-> serialize preserva el estado", () => {
    const state: FiltersState = {
      sources: ["puntoticket"],
      cities: ["Ñuñoa", "Puerto Varas"],
      statuses: ["available"]
    };
    const roundTripped = parseFilters(serializeFilters(state));
    expect(roundTripped).toEqual(state);
  });

  it("estado vacío serializa a querystring vacío", () => {
    expect(serializeFilters(emptyFilters()).toString()).toBe("");
  });
});

describe("activeFilterCount / hasActiveFilters", () => {
  it("suma los valores seleccionados de todas las facetas", () => {
    const state: FiltersState = { sources: ["ticketmaster"], cities: ["Santiago Centro", "Providencia"], statuses: ["sold_out"] };
    expect(activeFilterCount(state)).toBe(4);
    expect(hasActiveFilters(state)).toBe(true);
  });

  it("es 0 y false sin filtros", () => {
    expect(activeFilterCount(emptyFilters())).toBe(0);
    expect(hasActiveFilters(emptyFilters())).toBe(false);
  });
});

describe("mergeFiltersIntoParams", () => {
  it("reemplaza solo las claves de faceta y preserva q/rango", () => {
    const base = new URLSearchParams("q=rock&rango=semana&ciudad=Vieja");
    const merged = mergeFiltersIntoParams(base, { sources: ["ticketmaster"], cities: ["Providencia"], statuses: [] });
    expect(merged.get("q")).toBe("rock");
    expect(merged.get("rango")).toBe("semana");
    expect(merged.get("fuente")).toBe("ticketmaster");
    expect(merged.get("ciudad")).toBe("Providencia");
    expect(merged.has("estado")).toBe(false);
  });

  it("quita las claves de faceta cuando el estado está vacío, sin tocar q/rango", () => {
    const base = new URLSearchParams("q=jazz&fuente=puntoticket&estado=available");
    const merged = mergeFiltersIntoParams(base, emptyFilters());
    expect(merged.get("q")).toBe("jazz");
    expect(merged.has("fuente")).toBe(false);
    expect(merged.has("estado")).toBe(false);
  });

  it("no muta el base recibido", () => {
    const base = new URLSearchParams("q=rock");
    mergeFiltersIntoParams(base, { sources: ["ticketmaster"], cities: [], statuses: [] });
    expect(base.has("fuente")).toBe(false);
  });
});

describe("chips activos y removeFilter", () => {
  it("activeFilterChips describe cada valor con su rótulo de UI", () => {
    const chips = activeFilterChips({ sources: ["ticketmaster"], cities: ["Providencia"], statuses: ["sold_out"] });
    expect(chips).toEqual([
      { facet: "sources", value: "ticketmaster", label: "Ticketmaster" },
      { facet: "cities", value: "Providencia", label: "Providencia" },
      { facet: "statuses", value: "sold_out", label: "Agotado" }
    ]);
  });

  it("removeFilter quita un único valor de la faceta indicada", () => {
    const state: FiltersState = { sources: ["ticketmaster", "puntoticket"], cities: ["A", "B"], statuses: [] };
    const next = removeFilter(state, "cities", "A");
    expect(next.cities).toEqual(["B"]);
    expect(next.sources).toEqual(["ticketmaster", "puntoticket"]);
  });
});

describe("rótulos y mapeo al cliente", () => {
  it("sourceLabel / statusLabel usan nombres legibles", () => {
    expect(sourceLabel("puntoticket")).toBe("PuntoTicket");
    expect(statusLabel("available")).toBe("Disponible");
  });

  it("toListEventsFilters mapea al contrato del cliente", () => {
    const state: FiltersState = { sources: ["ticketmaster"], cities: ["Providencia"], statuses: ["available"] };
    expect(toListEventsFilters(state)).toEqual(state);
  });

  it("clearFilters devuelve el estado vacío", () => {
    expect(clearFilters()).toEqual(emptyFilters());
  });
});
