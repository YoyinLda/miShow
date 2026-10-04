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

  if (state.kind === "loading") return <p className="text-sm text-neutral-500">Cargando recinto…</p>;
  if (state.kind === "unconfigured") return <p className="text-sm text-amber-700">El catálogo no está configurado.</p>;
  if (state.kind === "error") return <p className="text-sm text-red-700">No se pudo cargar el recinto: {state.message}</p>;
  if (state.kind === "not-found")
    return (
      <div className="text-sm text-neutral-600">
        <p>No se encontró el recinto.</p>
        <a href="/" className="mt-2 inline-block text-neutral-900 underline">Volver al listado</a>
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
      <a href="/" className="text-sm text-neutral-500 underline">← Volver</a>

      <h1 className="mt-4 text-2xl font-bold">{venue.name}</h1>
      {locationParts.length ? <p className="mt-1 text-neutral-600">{locationParts.join(", ")}</p> : null}
      {venue.capacity ? <p className="text-sm text-neutral-500">Capacidad aprox.: {venue.capacity}</p> : null}
      {mapsUrl ? (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block text-sm text-neutral-600 underline">
          Ver ubicación en el mapa
        </a>
      ) : null}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Próximos eventos</h2>
        {venue.events.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No hay eventos publicados en este recinto.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {venue.events.map((event) => (
              <li key={event.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm">
                <a href={`/evento?slug=${encodeURIComponent(event.slug)}`} className="font-medium underline hover:text-neutral-900">
                  {event.name}
                </a>
                <div className="text-neutral-500">
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
