/**
 * Propiedad 3 (spec puntoticket-venue-discovery, tarea 7.7).
 * PRNG con semilla fija (el repo no incluye fast-check).
 *
 * **Validates: Requirements 9.1, 9.2**
 */
import { describe, expect, it } from "vitest";
import { canonicalSourceUrl } from "@mishow/domain";
import { parseVenuePage } from "../src/extraction/venue.js";
import { runIterations, type Prng } from "./helpers/prng.js";

const PAGE_URL = "https://www.puntoticket.com/recintos/teatro-test";
const BASE = "https://www.puntoticket.com";

/** Cada plantilla de enlace inseguro lleva el marcador `bad-<n>` en la URL. */
const UNSAFE: Array<(n: number) => string> = [
  (n) => `https://otro-host.example.com/evento/bad-${n}`,
  (n) => `https://www.puntoticket.com.evil.test/evento/bad-${n}`,
  (n) => `//ticketmaster.cl/evento/bad-${n}`,
  (n) => `https://user:pass@www.puntoticket.com/evento/bad-${n}`,
  (n) => `https://user@www.puntoticket.com/evento/bad-${n}`,
  (n) => ` ${BASE}/evento/bad-${n}`,
  (n) => `${BASE}/evento/bad-${n} `,
  (n) => `${BASE}/evento/bad-${n}\n`,
  (n) => `http://www.puntoticket.com/evento/bad-${n}`,
  (n) => `ftp://www.puntoticket.com/evento/bad-${n}`,
  (n) => `${BASE}/queue/enqueue/bad-${n}`,
  (n) => `${BASE}/carrito/bad-${n}`,
  (n) => `${BASE}/login/bad-${n}`,
  (n) => `${BASE}/registro/bad-${n}`,
  (n) => `/queue/enqueue/bad-${n}`,
  (n) => `/carrito/bad-${n}`,
];

const SAFE: Array<(slug: string, suffix: string) => string> = [
  (s, x) => `${BASE}/evento/${s}${x}`,
  (s, x) => `/evento/${s}${x}`,
  (s, x) => `evento/${s}${x}`,
  (s, x) => `${BASE}/evento/${s}/${x}`,
  (s, x) => `HTTPS://WWW.PUNTOTICKET.COM/evento/${s}${x}`,
];

const SUFFIXES = ["", "?utm=1", "#frag", "?a=b#c"];

function buildHtml(prng: Prng): string {
  const parts: string[] = [];
  const total = prng.int(1, 25);
  for (let k = 0; k < total; k++) {
    let href: string;
    if (prng.bool(0.5)) {
      href = prng.pick(UNSAFE)(prng.int(0, 5));
    } else {
      // Slugs repetidos a propósito para ejercitar el dedupe.
      href = prng.pick(SAFE)(`ok-${prng.int(0, 6)}`, prng.pick(SUFFIXES));
    }
    const escaped = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const inner = prng.bool(0.5) ? `<h3>Evento ${k}</h3>` : `Evento ${k}`;
    parts.push(prng.bool(0.5)
      ? `<article class="event-item"><a href="${escaped}">${inner}</a></article>`
      : `<a href="${escaped}">${inner}</a>`);
  }
  return `<html><body><main>${parts.join("\n")}</main></body></html>`;
}

describe("Property 3: el parser de venue solo emite referencias seguras", () => {
  // Feature: puntoticket-venue-discovery, Property 3: El parser de venue solo emite referencias seguras
  it("no emite enlaces inseguros, no repite y emite URLs canónicas (>=100 iteraciones)", async () => {
    await runIterations(150, 0x7a7e0003, (prng) => {
      const refs = parseVenuePage(buildHtml(prng), PAGE_URL);
      const urls = refs.map((r) => r.source_url);

      expect(new Set(urls).size).toBe(urls.length);
      for (const url of urls) {
        expect(url).not.toContain("bad-");
        expect(canonicalSourceUrl(url)).toBe(url);
        const parsed = new URL(url);
        expect(parsed.protocol).toBe("https:");
        expect(parsed.hostname).toBe("www.puntoticket.com");
        expect(parsed.username).toBe("");
        expect(parsed.password).toBe("");
        expect(parsed.pathname).not.toMatch(/^\/(?:queue|carrito|login|registro)(?:\/|$)/i);
      }
    });
  });
});
