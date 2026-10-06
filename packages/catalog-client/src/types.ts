import type { EventStatus } from "@mishow/domain";

/**
 * Formas públicas del catálogo canónico (vistas `catalog_events_v2`,
 * `catalog_artists_v1`, `catalog_venues_v1`).
 *
 * Es la ÚNICA representación de datos que el frontend consume. Si en el futuro
 * se introduce una capa intermedia (Cloudflare Worker), debe respetar este mismo
 * contrato para no obligar a cambios en la UI.
 */
export interface CatalogArtistRef {
  name: string;
  slug?: string;
}

export interface CatalogVenueRef {
  slug?: string;
  name?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

export interface CatalogPerformance {
  starts_at: string;
  timezone: string;
  status: EventStatus;
  /** `false` = hora desconocida (mostrar solo fecha). Ausente/`true` = hora conocida. */
  time_known?: boolean;
  performance_code?: string;
  purchase_url?: string;
}

/**
 * Observación de un evento en una fuente concreta. El precio y la URL de compra
 * viven aquí (N por evento), no a nivel de fila: un mismo evento canónico puede
 * publicarse en varias ticketeras.
 */
export interface CatalogEventSource {
  source: string;
  source_url: string;
  purchase_url?: string;
  status: EventStatus;
  price_min?: number;
  price_max?: number;
  currency?: string;
}

/**
 * Frescura del catálogo por fuente (RPC `catalog_freshness_v1`, SECURITY
 * DEFINER; solo columnas no sensibles). Para el indicador "actualizado hace X".
 */
export interface CatalogFreshness {
  source: string;
  last_run_finished_at: string | null;
  last_run_status: string | null;
  discovered_count: number | null;
  succeeded_count: number | null;
}

/** Fila de `catalog_events_v2` — evento canónico independiente de la fuente. */
export interface CatalogEvent {
  id: number;
  slug: string;
  name: string;
  category: string;
  subcategory: string | null;
  status: EventStatus;
  image_url: string | null;
  needs_review: boolean;
  first_seen_at: string;
  last_seen_at: string;
  next_performance_at: string | null;
  /** Hora conocida de la próxima función: `false` = solo fecha; `null`/`true` = con hora. */
  next_performance_time_known: boolean | null;
  artists: CatalogArtistRef[];
  venue: CatalogVenueRef | null;
  sources: CatalogEventSource[];
  performances: CatalogPerformance[];
}

/**
 * Cursor opaco de paginación keyset sobre `(next_performance_at asc nullslast,
 * id asc)`. Describe la última fila devuelta por `listEvents`.
 *
 * - `phase: 'nonnull'` → se recorren filas con `next_performance_at` no nulo;
 *   `nextAt` es ese timestamp e `id` el de la última fila.
 * - `phase: 'null'` → zona de filas con `next_performance_at` nulo; `nextAt` es
 *   siempre `null` e `id` el de la última fila (0 al entrar a la zona NULL).
 */
export interface EventCursor {
  phase: "nonnull" | "null";
  nextAt: string | null;
  id: number;
}

/**
 * Filtro de rango de fecha para `listEvents`, sobre la columna top-level
 * `next_performance_at` (timestamptz). Ambos extremos son opcionales e
 * inclusivos (`gte`/`lte`). Los ISO deben venir ya calculados en la zona del
 * negocio (America/Santiago); el cliente solo los traslada a PostgREST.
 */
export interface ListEventsRange {
  gteISO?: string;
  lteISO?: string;
}

/**
 * Filtros de faceta server-side para `listEvents` (Etapa 5). Todas las claves
 * son opcionales; cada faceta aplica un AND respecto de las demás, y OR dentro
 * de la propia faceta.
 *
 * - `sources`: códigos de fuente (`"ticketmaster"`, `"puntoticket"`). Con 0 o
 *   TODOS los valores posibles seleccionados equivale a "sin filtro" (se omite),
 *   porque un evento nunca comparte el mismo objeto en dos fuentes y combinar
 *   dos `contains` jsonb daría vacío. Solo 1 valor efectivo genera filtro.
 * - `cities`: valores de `venue.city` (p. ej. `"Santiago Centro"`); OR vía `in`.
 * - `statuses`: estado de venta visible; solo `available` y `sold_out`
 *   (`unknown` se presenta como "Confirmado" y no es filtrable como faceta).
 *
 * Un arreglo vacío equivale a la clave ausente (sin filtro).
 */
export interface ListEventsFilters {
  sources?: string[];
  cities?: string[];
  statuses?: Array<"available" | "sold_out">;
}

/** Parámetros de `listEvents`: página keyset + búsqueda server-side. */
export interface ListEventsParams {
  limit?: number;
  search?: string;
  cursor?: EventCursor | null;
  /**
   * Rango de fecha opcional. Al estar presente, filtra por
   * `next_performance_at` (gte/lte) tanto en datos como en el conteo global, y
   * fuerza la fase A (no-nulos) para no mezclar la zona NULL. Ausente =>
   * comportamiento byte-idéntico al histórico.
   */
  range?: ListEventsRange;
  /**
   * Filtros de faceta opcionales (fuente/ciudad/estado). Al estar presentes,
   * se aplican tanto en la query de datos como en la de conteo global, igual
   * que `range`. Ausentes o vacíos => comportamiento byte-idéntico al histórico.
   */
  filters?: ListEventsFilters;
}

/**
 * Resultado de `listEvents`: una página de eventos, el total GLOBAL (via
 * Content-Range en la primera página; `null` si no se pudo determinar) y el
 * cursor para la siguiente página (`null` cuando no hay más datos).
 */
export interface ListEventsResult {
  items: CatalogEvent[];
  total: number | null;
  nextCursor: EventCursor | null;
}

/** Evento compacto para las páginas de artista/venue. */
export interface CatalogEventBrief {
  id: number;
  slug: string;
  name: string;
  image_url: string | null;
  status: EventStatus;
  next_at: string | null;
  venue_name?: string | null;
  venue_slug?: string | null;
  artists?: CatalogArtistRef[];
}

/** Fila de `catalog_artists_v1`. */
export interface CatalogArtist {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  city: string | null;
  country: string | null;
  genre: string | null;
  image_url: string | null;
  links: Record<string, string>;
  verified: boolean;
  events: CatalogEventBrief[];
}

/** Fila de `catalog_venues_v1`. */
export interface CatalogVenue {
  id: number;
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  links: Record<string, string>;
  image_url: string | null;
  events: CatalogEventBrief[];
}
