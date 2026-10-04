"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogEvent } from "@mishow/catalog-client";
import { catalogClient, catalogConfigured } from "../lib/catalog";
import { dateRange, selectFeatured, type RangoKind } from "../lib/discovery";
import { SectionHeader } from "./ui/SectionHeader";
import { FeaturedCard } from "./ui/FeaturedCard";

/**
 * Sección "Destacados" de la Home. Obtiene los próximos eventos reales con
 * `catalogClient().listEvents` (aplicando el rango activo de los chips) y elige
 * los destacados con `selectFeatured`.
 *
 * El "destacado" es un fallback por cercanía temporal (NO hay campo destacado
 * real en el catálogo). `isFeatured` queda como hook para el futuro: cuando el
 * dato exista, se podrá filtrar aquí antes de recortar.
 *
 * Layout:
 * - mobile: 1 FeaturedCard primaria.
 * - desktop (lg+): 1 primaria + 2 mini-featured con los siguientes por cercanía.
 *
 * El chip "gratis" no es filtro server-side (price_min vive en sources jsonb):
 * para destacados no aplicamos filtro de precio, usamos la cercanía general.
 */

/**
 * Hook de futuro: cuando exista un dato real de destacado (p. ej. una columna
 * `featured` o un flag en sources), esta función lo leerá del evento. Hoy no
 * existe (ver data_reality), así que siempre devuelve false y el destacado cae
 * al fallback por cercanía.
 */
function isFeatured(event: CatalogEvent): boolean {
  void event;
  return false;
}

const FETCH_LIMIT = 20;

export function FeaturedSection({ rango }: { rango: RangoKind | null }) {
  const [events, setEvents] = useState<CatalogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!catalogConfigured()) {
      setLoading(false);
      return;
    }
    const token = ++tokenRef.current;
    setLoading(true);
    setFailed(false);
    // 'gratis' no tiene filtro server-side; para destacados usamos cercanía sin
    // rango de fecha. 'hoy'/'semana'/'mes' sí acotan por next_performance_at.
    const range = rango === "hoy" || rango === "semana" || rango === "mes" ? dateRange(rango) : undefined;
    catalogClient()
      .listEvents({ limit: FETCH_LIMIT, range })
      .then((result) => {
        if (token !== tokenRef.current) return;
        // Si en el futuro existe el dato, priorizar los marcados destacados.
        const marked = result.items.filter(isFeatured);
        const pool = marked.length > 0 ? marked : result.items;
        setEvents(selectFeatured(pool, 3));
      })
      .catch(() => {
        if (token !== tokenRef.current) return;
        setFailed(true);
      })
      .finally(() => {
        if (token !== tokenRef.current) return;
        setLoading(false);
      });
  }, [rango]);

  if (!catalogConfigured() || failed) return null;

  const [primary, ...rest] = events;
  const mini = rest.slice(0, 2);

  return (
    <section>
      <SectionHeader title="Destacados" subtitle="Eventos imperdibles, elegidos para ti." />
      {loading && events.length === 0 ? (
        <div className="h-56 animate-pulse rounded-[14px] border border-border bg-surface-event" aria-hidden="true" />
      ) : primary ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <FeaturedCard event={primary} variant="primary" />
          </div>
          {mini.map((event) => (
            <div key={event.id} className="hidden lg:block">
              <FeaturedCard event={event} variant="mini" />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted">No hay eventos destacados por ahora.</p>
      )}
    </section>
  );
}
