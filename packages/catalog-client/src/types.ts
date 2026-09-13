import type { EventStatus } from "@mishow/domain";

/**
 * Forma pública de una fila de la vista `catalog_events_v1`.
 *
 * Esta es la ÚNICA representación de datos que el frontend consume. Si en el
 * futuro se introduce una capa intermedia (Cloudflare Worker), debe respetar
 * este mismo contrato para no obligar a cambios en la UI.
 */
export interface CatalogArtist {
  name: string;
}

export interface CatalogVenue {
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
  performance_code?: string;
  purchase_url?: string;
}

/**
 * Frescura del catálogo por fuente.
 *
 * Refleja la última corrida de scraping `succeeded`/`partial` de una fuente. Se
 * obtiene desde la RPC pública `catalog_freshness_v1` (SECURITY DEFINER), que
 * expone SOLO columnas no sensibles: nunca `listing_url`, `parameters` ni
 * contadores de error. Sirve para mostrar "actualizado hace X" en la UI.
 */
export interface CatalogFreshness {
  source: string;
  last_run_finished_at: string | null;
  last_run_status: string | null;
  discovered_count: number | null;
  succeeded_count: number | null;
}

export interface CatalogEvent {
  id: number;
  source: string;
  source_url: string;
  source_code: string | null;
  purchase_url: string | null;
  image_url: string | null;
  name: string;
  status: EventStatus;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  source_extracted_at: string;
  first_seen_at: string;
  last_seen_at: string;
  next_performance_at: string | null;
  artists: CatalogArtist[];
  venue: CatalogVenue | null;
  performances: CatalogPerformance[];
}
