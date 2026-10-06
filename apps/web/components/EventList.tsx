"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CatalogFreshness } from "@mishow/catalog-client";
import { catalogClient, catalogConfigured } from "../lib/catalog";
import { formatRelativeTime } from "../lib/format";
import { dateRange, isFree, parseRango, type RangoKind } from "../lib/discovery";
import {
  appendPage,
  canLoadMore,
  parseSnapshot,
  resetForSearch,
  serializeSnapshot,
  type EventListState
} from "../lib/event-list-state";
import { FilterChips } from "./ui/FilterChips";
import { FilterSheet } from "./ui/FilterSheet";
import { ActiveFilterChips } from "./ui/ActiveFilterChips";
import { EventRow } from "./ui/EventRow";
import { SectionHeader } from "./ui/SectionHeader";
import {
  activeFilterCount,
  clearFilters,
  mergeFiltersIntoParams,
  parseFilters,
  removeFilter,
  toListEventsFilters,
  type FiltersState
} from "../lib/filters";

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;
/**
 * Clave única del snapshot de restauración en sessionStorage. Vive en /eventos
 * (el listado completo del Catálogo), de ahí el nombre `eventos`.
 */
const SNAPSHOT_KEY = "mishow:eventos:snapshot";

/**
 * ¿Volvemos de una navegación hacia atrás? Base para la restauración pragmática
 * del listado. Degrada a `false` (arranque limpio) si la Navigation Timing API
 * no está disponible, para no romper en navegadores que no la exponen.
 *
 * Limitación conocida: en Next (App Router) una navegación client-side a
 * `/evento` y el back pueden no reflejarse como `back_forward` en el entry de
 * navegación. Por eso el snapshot se restaura solo cuando el `term` coincide con
 * `?q=`; si la detección falla, se arranca desde el primer bloque sin romper.
 */
function isBackNavigation(): boolean {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return false;
  }
  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return entry?.type === "back_forward";
}

/**
 * Rango de fecha para `listEvents` a partir del chip activo. Solo los chips de
 * fecha (hoy/semana/mes) producen un filtro server-side; "gratis" NO lo hace
 * (price_min vive en sources jsonb, no es filtrable server-side simple) y se
 * resuelve como post-filtro cliente con `isFree`.
 */
function rangeForChip(rango: RangoKind | null) {
  if (rango === "hoy" || rango === "semana" || rango === "mes") return dateRange(rango);
  return undefined;
}

export function EventList() {
  return (
    <Suspense fallback={<p className="text-sm text-text-muted">Cargando eventos…</p>}>
      <EventListContent />
    </Suspense>
  );
}

