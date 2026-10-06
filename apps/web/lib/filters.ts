import type { ListEventsFilters } from "@mishow/catalog-client";

/**
 * Helpers puros de filtros de faceta (Etapa 5) y su reflejo en el querystring.
 * Sin DOM ni estado: mismo patrón que `discovery.ts`/`event-list-state.ts`, para
 * testearlos sin navegador. El componente (`EventList`) es quien los conecta a
 * `history.replaceState` y a `CatalogClient.listEvents({ filters })`.
 *
 * Rótulos de UI: usamos "Lugar" para el recinto (nunca "venue"/"recinto"); los
 * identificadores internos (código de fuente, valor de ciudad, estado) NO cambian.
 *
 * URL (combinable con ?q= y ?rango=):
 *   ?fuente=ticketmaster&ciudad=Santiago%20Centro&estado=sold_out
 * Multi-valor: se admite CSV (`?ciudad=A,B`) y parámetros repetidos
 * (`?ciudad=A&ciudad=B`); al serializar emitimos un único parámetro CSV por
 * faceta y omitimos las vacías.
 */

/** Códigos de fuente que la UI ofrece como faceta. */
export const SOURCE_VALUES = ["ticketmaster", "puntoticket"] as const;
export type SourceValue = (typeof SOURCE_VALUES)[number];

/** Estados de venta ofrecidos como faceta (unknown => "Confirmado", no es faceta). */
export const STATUS_VALUES = ["available", "sold_out"] as const;
export type StatusValue = (typeof STATUS_VALUES)[number];

/** Estado de filtros activo. Arreglos vacíos = sin filtro en esa faceta. */
export interface FiltersState {
  sources: SourceValue[];
  cities: string[];
  statuses: StatusValue[];
}

/** Claves del querystring para cada faceta. */
const PARAM = { sources: "fuente", cities: "ciudad", statuses: "estado" } as const;

/** Rótulos legibles por código de fuente (UI). */
const SOURCE_LABELS: Record<SourceValue, string> = {
  ticketmaster: "Ticketmaster",
  puntoticket: "PuntoTicket"
};

/** Rótulos legibles por estado (UI). */
const STATUS_LABELS: Record<StatusValue, string> = {
  available: "Disponible",
  sold_out: "Agotado"
};

export function sourceLabel(value: SourceValue): string {
  return SOURCE_LABELS[value];
}

export function statusLabel(value: StatusValue): string {
  return STATUS_LABELS[value];
}

/** Estado vacío (sin filtros). Nueva instancia en cada llamada. */
export function emptyFilters(): FiltersState {
  return { sources: [], cities: [], statuses: [] };
}

/** Alias semántico para "limpiar todo". */
export function clearFilters(): FiltersState {
  return emptyFilters();
}

/** ¿Hay al menos un filtro activo? */
export function hasActiveFilters(state: FiltersState): boolean {
  return activeFilterCount(state) > 0;
}

/**
 * Número total de filtros activos (suma de valores seleccionados en todas las
 * facetas). Base del contador del botón "Filtros".
 */
export function activeFilterCount(state: FiltersState): number {
  return state.sources.length + state.cities.length + state.statuses.length;
}

/**
 * Lee un parámetro multi-valor de `URLSearchParams`: admite parámetros repetidos
 * y CSV dentro de cada uno. Devuelve valores no vacíos, deduplicados y en orden
 * de aparición.
 */
function readMulti(params: URLSearchParams, key: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of params.getAll(key)) {
    for (const piece of raw.split(",")) {
      const value = piece.trim();
      if (value && !seen.has(value)) {
        seen.add(value);
        out.push(value);
      }
    }
  }
  return out;
}

/**
 * Parsea `FiltersState` desde el querystring. Acepta `URLSearchParams` o un
 * string. Los valores de fuente/estado desconocidos se ignoran (robustez ante
 * URLs manipuladas); las ciudades se toman tal cual (su validez la decide el
 * servidor al no hacer match).
 */
export function parseFilters(input: URLSearchParams | string | null | undefined): FiltersState {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams(input ?? "");
  const sources = readMulti(params, PARAM.sources).filter((v): v is SourceValue =>
    (SOURCE_VALUES as readonly string[]).includes(v)
  );
  const cities = readMulti(params, PARAM.cities);
  const statuses = readMulti(params, PARAM.statuses).filter((v): v is StatusValue =>
    (STATUS_VALUES as readonly string[]).includes(v)
  );
  return { sources, cities, statuses };
}

/**
 * Serializa `FiltersState` a `URLSearchParams`. Un parámetro CSV por faceta no
 * vacía; las vacías se omiten. No incluye `?q=`/`?rango=`: su composición la
 * maneja el componente mezclando sobre `window.location.search`.
 */
export function serializeFilters(state: FiltersState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.sources.length > 0) params.set(PARAM.sources, state.sources.join(","));
  if (state.cities.length > 0) params.set(PARAM.cities, state.cities.join(","));
  if (state.statuses.length > 0) params.set(PARAM.statuses, state.statuses.join(","));
  return params;
}

/**
 * Mezcla los filtros en un `URLSearchParams` base (que puede traer `q`/`rango`),
 * reemplazando solo las claves de faceta. Devuelve una copia nueva; no muta el
 * original. Útil para `history.replaceState` conservando los demás parámetros.
 */
export function mergeFiltersIntoParams(base: URLSearchParams, state: FiltersState): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  for (const key of Object.values(PARAM)) next.delete(key);
  const serialized = serializeFilters(state);
  for (const [key, value] of serialized) next.set(key, value);
  return next;
}

/** Traduce `FiltersState` al contrato del cliente (`ListEventsFilters`). */
export function toListEventsFilters(state: FiltersState): ListEventsFilters {
  return { sources: state.sources, cities: state.cities, statuses: state.statuses };
}

/**
 * Descriptores de los chips activos (para el resumen sobre la lista): cada uno
 * identifica su faceta, su valor y su rótulo, para poder quitarlo individualmente.
 */
export interface ActiveFilterChip {
  facet: keyof FiltersState;
  value: string;
  label: string;
}

export function activeFilterChips(state: FiltersState): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  for (const value of state.sources) chips.push({ facet: "sources", value, label: sourceLabel(value) });
  for (const value of state.cities) chips.push({ facet: "cities", value, label: value });
  for (const value of state.statuses) chips.push({ facet: "statuses", value, label: statusLabel(value) });
  return chips;
}

/** Devuelve una copia del estado sin el valor indicado de una faceta. */
export function removeFilter(state: FiltersState, facet: keyof FiltersState, value: string): FiltersState {
  return {
    sources: facet === "sources" ? state.sources.filter((v) => v !== value) : [...state.sources],
    cities: facet === "cities" ? state.cities.filter((v) => v !== value) : [...state.cities],
    statuses: facet === "statuses" ? state.statuses.filter((v) => v !== value) : [...state.statuses]
  };
}
