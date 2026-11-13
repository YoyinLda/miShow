import { describe, expect, it } from "vitest";
import type { RawEventReference } from "@mishow/domain";
import { parseVenuePage } from "../src/extraction/venue.js";
import { createPrng, runIterations, type Prng } from "./helpers/prng.js";

const ORIGIN = "https://www.puntoticket.com";
const VENUE_URL = `${ORIGIN}/recintos/teatro-test`;
const SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const WORDS = ["Rock", "Ñandú", "Café", "Día", "Festival", "O'Neil", "\"Live\"", "A&B", "<Tour>", "東京", "2026", "Noche"];

function slug(prng: Prng): string {
  const len = prng.int(3, 12);
  let s = "";
  for (let i = 0; i < len; i++) s += SLUG_CHARS[prng.int(0, SLUG_CHARS.length - 1)];
  return s;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function title(prng: Prng): string {
  const n = prng.int(1, 4);
  return Array.from({ length: n }, () => prng.pick(WORDS)).join(" ");
}

function href(prng: Prng, canonical: string): string {
  const path = canonical.slice(ORIGIN.length);
  const query = prng.bool(0.4) ? `?utm_source=${slug(prng)}&x=${prng.int(1, 99)}` : "";
  const fragment = prng.bool(0.3) ? `#${slug(prng)}` : "";
  const slash = prng.bool(0.2) ? "/" : "";
  const form = prng.int(0, 2);
  const base = form === 0 ? canonical : form === 1 ? path : `//www.puntoticket.com${path}`;
  return `${base}${slash}${query}${fragment}`;
}

function card(prng: Prng, ref: RawEventReference): string {
  const link = href(prng, ref.source_url);
  const heading = ref.title ? `<h3>${escapeHtml(ref.title)}</h3>` : "";
  return `<article class="filtr-item event-item"><a href="${escapeHtml(link)}">${heading}<span>Ver</span></a></article>`;
}

function foreignLink(prng: Prng): string {
  const options = [
    `<a href="https://example.com/evento/${slug(prng)}">ajeno</a>`,
    `<a href="https://tickets.otro.cl/evento/${slug(prng)}">ajeno</a>`,
    `<a href="/musica">Música</a>`,
    `<a href="/recintos/${slug(prng)}">Otro recinto</a>`,
    `<a href="/contacto">Contacto</a>`,
    `<a href="mailto:info@puntoticket.com">Mail</a>`,
    `<a href="/">Inicio</a>`,
  ];
  return prng.pick(options);
}

describe("Feature: puntoticket-venue-discovery — render → parse de venue", () => {
  it("Property 2: ida y vuelta render → parse de la página de venue (≥100 iteraciones)", async () => {
    // Feature: puntoticket-venue-discovery, Property 2: Ida y vuelta render → parse de la página de venue
    // **Validates: Requirements 1.2, 1.3, 9.1, 9.3, 9.4**
    await runIterations(150, 20260702, (prng) => {
      const count = prng.int(0, 12);
      const slugs = new Set<string>();
      while (slugs.size < count) slugs.add(slug(prng));
      const refs: RawEventReference[] = [...slugs].map((s) => {
        const t = prng.bool(0.8) ? title(prng) : undefined;
        return t ? { source_url: `${ORIGIN}/evento/${s}`, title: t } : { source_url: `${ORIGIN}/evento/${s}` };
      });

      const parts: string[] = [];
      for (const ref of refs) {
        while (prng.bool(0.4)) parts.push(foreignLink(prng));
        parts.push(card(prng, ref));
        // Duplicados posteriores (variante de consulta/fragmento) de la misma referencia.
        while (prng.bool(0.3)) parts.push(card(prng, ref));
      }
      while (prng.bool(0.4)) parts.push(foreignLink(prng));

      const html = `<html><body><main>${parts.join("\n")}</main></body></html>`;
      expect(parseVenuePage(html, VENUE_URL)).toEqual(refs);
    });
  });

  it("el generador es determinista por semilla", () => {
    expect(createPrng(1).next()).toBe(createPrng(1).next());
  });
});