function EventListContent() {
  const searchParams = useSearchParams();
  const configured = catalogConfigured();

  // Término "crudo" (lo que se ve en el input) y término aplicado (tras debounce).
  const initialTerm = searchParams.get("q") ?? "";
  const [inputTerm, setInputTerm] = useState(initialTerm);
  const [appliedTerm, setAppliedTerm] = useState(initialTerm);

  // Rango activo (chip): se lee de ?rango= al montar y se refleja en la URL.
  const [rango, setRango] = useState<RangoKind | null>(() => parseRango(searchParams.get("rango")));

  // Filtros de faceta (fuente/ciudad/estado): se leen de la URL al montar y se
  // reflejan con history.replaceState. El reseteo del listado lo dispara el
  // efecto de carga (depende de `filters`), igual que `rango`/término.
  const [filters, setFilters] = useState<FiltersState>(() => parseFilters(searchParams.toString()));
  const [sheetOpen, setSheetOpen] = useState(false);
  // Catálogo de ciudades para el sheet: se deriva de los eventos cargados (sin
  // endpoint nuevo ni hardcode). Se acumula para no perder opciones al paginar.
  const [cityCatalog, setCityCatalog] = useState<string[]>([]);
  // Disparador del sheet, para restaurar el foco al cerrarlo.
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);

  const [list, setList] = useState<EventListState>(() => resetForSearch(initialTerm));
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<CatalogFreshness | undefined>(undefined);

  // Refs de control: el estado más reciente para los callbacks de fetch, un
  // guard anti doble disparo y un token para descartar respuestas obsoletas.
  const listRef = useRef(list);
  listRef.current = list;
  const inFlightRef = useRef(false);
  const requestTokenRef = useRef(0);
  // El rango activo visible por los callbacks de carga incremental (para
  // reconstruir el mismo filtro al pedir la siguiente página).
  const rangoRef = useRef(rango);
  rangoRef.current = rango;
  // Los filtros de faceta visibles por la carga incremental.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  // Si true, la próxima carga del término aplicado se saltea (ya restauramos
  // desde sessionStorage). Se consume una sola vez.
  const restoredRef = useRef(false);

  const client = catalogClient();

  // --- Restauración pragmática al montar (volver del detalle) ------------------
  useEffect(() => {
    if (!configured) return;
    if (!isBackNavigation()) return;
    const snapshot = parseSnapshot(sessionStorage.getItem(SNAPSHOT_KEY));
    if (!snapshot) return;
    // Solo restauramos si el término persistido coincide con el ?q= actual.
    if (snapshot.term !== initialTerm) return;
    restoredRef.current = true;
    setList({ term: snapshot.term, items: snapshot.items, cursor: snapshot.cursor, total: snapshot.total });
    // Restaurar scroll tras pintar los items.
    requestAnimationFrame(() => window.scrollTo(0, snapshot.scrollY));
    // Solo al montar: la restauración se evalúa una vez con el ?q= inicial.
  }, []);

  // --- Debounce del input hacia el término aplicado + sincronización a ?q= -----
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setAppliedTerm(inputTerm.trim());
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [inputTerm]);

  useEffect(() => {
    // Reflejar el término en ?q= sin recargar ni crear entradas de historial.
    const params = new URLSearchParams(window.location.search);
    if (appliedTerm) {
      params.set("q", appliedTerm);
    } else {
      params.delete("q");
    }
    const query = params.toString();
    const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);
  }, [appliedTerm]);

  // --- Cambio de chip de rango: reflejar ?rango= en la URL ---------------------
  // El reseteo del listado lo dispara el efecto de carga (depende de `rango`),
  // igual que un cambio de término.
  const updateRango = useCallback((next: RangoKind | null) => {
    setRango(next);
    const params = new URLSearchParams(window.location.search);
    if (next) {
      params.set("rango", next);
    } else {
      params.delete("rango");
    }
    const query = params.toString();
    const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);
  }, []);

  // --- Cambio de filtros de faceta: reflejar ?fuente/?ciudad/?estado en la URL -
  const updateFilters = useCallback((next: FiltersState) => {
    setFilters(next);
    const base = new URLSearchParams(window.location.search);
    const merged = mergeFiltersIntoParams(base, next);
    const query = merged.toString();
    const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);
  }, []);

  // --- Carga de la primera página al cambiar término, rango o filtros ----------
  const loadFirstPage = useCallback(
    (term: string, activeRango: RangoKind | null, activeFilters: FiltersState) => {
      const token = ++requestTokenRef.current;
      inFlightRef.current = true;
      setError(null);
      setIsLoadingInitial(true);
      const base = resetForSearch(term);
      setList(base);
      // Resetear scroll al tope: un cambio de chip, término o filtro es un
      // listado nuevo.
      if (typeof window !== "undefined") window.scrollTo(0, 0);
      client
        .listEvents({
          limit: PAGE_SIZE,
          search: term || undefined,
          range: rangeForChip(activeRango),
          filters: toListEventsFilters(activeFilters)
        })
        .then((pageResult) => {
          if (token !== requestTokenRef.current) return;
          setList(appendPage(base, pageResult));
        })
        .catch((err: unknown) => {
          if (token !== requestTokenRef.current) return;
          setError(err instanceof Error ? err.message : "Error al cargar.");
        })
        .finally(() => {
          if (token !== requestTokenRef.current) return;
          inFlightRef.current = false;
          setIsLoadingInitial(false);
        });
    },
    [client]
  );

  useEffect(() => {
    if (!configured) return;
    // Si acabamos de restaurar un snapshot para este término, no recargamos.
    if (restoredRef.current) {
      restoredRef.current = false;
      return;
    }
    loadFirstPage(appliedTerm, rango, filters);
    // Dispara al cambiar término aplicado, rango, filtros o configuración;
    // loadFirstPage es estable (depende de client) y no se incluye a propósito.
  }, [appliedTerm, rango, filters, configured]);

  // --- Carga incremental (scroll infinito + botón) -----------------------------
  const loadMore = useCallback(() => {
    const current = listRef.current;
    if (inFlightRef.current) return; // guard anti doble disparo
    if (!canLoadMore(current)) return;
    const token = requestTokenRef.current;
    inFlightRef.current = true;
    setError(null);
    setIsLoadingMore(true);
    client
      .listEvents({
        limit: PAGE_SIZE,
        search: current.term || undefined,
        cursor: current.cursor,
        range: rangeForChip(rangoRef.current),
        filters: toListEventsFilters(filtersRef.current)
      })
      .then((pageResult) => {
        if (token !== requestTokenRef.current) return;
        setList(appendPage(listRef.current, pageResult));
      })
      .catch((err: unknown) => {
        if (token !== requestTokenRef.current) return;
        setError(err instanceof Error ? err.message : "Error al cargar.");
      })
      .finally(() => {
        if (token !== requestTokenRef.current) return;
        inFlightRef.current = false;
        setIsLoadingMore(false);
      });
  }, [client]);

  // Reintento del ÚLTIMO fetch: si no hay items es la primera página; si ya hay,
  // es una carga incremental.
  const retry = useCallback(() => {
    if (listRef.current.items.length === 0) {
      loadFirstPage(appliedTerm, rango, filters);
    } else {
      loadMore();
    }
  }, [appliedTerm, rango, filters, loadFirstPage, loadMore]);

  // --- IntersectionObserver sobre el centinela ---------------------------------
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return; // degradar: queda el botón
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  // --- Persistir snapshot + marcar back al navegar al detalle ------------------
  useEffect(() => {
    if (!configured) return;
    const persist = () => {
      const current = listRef.current;
      const snapshot = serializeSnapshot({
        term: current.term,
        items: current.items,
        cursor: current.cursor,
        total: current.total,
        scrollY: window.scrollY
      });
      try {
        sessionStorage.setItem(SNAPSHOT_KEY, snapshot);
      } catch {
        /* sessionStorage lleno o no disponible: degradar sin romper */
      }
    };
    // Capturamos en fase de captura para guardar el scroll antes de navegar.
    document.addEventListener("click", onDetailClick, true);
    window.addEventListener("pagehide", persist);
    function onDetailClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href^='/evento']");
      if (anchor) persist();
    }
    return () => {
      document.removeEventListener("click", onDetailClick, true);
      window.removeEventListener("pagehide", persist);
    };
  }, [configured]);

  // --- Frescura (adorno; su fallo no afecta el listado) ------------------------
  useEffect(() => {
    if (!configured) return;
    let active = true;
    client
      .getFreshness("puntoticket")
      .then((value) => {
        if (active) setFreshness(value);
      })
      .catch(() => {
        /* silencioso */
      });
    return () => {
      active = false;
    };
    // Solo depende de configured; client es estable y se omite a propósito.
  }, [configured]);

  // --- Catálogo de ciudades para el sheet (derivado de los eventos cargados) ---
  // Acumula las ciudades vistas para no perder opciones al paginar o al filtrar.
  // Incluye además las ciudades ya seleccionadas (vía URL) aunque aún no estén
  // en la página, para que el sheet pueda mostrarlas/desmarcarlas.
  useEffect(() => {
    setCityCatalog((prev) => {
      const seen = new Set(prev);
      for (const event of list.items) {
        const city = event.venue?.city?.trim();
        if (city) seen.add(city);
      }
      for (const city of filters.cities) seen.add(city);
      const merged = Array.from(seen);
      // Orden alfabético estable (es-CL) para una lista predecible.
      merged.sort((a, b) => a.localeCompare(b, "es-CL"));
      // Evita re-render si no cambió el contenido.
      if (merged.length === prev.length && merged.every((c, i) => c === prev[i])) return prev;
      return merged;
    });
  }, [list.items, filters.cities]);

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    // Restaurar el foco al disparador tras cerrar.
    requestAnimationFrame(() => filterButtonRef.current?.focus());
  }, []);
  const applyFiltersFromSheet = useCallback(
    (next: FiltersState) => {
      updateFilters(next);
      closeSheet();
    },
    [updateFilters, closeSheet]
  );

  const activeCount = activeFilterCount(filters);

  const updatedLabel = formatRelativeTime(freshness?.last_run_finished_at);
  // El chip "Gratis" se aplica como post-filtro cliente sobre lo ya cargado.
  const freeFilterActive = rango === "gratis";
  const visibleItems = freeFilterActive ? list.items.filter((event) => isFree(event.sources)) : list.items;
  const moreAvailable = canLoadMore(list);
  const hasItems = visibleItems.length > 0;
  const showEmpty = !isLoadingInitial && !error && !hasItems;

  if (!configured) {
    return (
      <section>
        <p className="rounded-lg border border-warning bg-warning-surface p-4 text-sm text-warning">
          El catálogo no está configurado. Define <code>NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (ver <code>.env.example</code>).
        </p>
      </section>
    );
  }

  return (
    <section>
      {updatedLabel && freshness?.last_run_finished_at ? (
        <p className="mb-3 text-xs text-text-muted">
          Catálogo <time dateTime={freshness.last_run_finished_at}>{updatedLabel}</time>
        </p>
      ) : null}

      <div className="mb-4 flex items-stretch gap-2">
        <label className="block flex-1">
          <span className="sr-only">Buscar eventos</span>
          <input
            type="search"
            value={inputTerm}
            onChange={(event) => setInputTerm(event.target.value)}
            placeholder="¿Qué quieres ver?"
            className="w-full rounded-[10px] border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-brand sm:text-base"
          />
        </label>
        <button
          ref={filterButtonRef}
          type="button"
          onClick={openSheet}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[10px] border border-border bg-surface px-4 py-3 text-sm font-medium text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span>Filtros</span>
          {activeCount > 0 ? (
            <span className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-contrast">
              {activeCount}
            </span>
          ) : null}
        </button>
      </div>

      <div className="mb-4">
        <FilterChips value={rango} onChange={updateRango} />
      </div>

      <ActiveFilterChips value={filters} onRemove={(facet, value) => updateFilters(removeFilter(filters, facet, value))} onClearAll={() => updateFilters(clearFilters())} />

      <FilterSheet
        open={sheetOpen}
        value={filters}
        cities={cityCatalog}
        onApply={applyFiltersFromSheet}
        onClose={closeSheet}
      />

      {/* Encabezado del listado (Figma: "Todos los eventos" sobre la lista). */}
      <SectionHeader title="Todos los eventos" />

      {typeof list.total === "number" && !freeFilterActive ? (
        <p className="mb-4 text-xs text-text-muted" aria-live="polite">
          {list.total === 1 ? "1 evento" : `${list.total} eventos`}
        </p>
      ) : null}

      {isLoadingInitial && !hasItems ? (
        <p className="text-sm text-text-muted">Cargando eventos…</p>
      ) : null}

      {error && !hasItems ? (
        <div className="rounded-lg border border-danger bg-danger-surface p-4 text-sm text-danger">
          <p>No se pudo cargar el catálogo: {error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 inline-flex min-h-9 items-center rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-contrast focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {showEmpty ? (
        <div className="text-sm text-text-muted">
          {freeFilterActive ? (
            // Estado vacío HONESTO del chip Gratis: hoy no hay eventos con
            // price_min=0 (ver data_reality: 0/143 gratis). No inventamos datos.
            <p>No hay eventos gratuitos por ahora.</p>
          ) : activeCount > 0 ? (
            // Estado vacío honesto de los filtros de faceta: la combinación
            // activa no tiene resultados. Ofrecemos limpiar los filtros.
            <p>
              Sin resultados para estos filtros.{" "}
              <button
                type="button"
                onClick={() => updateFilters(clearFilters())}
                className="underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Limpiar filtros
              </button>
            </p>
          ) : appliedTerm ? (
            <p>
              No hay eventos que coincidan con la búsqueda.{" "}
              <button
                type="button"
                onClick={() => setInputTerm("")}
                className="underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Limpiar búsqueda
              </button>
            </p>
          ) : (
            <p>No hay eventos para este filtro.</p>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {visibleItems.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>

      {hasItems ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          {/* Centinela para el scroll infinito. */}
          <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />

          {error ? (
            <div className="w-full rounded-lg border border-danger bg-danger-surface p-4 text-center text-sm text-danger">
              <p>No se pudieron cargar más eventos: {error}</p>
              <button
                type="button"
                onClick={retry}
                className="mt-3 inline-flex min-h-9 items-center rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-contrast focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Reintentar
              </button>
            </div>
          ) : moreAvailable ? (
            <button
              type="button"
              onClick={loadMore}
              disabled={isLoadingMore}
              aria-busy={isLoadingMore}
              className="inline-flex min-h-9 items-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
            >
              {isLoadingMore ? "Cargando…" : "Cargar más"}
            </button>
          ) : (
            <p className="text-xs text-text-muted">No hay más eventos.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
