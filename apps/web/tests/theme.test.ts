import { describe, expect, it } from "vitest";
import { isValidChoice, readStoredChoice, resolveTheme, writeStoredChoice } from "../lib/theme";

describe("resolveTheme", () => {
  it("resuelve 'system' según prefersDark", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("respeta la elección explícita ignorando prefersDark", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("trata un valor inválido como 'system'", () => {
    expect(resolveTheme("weird", true)).toBe("dark");
    expect(resolveTheme(undefined, false)).toBe("light");
  });
});

describe("isValidChoice", () => {
  it("acepta solo los tres estados", () => {
    expect(isValidChoice("light")).toBe(true);
    expect(isValidChoice("dark")).toBe(true);
    expect(isValidChoice("system")).toBe(true);
    expect(isValidChoice("weird")).toBe(false);
    expect(isValidChoice(null)).toBe(false);
  });
});

describe("readStoredChoice", () => {
  function mockStorage(value: string | null): Pick<Storage, "getItem"> {
    return { getItem: () => value };
  }

  it("retorna el valor guardado cuando es válido", () => {
    expect(readStoredChoice(mockStorage("dark"))).toBe("dark");
    expect(readStoredChoice(mockStorage("light"))).toBe("light");
    expect(readStoredChoice(mockStorage("system"))).toBe("system");
  });

  it("trata valor basura como 'system'", () => {
    expect(readStoredChoice(mockStorage("basura"))).toBe("system");
    expect(readStoredChoice(mockStorage(null))).toBe("system");
  });

  it("sin storage retorna 'system' sin lanzar", () => {
    expect(readStoredChoice(undefined)).toBe("system");
  });

  it("ante excepción de getItem retorna 'system'", () => {
    const throwing: Pick<Storage, "getItem"> = {
      getItem: () => {
        throw new Error("denied");
      }
    };
    expect(readStoredChoice(throwing)).toBe("system");
  });
});

describe("writeStoredChoice", () => {
  it("escribe la elección en storage", () => {
    let saved: [string, string] | null = null;
    const storage: Pick<Storage, "setItem"> = {
      setItem: (key, value) => {
        saved = [key, value];
      }
    };
    writeStoredChoice("dark", storage);
    expect(saved).toEqual(["mishow-theme", "dark"]);
  });

  it("no lanza cuando setItem arroja", () => {
    const throwing: Pick<Storage, "setItem"> = {
      setItem: () => {
        throw new Error("quota exceeded");
      }
    };
    expect(() => writeStoredChoice("light", throwing)).not.toThrow();
  });

  it("no lanza cuando no hay storage", () => {
    expect(() => writeStoredChoice("system", undefined)).not.toThrow();
  });
});
