import type { CatalogEvent, EventCursor, ListEventsResult } from "@mishow/catalog-client";

/**
 * Lógica PURA del listado incremental del home (sin React ni DOM).
 *
 * Se extrae aquí para poder probarla con vitest sin jsdom (el workspace no
 * tiene testing-library ni renderer de componentes instalado). `EventList.tsx`
 * consume estas funciones para acumular páginas keyset de `listEvents`.
 */

/** Estado acumulado del listado tras consumir una o varias páginas. */
export interface EventListState {
  /** Término de búsqueda activo (ya normalizado por el componente). */
  term: string;
  /** Eventos acumulados en orden de llegada, sin duplicados por `id`. */
  items: CatalogEvent[];
  /** Cursor para la siguiente página; `null` cuando no hay más datos. */
  cursor: EventCursor | null;
  /** Total GLOBAL informado por la primera página (`null` si se desconoce). */
  total: number | null;
}

/** Snapshot serializable para restaurar el listado al volver del detalle. */
export interface EventListSnapshot {
  term: string;
  items: CatalogEvent[];
  cursor: EventCursor | null;
  total: number | null;
  /** Posición vertical del scroll al navegar al detalle. */
  scrollY: number;
}

/** Estado inicial de un término (lista vacía, sin cursor ni total). */
export function resetForSearch(term: string): EventListState {
  return { term, items: [], cursor: null, total: null };
}

/**
 * Acumula una página sobre el estado previo.
 *
 * - Concatena `page.items` evitando duplicados por `id` (una página keyset
 *   podría reenviar una fila ya vista en bordes de cursor; se descarta).
 * - Avanza el `cursor` al `nextCursor` de la página.
 * - Conserva el `total` de la PRIMERA página: si ya hay un total numérico, no
 *   se pisa con el `null` de páginas siguientes; si aún es `null`, adopta el de
 *   la página actual.
 */
export function appendPage(prev: EventListState, page: ListEventsResult): EventListState {
  const seen = new Set(prev.items.map((event) => event.id));
  const merged = prev.items.slice();
  for (const event of page.items) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    merged.push(event);
  }
  return {
    term: prev.term,
    items: merged,
    cursor: page.nextCursor,
    total: prev.total ?? page.total
  };
}

/** `true` si queda al menos una página por pedir (hay cursor). */
export function canLoadMore(state: EventListState): boolean {
  return state.cursor !== null;
}

/** Serializa un snapshot a string para `sessionStorage`. */
export function serializeSnapshot(snapshot: EventListSnapshot): string {
  return JSON.stringify(snapshot);
}

/**
 * Parsea un snapshot desde `sessionStorage`. Devuelve `null` ante JSON inválido
 * o formas que no cumplen el contrato mínimo, para degradar sin romper (el
 * componente arranca limpio en ese caso).
 */
export function parseSnapshot(raw: string | null): EventListSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.term !== "string") return null;
  if (!Array.isArray(candidate.items)) return null;
  if (typeof candidate.scrollY !== "number") return null;
  const total = candidate.total;
  if (total !== null && typeof total !== "number") return null;
  const cursor = candidate.cursor;
  if (cursor !== null && typeof cursor !== "object") return null;
  return {
    term: candidate.term,
    items: candidate.items as CatalogEvent[],
    cursor: (cursor as EventCursor | null) ?? null,
    total: (total as number | null) ?? null,
    scrollY: candidate.scrollY
  };
}
