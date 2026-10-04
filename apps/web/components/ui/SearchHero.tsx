"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/**
 * Hero editorial de la Home (Figma): título grande, subtítulo y un buscador
 * "¿Qué quieres ver?". La búsqueda server-side vive en el Catálogo (/eventos),
 * así que al enviar (Enter o blur con texto) navegamos a /eventos?q=<término>
 * en vez de duplicar aquí el listado. `defaultQuery` siembra el input desde
 * `?q=` si llegara con uno.
 *
 * Mobile-first: título a ~2xl/3xl, desktop a 5xl. El input ocupa el ancho.
 */
export function SearchHero({
  title,
  subtitle,
  defaultQuery = "",
  placeholder = "¿Qué quieres ver?"
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  defaultQuery?: string;
  placeholder?: string;
}) {
  const [term, setTerm] = useState(defaultQuery);

  function goToCatalog() {
    const trimmed = term.trim();
    const url = trimmed ? `/eventos?q=${encodeURIComponent(trimmed)}` : "/eventos";
    window.location.href = url;
  }

  return (
    <section className="flex flex-col gap-4 py-2">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{title}</h1>
        {subtitle ? <p className="text-sm text-text-muted sm:text-base">{subtitle}</p> : null}
      </div>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          goToCatalog();
        }}
      >
        <label className="block">
          <span className="sr-only">Buscar eventos</span>
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded-[10px] border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-brand sm:text-base"
          />
        </label>
      </form>
    </section>
  );
}
