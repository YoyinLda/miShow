"use client";

import { activeFilterChips, hasActiveFilters, type FiltersState } from "../../lib/filters";

/**
 * Resumen de filtros activos sobre la lista (Etapa 5): un chip por valor
 * seleccionado con botón "quitar" individual, más "Limpiar todo". Presentación
 * pura + eventos (como `FilterChips`); el padre refleja el cambio en la URL y
 * re-consulta. El conteo total con `aria-live` lo maneja `EventList`.
 *
 * Si no hay filtros activos, no renderiza nada.
 */
export function ActiveFilterChips({
  value,
  onRemove,
  onClearAll
}: {
  value: FiltersState;
  onRemove: (facet: keyof FiltersState, chipValue: string) => void;
  onClearAll: () => void;
}) {
  if (!hasActiveFilters(value)) return null;
  const chips = activeFilterChips(value);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Filtros activos">
      {chips.map((chip) => (
        <button
          key={`${chip.facet}:${chip.value}`}
          type="button"
          onClick={() => onRemove(chip.facet, chip.value)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-chip-border bg-surface px-3 py-1.5 text-sm font-medium text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span>{chip.label}</span>
          <span aria-hidden="true" className="text-base leading-none text-text-muted">
            ×
          </span>
          <span className="sr-only">Quitar filtro {chip.label}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="inline-flex min-h-9 items-center rounded-full px-3 py-1.5 text-sm font-medium text-text-muted underline underline-offset-2 hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        Limpiar todo
      </button>
    </div>
  );
}
