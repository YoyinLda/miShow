"use client";

import { useEffect, useState } from "react";
import type { CatalogArtist } from "@mishow/catalog-client";
import { catalogClient, catalogConfigured } from "../lib/catalog";
import { formatDate } from "../lib/format";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; artist: CatalogArtist }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "unconfigured" };

export function ArtistDetail({ slug }: { slug?: string }) {
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
      .getArtistBySlug(slug)
      .then((artist) => {
        if (!active) return;
        setState(artist ? { kind: "ready", artist } : { kind: "not-found" });
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: "error", message: error instanceof Error ? error.message : "Error al cargar." });
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (state.kind === "loading") return <p className="text-sm text-text-muted">Cargando artista…</p>;
  if (state.kind === "unconfigured") return <p className="text-sm text-warning">El catálogo no está configurado.</p>;
  if (state.kind === "error") return <p className="text-sm text-danger">No se pudo cargar el artista: {state.message}</p>;
  if (state.kind === "not-found")
    return (
      <div className="text-sm text-text-muted">
        <p>No se encontró el artista.</p>
        <a href="/" className="mt-2 inline-block text-brand underline">Volver al listado</a>
      </div>
    );

  const { artist } = state;
  const links = Object.entries(artist.links ?? {}).filter(([, url]) => Boolean(url));

  return (
    <article>
      <a href="/" className="text-sm text-text-muted underline">← Volver</a>

      <div className="mt-4 flex items-center gap-4">
        {artist.image_url ? (
          <img src={artist.image_url} alt="" className="h-24 w-24 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="h-24 w-24 shrink-0 rounded-full bg-surface-2" aria-hidden="true" />
        )}
        <div>
          <h1 className="text-2xl font-bold">{artist.name}</h1>
          {[artist.genre, artist.city, artist.country].filter(Boolean).length ? (
            <p className="text-sm text-text-muted">
              {[artist.genre, artist.city, artist.country].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>

      {artist.description ? <p className="mt-4 text-text">{artist.description}</p> : null}

      {links.length ? (
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {links.map(([key, url]) => (
            <a key={key} href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand underline hover:text-brand">
              {key}
            </a>
          ))}
        </div>
      ) : null}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Próximos eventos</h2>
        {artist.events.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">No hay eventos publicados para este artista.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {artist.events.map((event) => (
              <li key={event.id} className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
                <a href={`/evento?slug=${encodeURIComponent(event.slug)}`} className="font-medium underline hover:text-brand">
                  {event.name}
                </a>
                <div className="text-text-muted">
                  {formatDate(event.next_at) ?? "Fecha por confirmar"}
                  {event.venue_name ? ` · ${event.venue_name}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
