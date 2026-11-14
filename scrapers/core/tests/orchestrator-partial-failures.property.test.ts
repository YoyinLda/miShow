import { describe, expect, it } from "vitest";
import type { RawEventDetail, RawEventReference } from "@mishow/domain";
import type { SourceAdapter } from "../src/adapter.js";
import { HttpClient, type HttpTransport, type HttpTransportResponse } from "../src/acquisition/http.js";
import { scrape } from "../src/acquisition/orchestrator.js";
import { runIterations, type Prng } from "./helpers/prng.js";

const HOST = "www.example-tickets.com";
const BASE_SEED = 0x5eed11;
const ITERATIONS = 120;
const NOW = new Date("2030-01-01T12:00:00.000Z");

type FailKind = "http" | "policy" | "redirect" | "parse";
type PagePlan = { url: string; kind: "ok"; slugs: string[] } | { url: string; kind: FailKind; status?: number };

const eventUrl = (slug: string): string => `https://${HOST}/evento/${slug}`;

// Adapter falso: /musica es el listado, /venues/<slug> la allowlist secundaria,
// /pago/* está bloqueado. Los listados/páginas llevan un JSON con slugs; un cuerpo no JSON falla al parsear.
function makeAdapter(indexUrls: string[], indexFails: boolean): SourceAdapter {
  const allowed = new Set(indexUrls.map((u) => new URL(u).pathname).filter((p) => p.startsWith("/venues/")));
  const parseSlugs = (html: string, base: string): RawEventReference[] =>
    (JSON.parse(html) as string[]).map((slug) => ({ source_url: new URL(`/evento/${slug}`, base).href, title: slug }));
  return {
    source: "fake",
    name: "Fake",
    baseUrl: `https://${HOST}`,
    host: HOST,
    listingUrl: `https://${HOST}/musica`,
    purchasePathPatterns: [],
    discovery: {
      id: "venues",
      isSecondaryPagePath: (p: string) => allowed.has(p),
      index: {
        kind: "fixed-list",
        list: async () => {
          if (indexFails) throw new Error("indice no disponible");
          return indexUrls;
        }
      },
      parsePage: (html: string, pageUrl: string) => parseSlugs(html, pageUrl)
    },
    isListingPath: (p: string) => p === "/musica",
    isDetailPath: (p: string) => p.startsWith("/evento/"),
    isBlockedPath: (p: string) => p.startsWith("/pago"),
    parseListing: (html: string, base: string) => parseSlugs(html, base),
    parseDetail: (_html: string, sourceUrl: string) => ({
      value: { source_url: sourceUrl, html: "", json_ld: [] } satisfies RawEventDetail,
      errors: []
    }),
    extractDetail: () => ({
      value: { name: "Evento", artists: [], performances: [{ date: "2030-06-01T20:00:00", status: "available" as const }] },
      errors: []
    })
  } as unknown as SourceAdapter;
}

const html = (body: string, status = 200, headers: Record<string, string> = {}): HttpTransportResponse => ({
  status,
  headers: { "content-type": "text/html; charset=utf-8", ...headers },
  body
});

function makePlan(prng: Prng, pool: string[]): { plan: PagePlan[]; indexFails: boolean } {
  const indexFails = prng.bool(0.1);
  const count = prng.int(0, 8);
  const mode = prng.int(0, 3); // 0: todo ok, 1: todo falla, 2-3: mezcla aleatoria
  const plan: PagePlan[] = [];
  for (let i = 0; i < count; i++) {
    const fails = mode === 0 ? false : mode === 1 ? true : prng.bool(0.5);
    if (!fails) {
      const slugs = Array.from({ length: prng.int(0, 5) }, () => prng.pick(pool));
      plan.push({ url: `https://${HOST}/venues/v${i}`, kind: "ok", slugs });
      continue;
    }
    const kind = prng.pick<FailKind>(["http", "policy", "redirect", "parse"]);
    if (kind === "policy") {
      // Fuera de la allowlist o ruta bloqueada: nunca debe solicitarse.
      plan.push({ url: `https://${HOST}${prng.bool() ? "/otra" : "/pago"}/v${i}`, kind });
    } else if (kind === "http") {
      plan.push({ url: `https://${HOST}/venues/v${i}`, kind, status: prng.pick([403, 404, 500, 503]) });
    } else {
      plan.push({ url: `https://${HOST}/venues/v${i}`, kind });
    }
  }
  return { plan, indexFails };
}

