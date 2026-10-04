"use client";

import { useEffect, useState } from "react";
import { readStoredChoice, writeStoredChoice, type ThemeChoice } from "../lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: "light", label: "Tema claro", icon: "☀" },
  { value: "dark", label: "Tema oscuro", icon: "☾" },
  { value: "system", label: "Tema del sistema", icon: "◐" }
];

// Aplica/quita el atributo data-theme en <html> en vivo.
function applyChoice(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "light" || choice === "dark") {
    root.setAttribute("data-theme", choice);
  } else {
    root.removeAttribute("data-theme");
  }
}

export function ThemeToggle() {
  // Render inicial estable para evitar mismatch de hidratación: 'system' hasta
  // que montamos y leemos la elección real.
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setChoice(readStoredChoice(window.localStorage));
    setMounted(true);
  }, []);

  // Mientras el modo es 'system', reflejar cambios del esquema del SO. El
  // script anti-flash y el CSS ya resuelven el color; esto mantiene coherencia
  // si el usuario cambia el tema del SO con la pestaña abierta.
  useEffect(() => {
    if (!mounted || choice !== "system") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyChoice("system");
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [mounted, choice]);

  function select(next: ThemeChoice) {
    setChoice(next);
    writeStoredChoice(next, window.localStorage);
    applyChoice(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5"
    >
      {OPTIONS.map((option) => {
        const active = mounted && choice === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => select(option.value)}
            className={[
              "flex min-h-11 min-w-11 items-center justify-center rounded-full text-base",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              active ? "bg-brand text-brand-contrast" : "text-text-muted hover:text-text"
            ].join(" ")}
          >
            <span aria-hidden="true">{option.icon}</span>
          </button>
        );
      })}
    </div>
  );
}
