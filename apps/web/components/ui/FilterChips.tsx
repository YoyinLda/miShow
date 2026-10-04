"use client";

import type { RangoKind } from "../../lib/discovery";

/**
 * Chips de filtro por rango de fecha (Figma Home). Solo se exponen los 4 chips
 * con respaldo de dato real: Hoy / Semana / Mes / Gratis. Los chips
 * "Santiago", "Rock" y "+Filtros" del Figma se omiten a propósito porque hoy no
 * existe el dato (ciudad/género confiable) para respaldarlos.
 *
 * Es un componente controlado: recibe el `value` activo (leído de `?rango=` por
 * el padre) y notifica cambios con `onChange`. Un clic sobre el chip activo lo
 * desactiva (toggle, vuelve a `null`). El padre es quien refleja el valor en la
 * URL (`?rango=`) y re-consulta; así la lógica de datos/URL vive en un solo
 * lugar y los chips quedan como presentación pura + evento.
 *
 * Visual: pill. Activo = fondo brand + texto brand-contrast; inactivo =
 * surface + borde chip-border.
 */
const CHIPS: { value: RangoKind; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
  { value: "gratis", label: "Gratis" }
];

export function FilterChips({
  value,
  onChange
}: {
  value: RangoKind | null;
  onChange: (next: RangoKind | null) => void;
}) {
  return (
    <div role="group" aria-label="Filtrar por" className="flex flex-wrap gap-2">
      {CHIPS.map((chip) => {
        const active = value === chip.value;
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : chip.value)}
            className={[
              "inline-flex min-h-9 items-center rounded-full px-4 py-1.5 text-sm font-medium transition",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              active
                ? "bg-brand text-brand-contrast"
                : "border border-chip-border bg-surface text-text-muted hover:text-text"
            ].join(" ")}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
