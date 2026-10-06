"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  SOURCE_VALUES,
  STATUS_VALUES,
  activeFilterCount,
  emptyFilters,
  sourceLabel,
  statusLabel,
  type FiltersState,
  type SourceValue,
  type StatusValue
} from "../../lib/filters";

/**
 * Bottom sheet accesible de filtros (Etapa 5). Sin dependencias nuevas ni
 * portal: se monta dentro del flujo y cubre la pantalla con un overlay fijo,
 * compatible con el export estático (`output: export`).
 *
 * Accesibilidad:
 * - `role="dialog"` + `aria-modal="true"` + `aria-labelledby` al título.
 * - Foco atrapado dentro del panel mientras está abierto (Tab/Shift+Tab ciclan).
 * - Cierra con `Esc` y con clic en el overlay. Al cerrar restaura el foco al
 *   disparador (el componente padre conserva la ref del botón "Filtros").
 * - Controles con `aria-checked` (pills tipo checkbox, `role="checkbox"`), área
 *   táctil >=44px y foco visible.
 *
 * Patrón de edición: el sheet mantiene un BORRADOR local (`draft`) inicializado
 * desde `value` al abrir; "Aplicar" confirma (`onApply(draft)`), "Limpiar" vacía
 * el borrador (no cierra), cerrar sin aplicar descarta el borrador. Así el padre
 * solo re-consulta al confirmar.
 *
 * Rótulo "Lugar" para la sección de ciudad (nunca "venue"/"recinto").
 */
export interface FilterSheetProps {
  open: boolean;
  value: FiltersState;
  /** Catálogo de ciudades disponibles (orden ya decidido por el padre). */
  cities: string[];
  onApply: (next: FiltersState) => void;
  onClose: () => void;
}

export function FilterSheet({ open, value, cities, onApply, onClose }: FilterSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<FiltersState>(value);

  // Al abrir, sincroniza el borrador con el valor confirmado actual.
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const toggleSource = useCallback((code: SourceValue) => {
    setDraft((d) => ({
      ...d,
      sources: d.sources.includes(code) ? d.sources.filter((v) => v !== code) : [...d.sources, code]
    }));
  }, []);

  const toggleStatus = useCallback((status: StatusValue) => {
    setDraft((d) => ({
      ...d,
      statuses: d.statuses.includes(status) ? d.statuses.filter((v) => v !== status) : [...d.statuses, status]
    }));
  }, []);

  const toggleCity = useCallback((city: string) => {
    setDraft((d) => ({
      ...d,
      cities: d.cities.includes(city) ? d.cities.filter((v) => v !== city) : [...d.cities, city]
    }));
  }, []);

  // Esc para cerrar + foco inicial al abrir.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "Tab") trapFocus(event, panel);
    };
    document.addEventListener("keydown", onKeyDown, true);
    // Foco inicial al primer control del panel.
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  const draftCount = activeFilterCount(draft);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Overlay: cierra al hacer clic. */}
      <button
        type="button"
        aria-label="Cerrar filtros"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/50"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-xl sm:max-w-md sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-text">
            Filtros
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
            <span className="sr-only">Cerrar</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <Section title="Fuente">
            {SOURCE_VALUES.map((code) => (
              <PillCheckbox
                key={code}
                label={sourceLabel(code)}
                checked={draft.sources.includes(code)}
                onToggle={() => toggleSource(code)}
              />
            ))}
          </Section>

          <Section title="Lugar">
            {cities.length === 0 ? (
              <p className="text-sm text-text-muted">No hay ciudades para filtrar por ahora.</p>
            ) : (
              cities.map((city) => (
                <PillCheckbox
                  key={city}
                  label={city}
                  checked={draft.cities.includes(city)}
                  onToggle={() => toggleCity(city)}
                />
              ))
            )}
          </Section>

          <Section title="Estado">
            {STATUS_VALUES.map((status) => (
              <PillCheckbox
                key={status}
                label={statusLabel(status)}
                checked={draft.statuses.includes(status)}
                onToggle={() => toggleStatus(status)}
              />
            ))}
          </Section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setDraft(emptyFilters())}
            disabled={draftCount === 0}
            className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {draftCount > 0 ? `Aplicar (${draftCount})` : "Aplicar"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-5 last:mb-0">
      <legend className="mb-2 text-sm font-semibold text-text">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function PillCheckbox({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={[
        "inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-medium transition",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        checked
          ? "bg-brand text-brand-contrast"
          : "border border-chip-border bg-surface text-text-muted hover:text-text"
      ].join(" ")}
    >
      {label}
    </button>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Atrapa el foco dentro del panel: en Tab desde el último elemento vuelve al
 * primero y viceversa. Si no hay elementos enfocables, previene salir.
 */
function trapFocus(event: KeyboardEvent, panel: HTMLElement | null): void {
  if (!panel) return;
  const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
  if (nodes.length === 0) {
    event.preventDefault();
    return;
  }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (event.shiftKey) {
    if (active === first || !panel.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last) {
    event.preventDefault();
    first.focus();
  }
}
