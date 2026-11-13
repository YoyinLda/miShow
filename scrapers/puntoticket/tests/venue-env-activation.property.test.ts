/**
 * Propiedad 15 (spec puntoticket-venue-discovery, tarea 15.2).
 * PRNG con semilla fija (el repo no incluye fast-check).
 *
 * **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5**
 */
import { describe, expect, it } from "vitest";
import { CliUsageError, resolveVenueDiscoveryEnabled } from "../src/cli/scrape-args.js";
import { runIterations, type Prng } from "./helpers/prng.js";

const ITERATIONS = 150;
const BASE_SEED = 0x15_0000;

const FIXED_INVALID = ["TRUE", "True", "FALSE", "1", "0", "yes", "no", "", " ", " true", "true ", "true\n", "on"];
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-.,;:\t";

/** Valor de entorno distinto de "true" y "false" exactos. */
function invalidValue(prng: Prng): string {
  if (prng.bool(0.5)) return prng.pick(FIXED_INVALID);
  for (;;) {
    const length = prng.int(0, 12);
    let value = "";
    for (let i = 0; i < length; i += 1) value += prng.pick([...ALPHABET]);
    if (value !== "true" && value !== "false") return value;
  }
}

// Feature: puntoticket-venue-discovery, Property 15: Activación por entorno
describe("Propiedad 15: activación por entorno", () => {
  it("el flag habilita siempre cuando el valor es válido o ausente; true habilita; ausente/false deshabilita", async () => {
    await runIterations(ITERATIONS, BASE_SEED, (prng) => {
      const flag = prng.bool();
      const raw = prng.pick<string | undefined>([undefined, "true", "false"]);
      const env = raw === undefined ? {} : { PUNTOTICKET_VENUE_DISCOVERY: raw };
      expect(resolveVenueDiscoveryEnabled(env, flag)).toBe(flag || raw === "true");
    });
  });

  it("cualquier otro valor lanza CliUsageError, con o sin flag", async () => {
    await runIterations(ITERATIONS, BASE_SEED + 1000, (prng) => {
      const env = { PUNTOTICKET_VENUE_DISCOVERY: invalidValue(prng) };
      const flag = prng.bool();
      expect(() => resolveVenueDiscoveryEnabled(env, flag)).toThrow(CliUsageError);
    });
  });
});
