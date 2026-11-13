export interface Prng {
  /** Float en [0, 1). */
  next(): number;
  /** Entero en [min, max] (ambos inclusivos). */
  int(min: number, max: number): number;
  /** Elemento aleatorio de un arreglo no vacío. */
  pick<T>(arr: readonly T[]): T;
  /** true con probabilidad p (por defecto 0.5). */
  bool(p?: number): boolean;
}

/** PRNG determinista mulberry32. */
export function createPrng(seed: number): Prng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new RangeError(`int(min, max) inválido: ${min}, ${max}`);
      }
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(arr) {
      if (arr.length === 0) throw new RangeError("pick() requiere un arreglo no vacío");
      return arr[Math.floor(next() * arr.length)] as (typeof arr)[number];
    },
    bool(p = 0.5) {
      return next() < p;
    },
  };
}

/**
 * Ejecuta `iterations` veces `fn` con semilla `baseSeed + i`.
 * Si una iteración falla, relanza el error con `seed` e `i` para reproducir.
 */
export function runIterations(
  iterations: number,
  baseSeed: number,
  fn: (prng: Prng, i: number, seed: number) => void | Promise<void>,
): Promise<void> {
  return (async () => {
    for (let i = 0; i < iterations; i++) {
      const seed = baseSeed + i;
      try {
        await fn(createPrng(seed), i, seed);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Falla en iteración i=${i} seed=${seed}: ${reason}`, {
          cause: error,
        });
      }
    }
  })();
}
