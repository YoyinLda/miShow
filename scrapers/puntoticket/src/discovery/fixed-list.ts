import type { SecondaryIndexSource } from "@mishow/scraper-core";
import { canonicalSourceUrl } from "@mishow/domain";

export interface FixedListSource extends SecondaryIndexSource {
  readonly kind: "fixed-list";
  /** Allowlist exacta: solo las rutas de las URLs canónicas de la lista. */
  isSecondaryPagePath(pathname: string): boolean;
}

/**
 * Fuente de índice basada en una lista fija de URLs. No hace solicitudes de índice.
 * Las URLs inválidas se descartan; las duplicadas se deduplican por forma canónica.
 * Lista vacía → cero páginas y allowlist vacía.
 */
export function createFixedListSource(urls: readonly string[] = []): FixedListSource {
  const canonical: string[] = [];
  const paths = new Set<string>();
  for (const raw of urls) {
    let url: string;
    try {
      url = canonicalSourceUrl(raw, "venue_url");
    } catch {
      continue;
    }
    if (canonical.includes(url)) continue;
    canonical.push(url);
    paths.add(new URL(url).pathname);
  }
  return {
    kind: "fixed-list",
    async list() {
      return [...canonical];
    },
    isSecondaryPagePath: (pathname) => paths.has(pathname),
  };
}
