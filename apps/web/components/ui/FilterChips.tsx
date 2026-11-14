"use client";

import type { Ref } from "react";
import type { RangoKind } from "../../lib/discovery";

/**
 * Chips de filtro por rango de fecha (Figma FilterChip 2:5, Home 3:2 / 3:123).
 * Solo se exponen chips con respaldo de dato real: Hoy / Semana / Mes / Gratis.
 * Los chips "Santiago" y "Rock" del Figma se omiten a propósito (TL/PO, entrega
 * 2): la ciudad viene por comuna y los eventos no traen género.
 *
 * Rótulos por breakpoint, como en el Figma: desde `lg` "Esta semana" / "Este
 * mes"; en mobile "Semana" / "Mes".
 *
 * `moreFiltersHref` (opcional) agrega el chip "+ Filtros" solo en desktop: es un
 * enlace (p. ej. a /eventos con el panel de filtros abierto), no un toggle.
 *
 * Componente controlado: recibe el `value` activo y notifica con `onChange`. Un
 * clic sobre el chip activo lo desactiva (vuelve a `null`). El padre refleja el
 * valor en la URL (`?rango=`) y re-consulta.
 *
 * Visual: pill 16×10, Medium 14. Activo = fondo brand + texto brand-contrast;
 * inactivo = surface + borde chip-border.
 */
const CHIPS: { value: RangoKind; label: string; desktopLabel?: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Semana", desktopLabel: "Esta semana" },
  { value: "mes", label: "Mes", desktopLabel: "Este mes" },
  { value: "gratis", label: "Gratis" }
];

const BASE =
  "min-h-10 items-center rounded-full px-4 py-2.5 text-sm font-medium leading-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const INACTIVE = "border border-chip-border bg-surface text-text hover:border-brand";

export function FilterChips({
  value,
  onChange,
  moreFiltersHref,
  moreFilters
}: {
  value: RangoKind | null;
  onChange: (next: RangoKind | null) => void;
  moreFiltersHref?: string;
  /** Variante botón del chip "+ Filtros" (desktop): abre el sheet en la misma página. */
  moreFilters?: {
    onOpen: () => void;
    expanded: boolean;
    count: number;
    buttonRef?: Ref<HTMLButtonElement>;
  };
}) {
  return (
    <div role="group" aria-label="Filtrar por" className="flex flex-wrap gap-2 lg:gap-2.5">
      {CHIPS.map((chip) => {
        const active = value === chip.value;
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : chip.value)}
            className={`inline-flex ${BASE} ${active ? "border border-brand bg-brand text-brand-contrast" : INACTIVE}`}
          >
            {chip.desktopLabel ? (
              <>
                <span className="lg:hidden">{chip.label}</span>
                <span className="hidden lg:inline">{chip.desktopLabel}</span>
              </>
            ) : (
              chip.label
            )}
          </button>
        );
      })}
      {moreFiltersHref ? (
        <a href={moreFiltersHref} className={`${BASE} ${INACTIVE} hidden lg:inline-flex`}>
          + Filtros
        </a>
      ) : moreFilters ? (
        <button
          ref={moreFilters.buttonRef}
          type="button"
          onClick={moreFilters.onOpen}
          aria-haspopup="dialog"
          aria-expanded={moreFilters.expanded}
          className={`${BASE} ${INACTIVE} hidden gap-2 lg:inline-flex`}
        >
          + Filtros
          {moreFilters.count > 0 ? (
            <span className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-contrast">
              {moreFilters.count}
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
