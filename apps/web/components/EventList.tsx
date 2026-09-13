"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogEvent, CatalogFreshness } from "@mishow/catalog-client";
import { catalogClient, catalogConfigured } from "../lib/catalog";
import { formatRelativeTime } from "../lib/format";
import { EventCard } from "./EventCard";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; events: CatalogEvent[] }
  | { kind: "error"; message: string }
  | { kind: "unconfigured" };

export function EventList() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [search, setSearch] = useState("");
  const [freshness, setFreshness] = useState<CatalogFreshness | undefined>(undefined);

  useEffect(() => {
    if (!catalogConfigured()) {
      setState({ kind: "unconfigured" });
      return;
    }
    let active = true;
    const client = catalogClient();
    client
      .listEvents({ limit: 100 })
      .then((events) => {
        if (active) setState({ kind: "ready", events });
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: "error", message: error instanceof Error ? error.message : "Error al cargar." });
      });
    // La frescura es un adorno: su fallo no debe afectar el listado.
    client
      .getFreshness("puntoticket")
      .then((value) => {
        if (active) setFreshness(value);
      })
      .catch(() => {
        /* silencioso: sin indicador si la frescura no responde */
      });
    return () => {
      active = false;
    };
  }, []);

  const updatedLabel = formatRelativeTime(freshness?.last_run_finished_at);

  const filtered = useMemo(() => {
    if (state.kind !== "ready") return [];
    const term = search.trim().toLowerCase();
    if (!term) return state.events;
    return state.events.filter((event) => {
      const haystack = [event.name, event.artists.map((a) => a.name).join(" "), event.venue?.name ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [state, search]);

  return (
    <section>
      {updatedLabel && freshness?.last_run_finished_at ? (
        <p className="mb-3 text-xs text-neutral-500">
          Catálogo <time dateTime={freshness.last_run_finished_at}>{updatedLabel}</time>
        </p>
      ) : null}

      <label className="block">
        <span className="sr-only">Buscar eventos</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por artista, evento o recinto"
          className="mb-6 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm outline-none focus:border-neutral-500"
          disabled={state.kind !== "ready"}
        />
      </label>

      {state.kind === "loading" ? <p className="text-sm text-neutral-500">Cargando eventos…</p> : null}

      {state.kind === "unconfigured" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          El catálogo no está configurado. Define <code>NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (ver <code>.env.example</code>).
        </p>
      ) : null}

      {state.kind === "error" ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el catálogo: {state.message}
        </p>
      ) : null}

      {state.kind === "ready" && filtered.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {search.trim() ? "No hay eventos que coincidan con la búsqueda." : "Aún no hay eventos en el catálogo."}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {filtered.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}
