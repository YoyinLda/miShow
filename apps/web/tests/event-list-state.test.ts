import { describe, expect, it } from "vitest";
import type { CatalogEvent, EventCursor, ListEventsResult } from "@mishow/catalog-client";
import {
  appendPage,
  canLoadMore,
  parseSnapshot,
  resetForSearch,
  serializeSnapshot,
  type EventListSnapshot
} from "../lib/event-list-state";

function event(id: number, name = `Evento ${id}`): CatalogEvent {
  return {
    id,
    slug: `evento-${id}`,
    name,
    category: "concierto",
    subcategory: null,
    status: "unknown",
    image_url: null,
    needs_review: false,
    first_seen_at: "2026-09-01T00:00:00Z",
    last_seen_at: "2026-09-01T00:00:00Z",
    next_performance_at: "2026-11-15T00:00:00Z",
    next_performance_time_known: true,
    artists: [],
    venue: null,
    sources: [],
    performances: []
  };
}

const nonnullCursor: EventCursor = { phase: "nonnull", nextAt: "2026-11-15T00:00:00Z", id: 2 };

function page(items: CatalogEvent[], nextCursor: EventCursor | null, total: number | null): ListEventsResult {
  return { items, total, nextCursor };
}

describe("resetForSearch", () => {
  it("devuelve estado inicial vacío para el término", () => {
    const state = resetForSearch("depeche");
    expect(state).toEqual({ term: "depeche", items: [], cursor: null, total: null });
  });
});

describe("appendPage", () => {
  it("acumula items de páginas sucesivas y avanza el cursor", () => {
    let state = resetForSearch("");
    state = appendPage(state, page([event(1), event(2)], nonnullCursor, 5));
    state = appendPage(state, page([event(3), event(4)], null, null));
    expect(state.items.map((e) => e.id)).toEqual([1, 2, 3, 4]);
    expect(state.cursor).toBeNull();
  });

  it("evita duplicados cuando una página reenvía un id ya presente", () => {
    let state = resetForSearch("");
    state = appendPage(state, page([event(1), event(2)], nonnullCursor, 3));
    state = appendPage(state, page([event(2), event(3)], null, null));
    expect(state.items.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("conserva el total de la primera página y no lo pisa con null", () => {
    let state = resetForSearch("");
    state = appendPage(state, page([event(1)], nonnullCursor, 42));
    expect(state.total).toBe(42);
    state = appendPage(state, page([event(2)], null, null));
    expect(state.total).toBe(42);
  });

  it("adopta el total si la primera página aún no lo tenía", () => {
    let state = resetForSearch("");
    state = appendPage(state, page([event(1)], nonnullCursor, null));
    expect(state.total).toBeNull();
    state = appendPage(state, page([event(2)], null, 7));
    expect(state.total).toBe(7);
  });
});

describe("canLoadMore", () => {
  it("es false cuando el cursor es null", () => {
    expect(canLoadMore({ term: "", items: [], cursor: null, total: null })).toBe(false);
  });

  it("es true mientras haya cursor", () => {
    expect(canLoadMore({ term: "", items: [], cursor: nonnullCursor, total: 3 })).toBe(true);
  });
});

describe("serializeSnapshot / parseSnapshot", () => {
  it("hace round-trip sin perder datos", () => {
    const snapshot: EventListSnapshot = {
      term: "soda",
      items: [event(1), event(2)],
      cursor: nonnullCursor,
      total: 2,
      scrollY: 480
    };
    const restored = parseSnapshot(serializeSnapshot(snapshot));
    expect(restored).toEqual(snapshot);
  });

  it("degrada a null ante JSON inválido o entrada vacía", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot("")).toBeNull();
    expect(parseSnapshot("{no-es-json")).toBeNull();
  });

  it("rechaza formas que no cumplen el contrato mínimo", () => {
    expect(parseSnapshot(JSON.stringify({ term: 1, items: [], scrollY: 0 }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ term: "x", items: "no-array", scrollY: 0 }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ term: "x", items: [], scrollY: "no-num" }))).toBeNull();
  });
});
