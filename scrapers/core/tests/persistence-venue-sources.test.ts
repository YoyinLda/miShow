import { describe, expect, it } from "vitest";
import {
  PersistenceError,
  createSupabaseTableSelectTransport,
  createVenueSourcesLoader,
  listVenueSources,
  type TableSelectRequest
} from "../src/index.js";

const config = { url: "https://example.supabase.co", secretKey: "sb_secret_xyz" };

describe("listVenueSources", () => {
  it("pide source_slug/source_url filtrando por source y devuelve las filas", async () => {
    const requests: TableSelectRequest[] = [];
    const rows = await listVenueSources("puntoticket", async (r) => {
      requests.push(r);
      return [{ source_slug: "teatro-caupolican", source_url: "https://www.puntoticket.com/teatro-caupolican", extra: 1 }];
    });
    expect(requests).toEqual([{ table: "venue_sources", columns: ["source_slug", "source_url", "status", "last_checked_at"], eq: { source: "puntoticket" } }]);
    expect(rows).toEqual([{ source_slug: "teatro-caupolican", source_url: "https://www.puntoticket.com/teatro-caupolican", status: "candidate", last_checked_at: null }]);
  });

  it("acepta 0 filas y es compatible con el loader", async () => {
    const loader = createVenueSourcesLoader(async () => []);
    await expect(loader("puntoticket")).resolves.toEqual([]);
  });

  it("rechaza respuestas que no son arreglo o filas mal formadas", async () => {
    await expect(listVenueSources("puntoticket", async () => ({}))).rejects.toMatchObject({ code: "invalid_response" });
    await expect(listVenueSources("puntoticket", async () => [{ source_slug: "a" }])).rejects.toMatchObject({ code: "invalid_response" });
    await expect(listVenueSources("puntoticket", async () => [null])).rejects.toBeInstanceOf(PersistenceError);
  });

  it("rechaza source vacío y propaga errores del transporte", async () => {
    await expect(listVenueSources(" ", async () => [])).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      listVenueSources("puntoticket", async () => {
        throw new PersistenceError("transport_error", "boom");
      })
    ).rejects.toMatchObject({ code: "transport_error" });
  });
});

describe("createSupabaseTableSelectTransport", () => {
  it("hace GET con apikey y filtro eq", async () => {
    let called: { url: string; init?: RequestInit } | undefined;
    const fetchStub = (async (url: string, init?: RequestInit) => {
      called = { url, init };
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;
    const rows = await listVenueSources(
      "puntoticket",
      createSupabaseTableSelectTransport(config, fetchStub)
    );
    expect(rows).toEqual([]);
    expect(called?.url).toBe("https://example.supabase.co/rest/v1/venue_sources?select=source_slug%2Csource_url%2Cstatus%2Clast_checked_at&source=eq.puntoticket");
    expect(called?.init?.method).toBe("GET");
    expect((called?.init?.headers as Record<string, string>).apikey).toBe(config.secretKey);
  });

  it("mapea errores HTTP y oculta la clave", async () => {
    const fetchStub = (async () =>
      new Response(JSON.stringify({ code: "42501", message: `denied ${config.secretKey}` }), { status: 403 })) as unknown as typeof fetch;
    const error = await listVenueSources("puntoticket", createSupabaseTableSelectTransport(config, fetchStub)).catch((e) => e);
    expect(error).toBeInstanceOf(PersistenceError);
    expect(error.code).toBe("42501");
    expect(error.message).not.toContain(config.secretKey);
  });

  it("mapea fallos de red a transport_error y JSON inválido a invalid_response", async () => {
    const failing = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(listVenueSources("puntoticket", createSupabaseTableSelectTransport(config, failing))).rejects.toMatchObject({
      code: "transport_error"
    });
    const bad = (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    await expect(listVenueSources("puntoticket", createSupabaseTableSelectTransport(config, bad))).rejects.toMatchObject({
      code: "invalid_response"
    });
  });
});
