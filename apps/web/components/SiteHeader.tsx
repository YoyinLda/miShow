"use client";

import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Header del sitio fiel al Figma Home (header/footer).
 *
 * - Wordmark "miShow" ("mi" en brand, "Show" en texto): NO se rediseña el
 *   logo, solo se recolorea con tokens. Enlaza a la Home.
 * - Desktop (sm+): nav "Eventos" (→/eventos), "Escena local" y "Historias"
 *   (anclas a las secciones de la Home) + buscador que navega a /eventos?q=.
 * - Mobile: iconos buscar (⌕) y menú (☰). Decisiones pragmáticas: ⌕ navega al
 *   catálogo (donde vive la búsqueda server-side); ☰ abre un menú simple con
 *   los mismos enlaces + el ThemeToggle (3 modos). El ThemeToggle se mantiene
 *   accesible en ambos tamaños.
 */
const NAV = [
  { href: "/eventos", label: "Eventos" },
  { href: "/#escena-local", label: "Escena local" },
  { href: "/#historias", label: "Historias" }
];

function Wordmark() {
  return (
    <a href="/" className="text-2xl font-bold tracking-tight" aria-label="miShow, ir al inicio">
      <span className="text-brand">mi</span>
      <span className="text-text">Show</span>
    </a>
  );
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-b border-border">
      <div className="flex items-center justify-between gap-4 py-4">
        <Wordmark />

        {/* Nav desktop */}
        <nav className="hidden items-center gap-6 text-sm sm:flex" aria-label="Principal">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="text-text-muted transition hover:text-text">
              {item.label}
            </a>
          ))}
        </nav>

        {/* Buscador desktop + tema */}
        <div className="hidden items-center gap-3 sm:flex">
          <form role="search" action="/eventos" method="get" className="w-56">
            <label className="block">
              <span className="sr-only">Buscar</span>
              <input
                type="search"
                name="q"
                placeholder="Buscar artista, evento o venue…"
                className="w-full rounded-full border border-border bg-surface px-4 py-1.5 text-sm outline-none focus:border-brand"
              />
            </label>
          </form>
          <ThemeToggle />
        </div>

        {/* Acciones mobile */}
        <div className="flex items-center gap-1 sm:hidden">
          <a
            href="/eventos"
            aria-label="Buscar eventos"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg text-text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span aria-hidden="true">⌕</span>
          </a>
          <button
            type="button"
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg text-text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span aria-hidden="true">☰</span>
          </button>
        </div>
      </div>

      {/* Menú mobile desplegable */}
      {menuOpen ? (
        <div className="flex flex-col gap-3 border-t border-border py-4 sm:hidden">
          <nav className="flex flex-col gap-2 text-sm" aria-label="Menú">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="py-1 text-text-muted transition hover:text-text"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      ) : null}
    </header>
  );
}
