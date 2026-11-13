/**
 * Propiedad 9 (spec puntoticket-venue-discovery, tarea 7.8).
 * PRNG con semilla fija (el repo no incluye fast-check).
 *
 * **Validates: Requirements 5.1, 5.2, 5.5, 10.4**
 */
import { describe, expect, it } from "vitest";
import { HttpClient } from "@mishow/scraper-core";
import type { HttpTransport } from "../src/acquisition/http.js";
import { scrapePuntoTicket } from "../src/acquisition/orchestrator.js";
import { createPuntoticketAdapter } from "../src/adapter.js";
import { createFixedListSource } from "../src/discovery/fixed-list.js";
import { runIterations, type Prng } from "./helpers/prng.js";

const BASE = "https://www.puntoticket.com";
const LISTING = `${BASE}/musica`;
const VALID_PAGE = `${BASE}/recintos/teatro-test`;

/** Cada plantilla lleva el marcador `bad-<n>` para identificar solicitudes indebidas. */
const INVALID: Array<(n: number) => string> = [
  (n) => `http://www.puntoticket.com/recintos/bad-${n}`,
  (n) => `https://otro-host.example.com/recintos/bad-${n}`,
  (n) => `https://www.puntoticket.com.evil.test/recintos/bad-${n}`,
  (n) => `https://user:pass@www.puntoticket.com/recintos/bad-${n}`,
  (n) => `https://user@www.puntoticket.com/recintos/bad-${n}`,
  (n) => `https://www.puntoticket.com:8443/recintos/bad-${n}`,
  (n) => `https://www.puntoticket.com:80/recintos/bad-${n}`,
  (n) => ` ${BASE}/recintos/bad-${n}`,
  (n) => `${BASE}/recintos/bad-${n}\n`,
  (n) => `\t${BASE}/recintos/bad-${n}`,
  (n) => `${BASE}/queue/enqueue/bad-${n}`,
  (n) => `${BASE}/carrito/bad-${n}`,
  (n) => `${BASE}/login/bad-${n}`,
  (n) => `${BASE}/comprar/evento/bad-${n}/cal/1`,
  (n) => `${BASE}/%71ueue/enqueue/bad-${n}`,
  // Válida pero fuera de la allowlist exacta.
  (n) => `${BASE}/recintos/bad-${n}`,
  (n) => `${BASE}/otra-ruta/bad-${n}`,
];

function buildCase(prng: Prng): { candidates: string[]; invalidCount: number } {
  const candidates: string[] = [];
  const invalidCount = prng.int(1, 10);
  for (let k = 0; k < invalidCount; k++) candidates.push(prng.pick(INVALID)(k));
  if (prng.bool(0.7)) candidates.splice(prng.int(0, candidates.length), 0, VALID_PAGE);
  return { candidates, invalidCount };
}

describe("Property 9: la política de URL impide solicitudes inválidas", () => {
  // Feature: puntoticket-venue-discovery, Property 9: La política de URL impide solicitudes inválidas
  it("no emite solicitudes a URLs de venue inválidas y registra url_rejected (>=100 iteraciones)", async () => {
    await runIterations(150, 0x7a7e0009, async (prng) => {
      const { candidates, invalidCount } = buildCase(prng);

      // La allowlist exacta viene de la lista fija (solo la página válida y las rutas bloqueadas
      // que canonicaliza); `list` devuelve las URLs crudas para que la política las evalúe.
      const fixed = createFixedListSource([
        VALID_PAGE,
        ...candidates.filter((c) => /\/(?:queue|carrito|login|comprar|%71ueue)\//.test(c)),
      ]);
      const venueIndex = {
        kind: "fixed-list" as const,
        list: async () => candidates,
        isSecondaryPagePath: (pathname: string) => fixed.isSecondaryPagePath(pathname),
      };
      const adapter = createPuntoticketAdapter({ venueIndex });

      const requests: string[] = [];
      const transport: HttpTransport = async (request) => {
        requests.push(request.url);
        return { status: 200, body: "<html><body></body></html>", headers: { "content-type": "text/html; charset=utf-8" } };
      };
      const client = new HttpClient({ adapter, transport, sleep: async () => undefined });

      const result = await scrapePuntoTicket({
        adapter,
        client,
        now: () => new Date("2026-09-08T12:00:00.000Z"),
        discovery: { enabled: true, maxPages: 25, maxPagesLimit: 25 },
      });

      for (const url of requests) {
        expect(url).not.toContain("bad-");
        expect([LISTING, VALID_PAGE]).toContain(url);
      }
      const rejected = result.errors.filter((e) => e.code === "url_rejected");
      expect(rejected).toHaveLength(invalidCount);
      for (const error of rejected) expect(error.stage).toBe("listing");
    });
  });
});