describe("orquestador: fallos parciales (propiedad)", () => {
  // Feature: puntoticket-venue-discovery, Property 11: Tolerancia a fallos parciales y contabilidad de páginas
  it("Property 11: Tolerancia a fallos parciales y contabilidad de páginas", async () => {
    // Validates: Requirements 1.4, 1.5, 2.4, 6.3, 8.1, 8.2, 8.4, 8.5
    await runIterations(ITERATIONS, BASE_SEED, async (prng) => {
      const pool = Array.from({ length: prng.int(1, 12) }, (_, k) => `ev-${k}`);
      const musicaSlugs = [...new Set(Array.from({ length: prng.int(1, 6) }, () => prng.pick(pool)))];
      const { plan, indexFails } = makePlan(prng, pool);

      const adapter = makeAdapter(plan.map((p) => p.url), indexFails);
      const byUrl = new Map(plan.map((p) => [p.url, p]));
      const requested: string[] = [];

      const transport: HttpTransport = async ({ url }) => {
        requested.push(url);
        if (url === `https://${HOST}/musica`) return html(JSON.stringify(musicaSlugs));
        if (url.startsWith(`https://${HOST}/evento/`)) return html("<html></html>");
        const page = byUrl.get(url);
        if (!page) throw new Error(`solicitud inesperada: ${url}`);
        switch (page.kind) {
          case "ok":
            return html(JSON.stringify(page.slugs));
          case "http":
            return html("error", page.status);
          case "redirect":
            return html("", 302, { location: "https://evil.example.com/x" });
          case "parse":
            return html("<<no es json>>");
          default:
            throw new Error(`no debería solicitarse: ${url}`);
        }
      };

      const config = { retries: 0, maxEvents: 200 };
      const client = new HttpClient({ adapter, config, transport, sleep: async () => undefined, nowMs: () => NOW.getTime() });
      // Sin error global: cualquier rechazo aquí hace fallar la propiedad.
      const result = await scrape({ adapter, config, client, now: () => NOW, discovery: { enabled: true, maxPages: 25, maxPagesLimit: 25 } });

      // Se conservan todos los eventos de /musica.
      const eventUrls = new Set(result.events.map((e) => e.source_url));
      for (const slug of musicaSlugs) expect(eventUrls.has(eventUrl(slug))).toBe(true);

      // Eventos de venue exitosos también se entregan; nada fuera de /musica ∪ páginas ok.
      const okSlugs = plan.flatMap((p) => (p.kind === "ok" && !indexFails ? p.slugs : []));
      const expected = new Set([...musicaSlugs, ...okSlugs].map(eventUrl));
      expect(eventUrls).toEqual(expected);

      // Contabilidad de páginas.
      const report = result.discovery;
      expect(report).toBeDefined();
      const pages = report!.venue_pages;
      if (indexFails) {
        expect(pages).toEqual({ requested: 0, succeeded: 0, failed: 0 });
        expect(result.errors.filter((e) => e.code === "venue_index_failed")).toHaveLength(1);
        expect(result.errors.find((e) => e.code === "venue_index_failed")!.stage).toBe("listing");
        expect(result.errors).toHaveLength(1);
        return;
      }
      const failed = plan.filter((p) => p.kind !== "ok");
      expect(pages.requested).toBe(plan.length);
      expect(pages.failed).toBe(failed.length);
      expect(pages.succeeded).toBe(plan.length - failed.length);
      expect(pages.requested).toBe(pages.succeeded + pages.failed);

      // Un error por página fallida, con stage y URL canónica de la página; salvo
      // 404 (venue candidata inexistente: se informa en el reporte, no como error; brief 008).
      const reported = failed.filter((p) => !(p.kind === "http" && p.status === 404));
      expect(result.errors).toHaveLength(reported.length);
      for (const page of failed.filter((p) => p.kind === "http" && p.status === 404)) {
        expect(result.errors.find((e) => e.source_url === page.url)).toBeUndefined();
      }
      for (const page of reported) {
        const error = result.errors.find((e) => e.source_url === page.url);
        expect(error, `sin error para ${page.url}`).toBeDefined();
        expect(error!.stage).toBe(page.kind === "parse" ? "parse" : "listing");
        if (page.kind === "policy") expect(error!.code).toBe("url_rejected");
        if (page.kind === "redirect") expect(error!.code).toBe("redirect_rejected");
        if (page.kind === "http") expect(error!.code).toBe("http_error");
        if (page.kind === "parse") expect(error!.code).toBe("parse_error");
        if (page.kind === "policy") expect(requested).not.toContain(page.url);
      }
    });
  });
});
