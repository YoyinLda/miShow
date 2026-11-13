import { describe, expect, it } from "vitest";
import { parseVenuePage } from "../src/extraction/venue.js";

const PAGE = "https://www.puntoticket.com/santander-arena";
const rec = (id: string, url: string, title: string) =>
  `{"eventoID":"${id}","nombreArtista":"${title}","urlCompra":"${url}","nombreEvento":"","lugar":"Santander Arena","tituloEvento":"${title}","fecha1":"2027-03-29T21:00:00","productoID":"00000000-0000-0000-0000-000000000000"}`;
const html = (records: string[]) => `<html><body><div id="app">{{ x }}</div><script>var data = {"lista":[${records.join(",")}]};</script></body></html>`;

describe("parseVenuePage: JSON embebido (Vue)", () => {
  it("extrae urlCompra absoluta y relativa (landing raíz) con título", () => {
    const refs = parseVenuePage(
      html([
        rec("FNA386", "https://www.puntoticket.com/evento/pixies", "Pixies"),
        rec("DGM174", "/louis-tomlinson-live-scl-2027", "Louis \\u0054omlinson")
      ]),
      PAGE
    );
    expect(refs).toEqual([
      { source_url: "https://www.puntoticket.com/evento/pixies", title: "Pixies" },
      { source_url: "https://www.puntoticket.com/louis-tomlinson-live-scl-2027", title: "Louis Tomlinson" }
    ]);
  });

  it("descarta hosts ajenos, rutas bloqueadas/no-evento, la propia página y duplicados", () => {
    const refs = parseVenuePage(
      html([
        rec("A", "https://example.com/evento/x", "Ajeno"),
        rec("B", "/musica", "Musica"),
        rec("C", "/santander-arena", "Self"),
        rec("D", "/evento/uno", "Uno"),
        rec("E", "/evento/uno?utm=1#f", "Uno otra vez"),
        rec("F", "https://user:pw@www.puntoticket.com/evento/z", "Creds")
      ]),
      PAGE
    );
    expect(refs.map((r) => r.source_url)).toEqual(["https://www.puntoticket.com/evento/uno"]);
  });

  it("sin registros devuelve []", () => {
    expect(parseVenuePage("<html>{{ listar }}</html>", PAGE)).toEqual([]);
  });
});