import type { CatalogEvent } from "./types.js";

/**
 * Configuración pública de lectura del catálogo.
 *
 * `publishableKey` es una clave de solo lectura protegida por RLS; puede llegar
 * al navegador. NUNCA usar aquí la secret key ni tokens privados.
 */
export interface CatalogClientConfig {
  url: string;
  publishableKey: string;
}

export class CatalogClientError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "CatalogClientError";
  }
}

function normalizeConfig(config: CatalogClientConfig): CatalogClientConfig {
  const url = config.url?.trim().replace(/\/$/u, "");
  const publishableKey = config.publishableKey?.trim();
  if (!url || !publishableKey) {
    throw new CatalogClientError("CatalogClient requiere url y publishableKey.");
  }
  return { url, publishableKey };
}

/**
 * Cliente de lectura del catálogo público.
 *
 * Frontera única de acceso a datos del frontend. Hoy consulta la Data API de
 * Supabase directamente contra la vista `catalog_events_v1`. Para migrar a una
 * capa intermedia (Worker/API propia) en el futuro, basta reimplementar estos
 * métodos apuntando al nuevo endpoint; la UI no cambia.
 */
export class CatalogClient {
  private readonly config: CatalogClientConfig;

  constructor(config: CatalogClientConfig, private readonly fetchImpl: typeof fetch = fetch) {
    this.config = normalizeConfig(config);
  }

  async listEvents(params: { limit?: number; search?: string } = {}): Promise<CatalogEvent[]> {
    const query = new URLSearchParams({ select: "*", order: "next_performance_at.asc.nullslast" });
    if (params.limit && params.limit > 0) query.set("limit", String(params.limit));
    if (params.search?.trim()) query.set("name", `ilike.*${params.search.trim()}*`);
    return this.request<CatalogEvent[]>(`/rest/v1/catalog_events_v1?${query.toString()}`);
  }

  async getEvent(id: number): Promise<CatalogEvent | undefined> {
    const query = new URLSearchParams({ select: "*", id: `eq.${id}`, limit: "1" });
    const rows = await this.request<CatalogEvent[]>(`/rest/v1/catalog_events_v1?${query.toString()}`);
    return rows[0];
  }

  private async request<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.url}${path}`, {
        headers: {
          apikey: this.config.publishableKey,
          accept: "application/json"
        }
      });
    } catch (error) {
      throw new CatalogClientError(error instanceof Error ? error.message : "Error de red al leer el catálogo.");
    }
    const text = await response.text();
    if (!response.ok) {
      throw new CatalogClientError("La Data API rechazó la lectura del catálogo.", response.status);
    }
    try {
      return (text ? JSON.parse(text) : []) as T;
    } catch {
      throw new CatalogClientError("La Data API devolvió una respuesta no válida.");
    }
  }
}
