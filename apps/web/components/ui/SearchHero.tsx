"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/**
 * Hero editorial de la Home (Figma Home Mobile 3:123 / Desktop 3:2).
 *
 * - Mobile: título 34 Bold, subtítulo 15 y buscador "¿Qué quieres ver?".
 * - Desktop (`lg`+), si se pasa `desktopTitle`: título 48 Bold y subtítulo 18
 *   propios, SIN buscador (en desktop la búsqueda vive en el header).
 *
 * La búsqueda server-side vive en el Catálogo (/eventos): al enviar navegamos a
 * /eventos?q=<término>. `defaultQuery` siembra el input desde `?q=`.
 */
export function SearchHero({
  title,
  subtitle,
  desktopTitle,
  desktopSubtitle,
  defaultQuery = "",
  placeholder = "¿Qué quieres ver?"
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  desktopTitle?: ReactNode;
  desktopSubtitle?: ReactNode;
  defaultQuery?: string;
  placeholder?: string;
}) {
  const [term, setTerm] = useState(defaultQuery);
  const splitDesktop = desktopTitle !== undefined;

  function goToCatalog() {
    const trimmed = term.trim();
    const url = trimmed ? `/eventos?q=${encodeURIComponent(trimmed)}` : "/eventos";
    window.location.href = url;
  }

  return (
    <section className="flex flex-col gap-5 lg:gap-7">
      <div className="flex flex-col gap-5 lg:gap-7">
        <h1 className="text-[2.125rem] font-bold leading-tight tracking-tight lg:text-5xl">
          {splitDesktop ? (
            <>
              <span className="lg:hidden">{title}</span>
              <span className="hidden lg:inline">{desktopTitle}</span>
            </>
          ) : (
            title
          )}
        </h1>
        {splitDesktop ? (
          <>
            {subtitle ? <p className="text-[0.9375rem] text-text-muted lg:hidden">{subtitle}</p> : null}
            {desktopSubtitle ? <p className="hidden text-lg text-text-muted lg:block">{desktopSubtitle}</p> : null}
          </>
        ) : subtitle ? (
          <p className="text-[0.9375rem] text-text-muted lg:text-lg">{subtitle}</p>
        ) : null}
      </div>
      <form
        role="search"
        className={splitDesktop ? "lg:hidden" : undefined}
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
            className="h-[46px] w-full rounded-[10px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-brand"
          />
        </label>
      </form>
    </section>
  );
}
