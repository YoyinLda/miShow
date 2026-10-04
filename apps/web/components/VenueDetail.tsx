"use client";

import { useEffect, useState } from "react";
import type { CatalogVenue } from "@mishow/catalog-client";
import { catalogClient, catalogConfigured } from "../lib/catalog";
import { formatDate } from "../lib/format";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; venue: CatalogVenue }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "unconfigured" };

export function VenueDetail({ slug }: { slug?: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (!slug) {
      setState({ kind: "not-found" });
      return;
    }
    if (!catalogConfigured()) {
      setState({ kind: "unconfigured" });
      return;
    }
    let active = true;
    catalogClient()
      .getVenueBySlug(slug)
      .then((venue) => {
        if (!active) return;
        setState(venue ? { kind: "ready", venue } : { kind: "not-found" });
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: "error", message: error instanceof Error ? error.message : "Error al cargar." });
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (state.kind === "loading") return <p className="text-sm text-text-muted">Cargando recinto…</p>;
  if (state.kind === "unconfigured") return <p className="text-sm text-warning">El catálogo no está configurado.</p>;
  if (state.kind === "error") return <p className="text-sm text-danger">No se pudo cargar el recinto: {state.message}</p>;
  if (state.kind === "not-found")
    return (
      <div className="text-sm text-text-muted">
        <p>No se encontró el recinto.</p>
        <a href="/" className="mt-2 inline-block text-brand underline">Volver al listado</a>
      </div>
    );

  const { venue } = state;
  const locationParts = [venue.address, venue.city].filter(Boolean);
  const mapsUrl =
    venue.latitude != null && venue.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`
      : locationParts.length
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([venue.name, ...locationParts].join(", "))}`
        : undefined;

  return (
    <article>
      <a href="/" className="text-sm text-text-muted underline underline-offset-2 hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">← Volver</a>

      <h1 className="mt-6 text-4xl font-bold leading-tight sm:text-5xl">{venue.name}</h1>
      {locationParts.length ? <p className="mt-2 text-base text-text-muted">{locationParts.join(", ")}</p> : null}
      {venue.capacity ? <p className="mt-1 text-sm text-text-muted">Capacidad aprox.: {venue.capacity}</p> : null}
      {mapsUrl ? (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-block text-sm text-brand underline underline-offset-2 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          Ver ubicación en el mapa
        </a>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Próximos eventos</h2>
        {venue.events.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">No hay eventos publicados en este recinto.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {venue.events.map((event) => (
              <li key={event.id} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm transition-colors hover:border-brand">
                <a href={`/evento?slug=${encodeURIComponent(event.slug)}`} className="font-medium underline underline-offset-2 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  {event.name}
                </a>
                <div className="mt-1 text-text-muted">
                  {formatDate(event.next_at) ?? "Fecha por confirmar"}
                  {event.artists && event.artists.length ? ` · ${event.artists.map((a) => a.name).join(", ")}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
