import type { RawEventReference } from "@mishow/domain";
import { describe, expect, it } from "vitest";
import { deserializeReferences, serializeReferences } from "../src/acquisition/discovery.js";
import { runIterations, type Prng } from "./helpers/prng.js";

const ALPHABET = [
  ..."abcXYZ019 -_.,;:!?'\"\\/\n\r\t",
  "ñ", "á", "ü", "日", "本", "😀", "🎸", "\u0000", "\u2028", "\u{1F1E8}\u{1F1F1}", "é",
];

function randomTitle(prng: Prng): string {
  const len = prng.int(0, 24);
  let out = "";
  for (let i = 0; i < len; i++) out += prng.pick(ALPHABET);
  return out;
}

function randomRefs(prng: Prng): RawEventReference[] {
  const count = prng.int(0, 12);
  const refs: RawEventReference[] = [];
  for (let i = 0; i < count; i++) {
    const source_url = `https://www.puntoticket.com/evento/${prng.int(0, 99999)}-slug-${prng.int(0, 999)}`;
    refs.push(prng.bool(0.6) ? { source_url, title: randomTitle(prng) } : { source_url });
  }
  return refs;
}

describe("discovery serialization (property)", () => {
  // Feature: puntoticket-venue-discovery, Property 1: Ida y vuelta de la serialización de referencias
  // **Validates: Requirements 9.5**
  it("deserialize(serialize(x)) equivale a x y serialize es idempotente tras el ida y vuelta (150 iteraciones)", async () => {
    await runIterations(150, 9500, (prng) => {
      const refs = randomRefs(prng);
      const text = serializeReferences(refs);
      const back = deserializeReferences(text);
      expect(back).toEqual(refs);
      expect(serializeReferences(back)).toBe(text);
    });
  });

  it("deserializeReferences lanza ante entrada mal formada", () => {
    for (const bad of ["no json", "{}", "[1]", "[null]", '[{"title":"x"}]', '[{"source_url":"a","title":3}]']) {
      expect(() => deserializeReferences(bad)).toThrow();
    }
  });
});
