"use client";

import { useEffect, useState } from "react";
import type { CatalogEvent } from "@mishow/catalog-client";
import { catalogClient, catalogConfigured } from "../lib/catalog";
import { formatDate, formatPrice, performanceStatusLabel, sourceLinks, statusLabel } from "../lib/format";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; event: CatalogEvent }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "unconfigured" };

/**
 * Detalle de evento. Acepta `slug` (ruta `/evento/[slug]`) o, por
 * compatibilidad de enlaces antiguos, `id` (ruta `/evento?id=`).
 */
export function EventDetail({ slug, id }: { slug?: string; id?: number }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (!slug && (id == null || Number.isNaN(id))) {
      setState({ kind: "not-found" });
      return;
    }
    if (!catalogConfigured()) {
      setState({ kind: "unconfigured" });
      return;
    }
    let active = true;
    const client = catalogClient();
    const load = slug ? client.getEventBySlug(slug) : client.getEvent(id as number);
    load
      .then((event) => {
        if (!active) return;
        setState(event ? { kind: "ready", event } : { kind: "not-found" });
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: "error", message: error instanceof Error ? error.message : "Error al cargar." });
      });
    return () => {
      active = false;
    };
  }, [slug, id]);

  if (state.kind === "loading") return <p className="text-sm text-text-muted">Cargando evento…</p>;
  if (state.kind === "unconfigured")
    return <p className="text-sm text-warning">El catálogo no está configurado.</p>;
  if (state.kind === "error")
    return <p className="text-sm text-danger">No se pudo cargar el evento: {state.message}</p>;
  if (state.kind === "not-found")
    return (
      <div className="text-sm text-text-muted">
        <p>No se encontró el evento.</p>
        <a href="/" className="mt-2 inline-block text-brand underline">
          Volver al listado
        </a>
      </div>
    );

  const { event } = state;
  const price = formatPrice(event.sources);
  const links = sourceLinks(event.sources);

  return (
    <article>
      <a href="/" className="text-sm text-text-muted underline">
        ← Volver
      </a>

      {event.image_url ? (
        <img src={event.image_url} alt="" className="mt-4 max-h-72 w-full rounded-lg object-cover" />
      ) : null}

      <h1 className="mt-4 text-2xl font-bold">{event.name}</h1>
      {event.artists.length ? (
        <p className="mt-1 text-text-muted">
          {event.artists.map((artist, index) => (
            <span key={`${artist.slug ?? artist.name}-${index}`}>
              {index > 0 ? ", " : ""}
              {artist.slug ? (
                <a href={`/artistas?slug=${encodeURIComponent(artist.slug)}`} className="underline hover:text-brand">
                  {artist.name}
                </a>
              ) : (
                artist.name
              )}
            </span>
          ))}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-text-muted">{statusLabel(event.status)}</span>
        {price ? <span className="font-medium">{price}</span> : null}
      </div>

      {event.venue?.name ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Recinto</h2>
          <p className="mt-1">
            {event.venue.slug ? (
              <a href={`/venues?slug=${encodeURIComponent(event.venue.slug)}`} className="underline hover:text-brand">
                {event.venue.name}
              </a>
            ) : (
              event.venue.name
            )}
          </p>
          {event.venue.address || event.venue.city ? (
            <p className="text-sm text-text-muted">
              {[event.venue.address, event.venue.city].filter(Boolean).join(", ")}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Funciones</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {event.performances.map((performance, index) => {
            const performanceStatus = performanceStatusLabel(performance.status);
            return (
              <li
                key={`${performance.starts_at}-${index}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium">{formatDate(performance.starts_at, { timeKnown: performance.time_known ?? true }) ?? performance.starts_at}</span>
                  {performanceStatus ? <span className="ml-2 text-text-muted">{performanceStatus}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Enlace único o por fuente hacia la(s) ticketera(s). No somos la fuente de
          verdad de la disponibilidad; la compra se completa en la ticketera. */}
      {links.length ? (
        <section className="mt-6">
          {event.sources.length > 1 ? (
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">Disponible en</h2>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-brand-contrast focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
