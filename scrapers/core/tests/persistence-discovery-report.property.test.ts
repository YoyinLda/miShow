import { describe, expect, it } from "vitest";
import type { SourceAdapter } from "../src/adapter.js";
import type { DiscoveryReport } from "../src/acquisition/discovery.js";
import type { FinishRunInput } from "../src/persistence/contracts.js";
import { mapDiscoveryReport, mapFinishRun } from "../src/persistence/mapping.js";
import { runIterations, type Prng } from "./helpers/prng.js";

const HOST = "www.puntoticket.com";
const ITERATIONS = 150;
const BASE_SEED = 0x16d15c0;
const adapter = {
  source: "puntoticket",
  name: "PuntoTicket",
  baseUrl: `https://${HOST}`,
  host: HOST,
  listingUrl: `https://${HOST}/musica`,
  purchasePathPatterns: [/^\/comprar(\/|$)/i]
} as unknown as SourceAdapter;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function slug(prng: Prng): string {
  const parts = Array.from({ length: prng.int(1, 3) }, () =>
    Array.from({ length: prng.int(1, 8) }, () => prng.pick([...ALPHABET])).join("")
  );
  return parts.join("-");
}

function genReport(prng: Prng): DiscoveryReport {
  const slugs = new Set<string>();
  const n = prng.int(0, 8);
  while (slugs.size < n) slugs.add(slug(prng));
  const missing = [...slugs].map((s) => `https://${HOST}/evento/${s}`);
  const requested = prng.int(0, 25);
  const succeeded = prng.int(0, requested);
  return {
    musica_unique: prng.int(0, 50),
    venue_unique: prng.int(0, 50),
    both: prng.int(0, 50),
    missing_count: missing.length,
    total_unique: prng.int(0, 100),
    missing,
    venue_pages: { requested, succeeded, failed: requested - succeeded }
  };
}

function genInput(prng: Prng, report: DiscoveryReport | null | undefined): FinishRunInput {
  const input: FinishRunInput = {
    finished_at: "2026-10-07T12:00:00.000Z",
    status: "succeeded",
    discovered_count: prng.int(0, 100),
    attempted_count: prng.int(0, 100),
    succeeded_count: prng.int(0, 100),
    failed_count: prng.int(0, 100),
    warnings_count: prng.int(0, 100),
    snapshot_complete: false
  };
  if (report !== undefined) input.discovery_report = report;
  return input;
}

describe("Propiedad 16: reporte persistido, ida y vuelta e idempotencia", () => {
  // Feature: puntoticket-venue-discovery, Property 16: El reporte persistido hace ida y vuelta y es idempotente
  // Validates: Requirements 14.2, 14.3, 14.5, 14.6, 14.7
  it("conserva el reporte válido y aplicarlo dos veces da lo mismo", async () => {
    await runIterations(ITERATIONS, BASE_SEED, (prng) => {
      const report = genReport(prng);
      const once = mapFinishRun(adapter, genInput(prng, report));
      expect(once.discovery_report).toEqual(report);
      expect(mapFinishRun(adapter, once)).toEqual(once);
      expect(mapDiscoveryReport(adapter, once.discovery_report)).toEqual(report);
      // Ida y vuelta por JSON (lo que se persiste en jsonb).
      const roundTrip = JSON.parse(JSON.stringify(once.discovery_report)) as DiscoveryReport;
      expect(mapDiscoveryReport(adapter, roundTrip)).toEqual(report);
    });
  });

  it("null o ausente produce null", async () => {
    await runIterations(ITERATIONS, BASE_SEED, (prng) => {
      expect(mapFinishRun(adapter, genInput(prng, undefined)).discovery_report).toBeNull();
      expect(mapFinishRun(adapter, genInput(prng, null)).discovery_report).toBeNull();
      expect(mapDiscoveryReport(adapter, undefined)).toBeNull();
      expect(mapDiscoveryReport(adapter, null)).toBeNull();
    });
  });

  it("el resultado no contiene credenciales ni fragmentos; los reportes con ellos se rechazan", async () => {
    await runIterations(ITERATIONS, BASE_SEED, (prng) => {
      const report = genReport(prng);
      const mapped = mapDiscoveryReport(adapter, report);
      for (const url of mapped?.missing ?? []) {
        const parsed = new URL(url);
        expect(parsed.username).toBe("");
        expect(parsed.password).toBe("");
        expect(parsed.hash).toBe("");
        expect(url).not.toContain("#");
        expect(url).not.toContain("@");
      }

      const target = `https://${HOST}/evento/${slug(prng)}`;
      const bad = prng.pick([
        `${target}#${slug(prng)}`,
        `https://user:pw@${HOST}/evento/${slug(prng)}`,
        `https://${slug(prng)}@${HOST}/evento/${slug(prng)}`
      ]);
      const tainted: DiscoveryReport = { ...report, missing: [...report.missing, bad] };
      expect(() => mapDiscoveryReport(adapter, tainted)).toThrow(/discovery_report/);
    });
  });
});
