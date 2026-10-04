"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { parseRango, type RangoKind } from "../lib/discovery";
import { FilterChips } from "./ui/FilterChips";
import { SearchHero } from "./ui/SearchHero";
import { FeaturedSection } from "./FeaturedSection";
import { UpcomingSection } from "./UpcomingSection";
import { LocalSceneSection } from "./LocalSceneSection";
import { StoriesSection } from "./StoriesSection";

/**
 * Orquestador client-side de la Home. Es el único dueño del estado del rango
 * activo (`?rango=`): lo lee de la URL al montar, lo refleja con
 * `history.replaceState` (sin crear entradas de historial ni recargar) y lo
 * pasa a los chips y a las secciones de datos. Así la lógica de URL/estado vive
 * en un solo lugar y los átomos quedan como presentación.
 *
 * Composición fiel al Figma Home: hero + chips + Destacados + Próximos
 * conciertos + enlace "Ver todos los eventos" (→ /eventos) + Escena local +
 * Historias. El listado completo con scroll infinito vive en /eventos
 * (FEAT-003).
 */
function HomeDiscoveryContent() {
  const searchParams = useSearchParams();
  const [rango, setRango] = useState<RangoKind | null>(() => parseRango(searchParams.get("rango")));
  const initialQuery = searchParams.get("q") ?? "";

  function updateRango(next: RangoKind | null) {
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
  }

  return (
    <div className="flex flex-col gap-10 sm:gap-12">
      <SearchHero
        title="Música en vivo, planes reales"
        subtitle="Conciertos, tocatas, festivales y más."
        defaultQuery={initialQuery}
      />
      <FilterChips value={rango} onChange={updateRango} />
      <FeaturedSection rango={rango} />
      <UpcomingSection rango={rango} />
      <div>
        <a
          href="/eventos"
          className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Ver todos los eventos <span aria-hidden="true">→</span>
        </a>
      </div>
      <LocalSceneSection />
      <StoriesSection />
    </div>
  );
}

export function HomeDiscovery() {
  return (
    <Suspense fallback={<p className="text-sm text-text-muted">Cargando…</p>}>
      <HomeDiscoveryContent />
    </Suspense>
  );
}
