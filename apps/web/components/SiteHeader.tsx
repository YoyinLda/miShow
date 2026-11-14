"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "./brand/Logo";
import { ThemeToggle } from "./ThemeToggle";
import { SHOW_EDITORIAL_SECTIONS } from "../lib/sections";

/**
 * Header del sitio fiel al Figma "03 Screens" (Home / Desktop: nodo 3:3;
 * Home / Mobile: nodo 3:124).
 *
 * - Logo: vector miShow / Bloque exportado del Figma (components/brand/Logo),
 *   34px de alto en desktop y 28px en mobile. Enlaza a la Home.
 * - Desktop (lg+): logo, nav "Eventos" / "Escena local" / "Historias" (Medium
 *   14, color texto) y buscador único de 360×44 a la derecha que navega a
 *   /eventos?q=. Sin borde inferior, como en el diseño.
 * - Mobile (< lg): iconos buscar (⌕) y menú (☰). ⌕ navega al catálogo (donde
 *   vive la búsqueda server-side); ☰ abre el menú con los enlaces + tema.
 * - Tema: el Figma no incluye el selector, así que no compite en la barra. En
 *   desktop queda tras un botón compacto que abre un panel; en mobile, dentro
 *   del menú ☰. Sigue siendo accesible por teclado en ambos casos.
 *
 * El corte es lg (1024px) y no sm: el header desktop del Figma necesita
 * ~900px de ancho útil (logo + nav + buscador de 360px).
 */
const NAV = [
  { href: "/eventos", label: "Eventos" },
  ...(SHOW_EDITORIAL_SECTIONS
    ? [
        { href: "/#escena-local", label: "Escena local" },
        { href: "/#historias", label: "Historias" }
      ]
    : [])
];

const ICON_BUTTON =
  "flex min-h-11 min-w-11 items-center justify-center rounded-full hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-focus";

function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cierra con Escape o clic fuera del panel.
  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Cambiar tema"
        aria-expanded={open}
        aria-controls="theme-menu"
        title="Cambiar tema"
        onClick={() => setOpen((value) => !value)}
        className={`${ICON_BUTTON} text-text-muted`}
      >
        <span aria-hidden="true">◐</span>
      </button>
      {open ? (
        <div
          id="theme-menu"
          className="absolute right-0 top-full z-20 mt-2 rounded-xl border border-border bg-surface p-2 shadow-lg"
        >
          <ThemeToggle />
        </div>
      ) : null}
    </div>
  );
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="pt-5 lg:pt-6">
      <div className="flex h-11 items-center gap-4 lg:h-14 lg:gap-7">
        <a href="/" className="shrink-0 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <Logo title="miShow, ir al inicio" className="h-7 w-auto lg:h-[34px]" />
        </a>

        {/* Nav desktop */}
        <nav className="hidden items-center gap-7 text-sm font-medium lg:flex" aria-label="Principal">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="whitespace-nowrap text-text transition hover:text-brand">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Buscador desktop + tema */}
        <div className="hidden items-center gap-2 lg:flex">
          <form role="search" action="/eventos" method="get" className="w-[360px]">
            <label className="block">
              <span className="sr-only">Buscar</span>
              <input
                type="search"
                name="q"
                placeholder="Buscar artista, evento o venue…"
                className="h-11 w-full rounded-[10px] border border-border bg-surface px-4 text-sm text-text outline-none placeholder:text-text-muted focus:border-brand"
              />
            </label>
          </form>
          <ThemeMenu />
        </div>

        {/* Acciones mobile */}
        <div className="flex items-center lg:hidden">
          <a href="/eventos" aria-label="Buscar eventos" className={`${ICON_BUTTON} text-2xl text-text`}>
            <span aria-hidden="true">⌕</span>
          </a>
          <button
            type="button"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
            className={`${ICON_BUTTON} text-xl text-text`}
          >
            <span aria-hidden="true">☰</span>
          </button>
        </div>
      </div>

      {/* Menú mobile desplegable */}
      {menuOpen ? (
        <div id="mobile-menu" className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 lg:hidden">
          <nav className="flex flex-col gap-1 text-sm font-medium" aria-label="Menú">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="py-2 text-text transition hover:text-brand"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <span className="text-sm text-text-muted">Tema</span>
            <ThemeToggle />
          </div>
        </div>
      ) : null}
    </header>
  );
}
