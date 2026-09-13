"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CatalogEvent } from "@mishow/catalog-client";
import { catalogClient, catalogConfigured } from "../lib/catalog";
import { formatDate, formatPrice, statusLabel } from "../lib/format";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; event: CatalogEvent }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "unconfigured" };

export function EventDetail() {
  const params = useSearchParams();
  const idParam = params.get("id");
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    const id = Number(idParam);
    if (!idParam || Number.isNaN(id)) {
      setState({ kind: "not-found" });
      return;
    }
    if (!catalogConfigured()) {
      setState({ kind: "unconfigured" });
      return;
    }
    let active = true;
    catalogClient()
      .getEvent(id)
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
  }, [idParam]);

  if (state.kind === "loading") return <p className="text-sm text-neutral-500">Cargando evento…</p>;
  if (state.kind === "unconfigured")
    return <p className="text-sm text-amber-700">El catálogo no está configurado.</p>;
  if (state.kind === "error")
    return <p className="text-sm text-red-700">No se pudo cargar el evento: {state.message}</p>;
  if (state.kind === "not-found")
    return (
      <div className="text-sm text-neutral-600">
        <p>No se encontró el evento.</p>
        <a href="/" className="mt-2 inline-block text-neutral-900 underline">
          Volver al listado
        </a>
      </div>
    );

  const { event } = state;
  const price = formatPrice(event);
  const artists = event.artists.map((artist) => artist.name).join(", ");

  return (
    <article>
      <a href="/" className="text-sm text-neutral-500 underline">
        ← Volver
      </a>

      {event.image_url ? (
        <img src={event.image_url} alt="" className="mt-4 max-h-72 w-full rounded-lg object-cover" />
      ) : null}

      <h1 className="mt-4 text-2xl font-bold">{event.name}</h1>
      {artists ? <p className="mt-1 text-neutral-600">{artists}</p> : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">{statusLabel(event.status)}</span>
        {price ? <span className="font-medium">{price}</span> : null}
      </div>

      {event.venue?.name ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Recinto</h2>
          <p className="mt-1">{event.venue.name}</p>
          {event.venue.address || event.venue.city ? (
            <p className="text-sm text-neutral-500">
              {[event.venue.address, event.venue.city].filter(Boolean).join(", ")}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Funciones</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {event.performances.map((performance, index) => (
            <li
              key={`${performance.starts_at}-${index}`}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm"
            >
              <div>
                <span className="font-medium">{formatDate(performance.starts_at) ?? performance.starts_at}</span>
                <span className="ml-2 text-neutral-500">{statusLabel(performance.status)}</span>
              </div>
              {performance.purchase_url ? (
                <a
                  href={performance.purchase_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white"
                >
                  Comprar
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {event.purchase_url ? (
        <a
          href={event.purchase_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-6 inline-block text-sm text-neutral-500 underline"
        >
          Ver en {event.source}
        </a>
      ) : null}
    </article>
  );
}
