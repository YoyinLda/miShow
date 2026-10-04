// Lógica pura del sistema de tema. Sin acceso al DOM: recibe storage y
// prefersDark por parámetro para ser testeable sin JSDOM.

export type ThemeChoice = "light" | "dark" | "system";

export const STORAGE_KEY = "mishow-theme";

export function isValidChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

// Resuelve la elección a un tema concreto. 'system' depende de prefersDark;
// cualquier valor no reconocido se trata como 'system'.
export function resolveTheme(choice: unknown, prefersDark: boolean): "light" | "dark" {
  if (choice === "light" || choice === "dark") {
    return choice;
  }
  return prefersDark ? "dark" : "light";
}

// Lee la elección guardada. Ante ausencia de storage, excepción o valor
// inválido devuelve 'system'.
export function readStoredChoice(storage?: Pick<Storage, "getItem">): ThemeChoice {
  if (!storage) {
    return "system";
  }
  try {
    const stored = storage.getItem(STORAGE_KEY);
    return isValidChoice(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

// Persiste la elección. No lanza si storage no existe o está lleno.
export function writeStoredChoice(choice: ThemeChoice, storage?: Pick<Storage, "setItem">): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, choice);
  } catch {
    // Silencioso: localStorage lleno o deshabilitado no debe romper la UI.
  }
}
