"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogEvent } from "@mishow/catalog-client";
import { catalogClient, catalogConfigured } from "../lib/catalog";
import { dateRange, isFree, selectFeatured, type RangoKind } from "../lib/discovery";
import { SectionHeader } from "./ui/SectionHeader";
import { EventRow } from "./ui/EventRow";

/**
 * Sección "Próximos conciertos" de la Home. Renderiza una lista corta de
 * EventRow con los próximos eventos por `next_performance_at` ascendente,
 * respetando el rango activo (`?rango=`). El listado completo con scroll
 * infinito vive en /eventos (FEAT-003); aquí solo mostramos un avance.
 *
 * Chip "gratis": no es filtrable server-side (price_min vive en sources jsonb),
 * así que se aplica como post-filtro cliente con `isFree` sobre la página ya
 * cargada. Si no hay eventos gratis, se muestra un estado vacío honesto.
 */
const PREVIEW_COUNT = 4;
const FETCH_LIMIT = 20;

export function UpcomingSection({ rango }: { rango: RangoKind | null }) {
  const [events, setEvents] = useState<CatalogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!catalogConfigured()) {
      setLoading(false);
      return;
    }
    const token = ++tokenRef.current;
    setLoading(true);
    setError(false);
    const range = rango === "hoy" || rango === "semana" || rango === "mes" ? dateRange(rango) : undefined;
    catalogClient()
      .listEvents({ limit: FETCH_LIMIT, range })
      .then((result) => {
        if (token !== tokenRef.current) return;
        const byProximity = selectFeatured(result.items, result.items.length);
        const filtered = rango === "gratis" ? byProximity.filter((e) => isFree(e.sources)) : byProximity;
        setEvents(filtered.slice(0, PREVIEW_COUNT));
      })
      .catch(() => {
        if (token !== tokenRef.current) return;
        setError(true);
      })
      .finally(() => {
        if (token !== tokenRef.current) return;
        setLoading(false);
      });
  }, [rango]);

  if (!catalogConfigured()) return null;

  return (
    <section>
      <SectionHeader title="Próximos conciertos" />
      {loading && events.length === 0 ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-surface-event" aria-hidden="true" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-text-muted">No se pudieron cargar los eventos.</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-text-muted">
          {rango === "gratis"
            ? "No hay eventos gratuitos por ahora."
            : "No hay próximos eventos para este filtro."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </section>
  );
}
