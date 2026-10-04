import type {
  CatalogArtist,
  CatalogEvent,
  CatalogFreshness,
  CatalogVenue,
  EventCursor,
  ListEventsParams,
  ListEventsResult
} from "./types";

/** Tamaño de página por defecto para `listEvents` (keyset). */
const DEFAULT_LIMIT = 20;

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
 * Frontera única de acceso a datos del frontend. Consulta la Data API de
 * Supabase contra las vistas del catálogo canónico (`catalog_events_v2`,
 * `catalog_artists_v1`, `catalog_venues_v1`). Para migrar a una capa intermedia
 * (Worker/API propia) en el futuro, basta reimplementar estos métodos apuntando
 * al nuevo endpoint; la UI no cambia.
 */
export class CatalogClient {
  private readonly config: CatalogClientConfig;

  private readonly fetchImpl: typeof fetch;

  constructor(config: CatalogClientConfig, fetchImpl?: typeof fetch) {
    this.config = normalizeConfig(config);
    // Importante: no guardar la referencia global `fetch` desnuda y llamarla como
    // método (this.fetchImpl(...)). En el navegador eso invoca fetch con
    // this === CatalogClient y lanza "Illegal invocation". El default envuelve la
    // llamada para preservar el binding a globalThis; los tests siguen pudiendo
    // inyectar su propio fetch.
    this.fetchImpl = fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  /**
   * Lista eventos con paginación keyset en DOS FASES sobre el orden
   * `(next_performance_at asc nullslast, id asc)`. Devuelve una página de
   * `items`, el `total` GLOBAL y el `nextCursor` para la siguiente página.
   *
   * ## Keyset en dos fases
   *
   * - **Fase A (no-nulos)**, `cursor.phase === 'nonnull'`. Filas con
   *   `next_performance_at` no nulo. La query de datos es, con limit=20 y
   *   cursor `{ nextAt:'2026-11-27T00:00:00+00:00', id:42 }`:
   *   ```
   *   /rest/v1/catalog_events_v2?select=*
   *     &order=next_performance_at.asc.nullslast,id.asc
   *     &limit=20
   *     &or=(next_performance_at.gt.2026-11-27T00:00:00+00:00,and(next_performance_at.eq.2026-11-27T00:00:00+00:00,id.gt.42))
   *   ```
   *   `gt`/`eq` sobre una columna nullable ya excluyen NULL, así que la fase A
   *   nunca devuelve la zona NULL. La primera página (sin cursor) omite el `or=`.
   *
   * - **Fase B (nulos)**, `cursor.phase === 'null'`. Filas con
   *   `next_performance_at` nulo, orden solo por `id.asc`:
   *   ```
   *   /rest/v1/catalog_events_v2?select=*&next_performance_at=is.null&order=id.asc&limit=20&id=gt.<i>
   *   ```
   *
   * ## Avance del cursor por la zona NULL
   *
   * El `nextCursor` describe la última fila devuelta. En fase A, si una página
   * trae `< limit` filas, la fase A se agotó: el siguiente cursor salta a la
   * zona NULL con `{ phase:'null', nextAt:null, id:0 }` (id 0 para traer todos
   * los nulos desde el inicio del tramo). Si la página trae `limit` filas, el
   * cursor continúa en fase A con el `(nextAt,id)` de la última fila. En fase B,
   * si trae `< limit` filas se agotaron los datos (`nextCursor = null`); si trae
   * `limit`, continúa con `{ phase:'null', nextAt:null, id:<ultimo id> }`.
   *
   * ## Total global
   *
   * En la primera página (sin cursor) se hace una query de conteo aparte con
   * `Prefer: count=exact` (sin filtros de fase ni keyset; solo `name=ilike` si
   * hay búsqueda) y se parsea el denominador del `Content-Range`. En páginas
   * siguientes el total no se recalcula (el front conserva el de la primera).
   */
  async listEvents(params: ListEventsParams = {}): Promise<ListEventsResult> {
    const limit = params.limit && params.limit > 0 ? params.limit : DEFAULT_LIMIT;
    const search = params.search?.trim();
    const cursor = params.cursor ?? null;

    // Total GLOBAL: solo en la primera página. Query de conteo sin orden ni
    // filtros de fase/keyset; `select=id&limit=1` minimiza payload y
    // `Prefer: count=exact` fuerza el denominador exacto en Content-Range.
    let total: number | null = null;
    if (!cursor) {
      const countQuery = new URLSearchParams({ select: "id", limit: "1" });
      if (search) countQuery.set("name", `ilike.*${search}*`);
      const { contentRange } = await this.requestWithRange<CatalogEvent[]>(
        `/rest/v1/catalog_events_v2?${countQuery.toString()}`,
        { prefer: "count=exact" }
      );
      total = parseContentRangeTotal(contentRange);
    }

    const query = new URLSearchParams({ select: "*", limit: String(limit) });
    if (search) query.set("name", `ilike.*${search}*`);

    const phase: EventCursor["phase"] = cursor?.phase ?? "nonnull";
    if (phase === "nonnull") {
      query.set("order", "next_performance_at.asc.nullslast,id.asc");
      if (cursor) {
        // Keyset "después de (a,i)" en fase A.
        query.set(
          "or",
          `(next_performance_at.gt.${cursor.nextAt},and(next_performance_at.eq.${cursor.nextAt},id.gt.${cursor.id}))`
        );
      }
    } else {
      // Fase B: solo la zona NULL, orden por id.
      query.set("next_performance_at", "is.null");
      query.set("order", "id.asc");
      query.set("id", `gt.${cursor?.id ?? 0}`);
    }

    const { data: items } = await this.requestWithRange<CatalogEvent[]>(
      `/rest/v1/catalog_events_v2?${query.toString()}`
    );

    const nextCursor = computeNextCursor(phase, items, limit);
    return { items, total, nextCursor };
  }

  async getEvent(id: number): Promise<CatalogEvent | undefined> {
    const query = new URLSearchParams({ select: "*", id: `eq.${id}`, limit: "1" });
    const rows = await this.request<CatalogEvent[]>(`/rest/v1/catalog_events_v2?${query.toString()}`);
    return rows[0];
  }

  async getEventBySlug(slug: string): Promise<CatalogEvent | undefined> {
    const query = new URLSearchParams({ select: "*", slug: `eq.${slug}`, limit: "1" });
    const rows = await this.request<CatalogEvent[]>(`/rest/v1/catalog_events_v2?${query.toString()}`);
    return rows[0];
  }

  async getArtistBySlug(slug: string): Promise<CatalogArtist | undefined> {
    const query = new URLSearchParams({ select: "*", slug: `eq.${slug}`, limit: "1" });
    const rows = await this.request<CatalogArtist[]>(`/rest/v1/catalog_artists_v1?${query.toString()}`);
    return rows[0];
  }

  async getVenueBySlug(slug: string): Promise<CatalogVenue | undefined> {
    const query = new URLSearchParams({ select: "*", slug: `eq.${slug}`, limit: "1" });
    const rows = await this.request<CatalogVenue[]>(`/rest/v1/catalog_venues_v1?${query.toString()}`);
    return rows[0];
  }

  /**
   * Frescura del catálogo (última corrida succeeded/partial) de una fuente.
   *
   * Consulta la RPC pública `catalog_freshness_v1` por la Data API. Devuelve
   * `undefined` si la fuente aún no tiene corridas publicables. La UI usa esto
   * para el indicador "actualizado hace X"; su ausencia no debe romper el listado.
   */
  async getFreshness(source?: string): Promise<CatalogFreshness | undefined> {
    const rows = await this.request<CatalogFreshness[]>(
      "/rest/v1/rpc/catalog_freshness_v1",
      { p_source: source ?? null }
    );
    return rows[0];
  }

  /**
   * Lectura simple: GET (o POST si hay `body`) con headers `apikey`/`accept`.
   * Firma y comportamiento intactos para getEvent/getEventBySlug/
   * getArtistBySlug/getVenueBySlug/getFreshness: descarta headers de respuesta.
   */
  private async request<T>(path: string, body?: unknown): Promise<T> {
    const { data } = await this.send<T>(path, { body });
    return data;
  }

  /**
   * Variante que permite enviar `Prefer` (p. ej. `count=exact`) y expone el
   * header `Content-Range` de la respuesta. Usada por `listEvents` para el
   * total global y la paginación; no afecta a los demás métodos.
   */
  private async requestWithRange<T>(
    path: string,
    opts: { prefer?: string } = {}
  ): Promise<{ data: T; contentRange: string | null }> {
    return this.send<T>(path, { prefer: opts.prefer });
  }

  private async send<T>(
    path: string,
    opts: { body?: unknown; prefer?: string } = {}
  ): Promise<{ data: T; contentRange: string | null }> {
    let response: Response;
    try {
      const headers: Record<string, string> = {
        apikey: this.config.publishableKey,
        accept: "application/json"
      };
      if (opts.prefer) headers.prefer = opts.prefer;
      const init: RequestInit = { headers };
      if (opts.body !== undefined) {
        init.method = "POST";
        headers["content-type"] = "application/json";
        init.body = JSON.stringify(opts.body);
      }
      const doFetch = this.fetchImpl;
      response = await doFetch(`${this.config.url}${path}`, init);
    } catch (error) {
      throw new CatalogClientError(error instanceof Error ? error.message : "Error de red al leer el catálogo.");
    }
    const text = await response.text();
    if (!response.ok) {
      throw new CatalogClientError("La Data API rechazó la lectura del catálogo.", response.status);
    }
    try {
      const data = (text ? JSON.parse(text) : []) as T;
      return { data, contentRange: response.headers.get("content-range") };
    } catch {
      throw new CatalogClientError("La Data API devolvió una respuesta no válida.");
    }
  }
}

/**
 * Parsea el total GLOBAL del header `Content-Range` de PostgREST. El total es
 * el denominador tras `/`. Fallbacks:
 * - "0-19/142" -> 142
 * - "*" + "/0" -> 0
 * - "*" + "/" + "*", header ausente o no numérico -> null
 */
function parseContentRangeTotal(contentRange: string | null): number | null {
  if (!contentRange) return null;
  const slash = contentRange.lastIndexOf("/");
  if (slash < 0) return null;
  const denom = contentRange.slice(slash + 1).trim();
  if (denom === "*" || denom === "") return null;
  const total = Number.parseInt(denom, 10);
  return Number.isNaN(total) ? null : total;
}

/**
 * Calcula el cursor para la siguiente página a partir de la fase actual, las
 * filas devueltas y el `limit`. Ver la regla de avance por la zona NULL en el
 * doc de `listEvents`.
 */
function computeNextCursor(
  phase: EventCursor["phase"],
  items: CatalogEvent[],
  limit: number
): EventCursor | null {
  const last = items[items.length - 1];
  const incomplete = items.length < limit;
  if (phase === "nonnull") {
    // Fase A agotada (página incompleta) → saltar a la zona NULL desde el inicio.
    if (incomplete) return { phase: "null", nextAt: null, id: 0 };
    // Página completa (o sin filas pero == limit): continuar en fase A.
    if (!last) return { phase: "null", nextAt: null, id: 0 };
    return { phase: "nonnull", nextAt: last.next_performance_at, id: last.id };
  }
  // Fase B: página incompleta → fin de datos.
  if (incomplete || !last) return null;
  return { phase: "null", nextAt: null, id: last.id };
}
