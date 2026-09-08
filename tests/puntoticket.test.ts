import { describe, expect, it } from "vitest";
import { extractDetail, parseEventDetail } from "../src/puntoticket/extraction/detail.js";
import { parseMusicListing } from "../src/puntoticket/extraction/listing.js";
import { normalizeEvent } from "../src/puntoticket/normalization.js";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const functionsFixture = readFileSync(new URL("./fixtures/puntoticket-functions.html", import.meta.url), "utf8");
const qaRegressionsFixture = readFileSync(new URL("./fixtures/puntoticket-qa-regressions.html", import.meta.url), "utf8");
const metadataFixture = readFileSync(new URL("./fixtures/puntoticket-metadata.html", import.meta.url), "utf8");

const listing = `
  <a href="/evento/FNA387/"><h3>Caluga</h3></a>
  <a href="https://www.puntoticket.com/evento/FNA387?ref=duplicate#card">otra tarjeta</a>
  <a href="/maria-becerra">artista, no evento</a>
  <a href="/musica">categoría</a><a href="/queue/enqueue/NOPE">compra</a>`;

const structuredListing = `
  <article class="event-card"><a href="/"><h3>Inicio</h3><time>10 OCT</time></a></article>
  <article class="event-card"><a href="/maria-becerra"><h3>María Becerra</h3><time datetime="2026-10-10">10 OCT</time></a></article>
  <article class="event-card"><a href="/recintos/teatro"><h3>Teatro</h3><time>10 OCT</time></a></article>
  <a href="/servicios">Servicios</a><a href="/contacto">Contacto</a>`;

const detail = `
  <h1> Macha y El Bloque Depresivo </h1>
  <script type="application/ld+json">{"@type":"Event","name":"Macha y El Bloque Depresivo","startDate":"2026-12-12T20:00:00-03:00","performer":{"name":"Macha"},"location":{"name":"Estadio Nacional","address":{"streetAddress":"Av. Grecia 2001","addressLocality":"Ñuñoa"}},"offers":{"lowPrice":"25000","highPrice":"50000","priceCurrency":"CLP"}}</script>
  <div class="performance" data-performance-date="2026-12-11T20:00:00-03:00" data-status="AGOTADO"></div>
  <div class="performance" data-performance-date="2026-12-12T20:00:00-03:00" data-status="COMPRAR TICKET"><a href="/queue/enqueue/ULK006?cal=2"></a></div>`;

describe("PuntoTicket listing parser", () => {
  it("resolves supported relative/absolute routes and deduplicates", () => {
    expect(parseMusicListing(listing)).toEqual([{ source_url: "https://www.puntoticket.com/evento/FNA387", title: "Caluga" }]);
  });

  it("accepts a landing only when the listing gives structural event evidence", () => {
    expect(parseMusicListing(structuredListing)).toEqual([{ source_url: "https://www.puntoticket.com/maria-becerra", title: "María Becerra" }]);
  });

  it("always excludes the root path, including event-looking cards", () => {
    expect(parseMusicListing(`<article class="event-card"><a href="/"><h3>Inicio</h3><time>10 OCT</time></a></article>`)).toEqual([]);
  });

  it("canonicalizes the event route before matching it and keeps exclusions", () => {
    expect(parseMusicListing(`
      <a href="/evento/FNA387///?ref=qa#card"><h3>Caluga</h3></a>
      <a href="/musica///?ref=qa#card"><h3>Categoría</h3></a>
      <a href="https://evil.example/evento/EXTERNO///?ref=qa#card"><h3>Externo</h3></a>
    `)).toEqual([{ source_url: "https://www.puntoticket.com/evento/FNA387", title: "Caluga" }]);
  });

  it("canonicalizes the base URL and rejects an external base host", () => {
    expect(parseMusicListing(`<a href="/evento/FNA387/?x=1#card"><h3>Evento</h3></a>`, "https://www.puntoticket.com/musica/?page=2")).toEqual([
      { source_url: "https://www.puntoticket.com/evento/FNA387", title: "Evento" }
    ]);
    expect(() => parseMusicListing("<a href='/evento/FNA387'>Evento</a>", "https://evil.example/musica")).toThrow("base-url debe usar el host exacto www.puntoticket.com");
  });
});

describe("PuntoTicket detail extraction and normalization", () => {
  it("consolida modalidades de una función y conserva la alternativa comprable", () => {
    const raw = parseEventDetail(`
      <div class="button-block" data-performance-date="2026-11-01T20:00:00-03:00"><a>AGOTADO</a></div>
      <div class="button-block" data-performance-date="2026-11-01T20:00:00-03:00"><a href="/queue/enqueue/AVAILABLE">DISPONIBLE</a></div>
    `, "https://www.puntoticket.com/evento/modalidades").value!;
    const extracted = extractDetail(raw).value!;
    expect(extracted.performances).toEqual([{ date: "2026-11-01T20:00:00-03:00", status: "available", performance_code: "AVAILABLE", purchase_url: "/queue/enqueue/AVAILABLE" }]);
  });

  it("asocia bloques comerciales sin fecha a la única función del JSON-LD", () => {
    const raw = parseEventDetail(`
      <script type="application/ld+json">{"@type":"Event","startDate":"2026-12-01T21:00:00"}</script>
      <section class="button-block"><p>AGOTADO</p><a href=""></a></section>
      <section class="button-block"><p>DISPONIBLE</p><a href="/queue/enqueue/REAL"></a></section>
    `, "https://www.puntoticket.com/evento/una-funcion").value!;
    const extracted = extractDetail(raw).value!;
    expect(extracted.performances).toEqual([{ date: "2026-12-01T21:00:00", status: "available", performance_code: "REAL", purchase_url: "/queue/enqueue/REAL" }]);
  });

  it("no asigna bloques sin fecha cuando existen varias funciones", () => {
    const result = extractDetail(parseEventDetail(`
      <script type="application/ld+json">{"@type":"Event","subEvent":[{"startDate":"2026-12-01T21:00:00"},{"startDate":"2026-12-02T21:00:00"}]}</script>
      <section class="button-block"><p>DISPONIBLE</p><a href="/queue/enqueue/AMBIGUO"></a></section>
    `, "https://www.puntoticket.com/evento/multiples").value!);
    expect(result.errors).toEqual(["unassociated_commercial_block"]);
    expect(result.value!.performances.every((performance) => !performance.purchase_url)).toBe(true);
  });

  it("rechaza extracted_at que no sea un timestamp ISO válido", () => {
    const raw = parseEventDetail("<h1>Evento</h1>", "https://www.puntoticket.com/evento/fecha").value!;
    expect(() => normalizeEvent(raw, extractDetail(raw).value!, { extracted_at: "no-es-fecha" })).toThrow("extracted_at");
  });

  it("no considera comprable una disponibilidad sin URL válida", () => {
    const raw = parseEventDetail(`
      <div class="button-block" data-performance-date="2026-11-02T20:00:00-03:00" data-status="DISPONIBLE"><a href="/tickets/no-valido">COMPRAR</a></div>
    `, "https://www.puntoticket.com/evento/modalidad-invalida").value!;
    const extracted = extractDetail(raw).value!;
    expect(extracted.performances[0]).toEqual({ date: "2026-11-02T20:00:00-03:00", status: "unknown" });
  });

  it("prefiere venta general y ordena funciones por inicio normalizado", () => {
    const raw = parseEventDetail(`
      <div class="button-block" data-performance-date="2026-11-03T23:00:00Z"><span>PREVENTA</span><a href="/queue/enqueue/PRE">DISPONIBLE</a></div>
      <div class="button-block" data-performance-date="2026-11-03T20:00:00-03:00"><span>VENTA GENERAL</span><a href="/queue/enqueue/GEN">DISPONIBLE</a></div>
      <div class="button-block" data-performance-date="2026-11-04T20:00:00-03:00"><span>VENTA GENERAL</span><a href="/queue/enqueue/NEXT">DISPONIBLE</a></div>
    `, "https://www.puntoticket.com/evento/modalidades-orden").value!;
    const normalized = normalizeEvent(raw, extractDetail(raw).value!, { extracted_at: "2026-09-08T12:00:00.000Z" });
    expect(normalized.performances.map(({ starts_at, performance_code }) => [starts_at, performance_code])).toEqual([
      ["2026-11-03T20:00:00-03:00", "GEN"], ["2026-11-04T20:00:00-03:00", "NEXT"]
    ]);
  });

  it("extracts valid HTTPS image and coordinates without downloading the image", () => {
    const raw = parseEventDetail(metadataFixture, "https://www.puntoticket.com/evento/metadatos").value!;
    const extracted = extractDetail(raw).value!;
    expect(extracted.image_url).toBe("https://cdn.example.test/event.jpg");
    expect(extracted.venue).toMatchObject({ latitude: -33.45, longitude: -70.66 });
    expect(extracted.price).toEqual({ min: undefined, max: 0, currency: "CLP" });
    expect(normalizeEvent(raw, extracted, { extracted_at: "2026-09-08T12:00:00.000Z" })).toMatchObject({
      image_url: "https://cdn.example.test/event.jpg",
      extracted_at: "2026-09-08T12:00:00.000Z"
    });
  });

  it("canonicalizes and requires a PuntoTicket source URL", () => {
    const result = parseEventDetail("<h1>Evento</h1>", "https://www.puntoticket.com/evento/x/?ref=qa#detail");
    expect(result.value?.source_url).toBe("https://www.puntoticket.com/evento/x");
    expect(() => parseEventDetail("<h1>Evento</h1>", "https://evil.example/evento/x")).toThrow("source_url debe usar el host exacto www.puntoticket.com");
    expect(() => parseEventDetail("<h1>Evento</h1>", "")).toThrow("source_url es obligatorio");
  });

  it("protects normalized image, price and coordinate fields", () => {
    const raw = parseEventDetail("<h1>Protegido</h1>", "https://www.puntoticket.com/evento/protegido").value!;
    const normalized = normalizeEvent(raw, {
      name: "Protegido", artists: [], image_url: "http://example.test/image.jpg", venue: { latitude: 91, longitude: -181 },
      performances: [], price: { min: true as unknown as number, max: "  " as unknown as number, currency: "CLP" }
    }, { extracted_at: "2026-09-08T12:00:00.000Z" });
    expect(normalized).not.toHaveProperty("image_url");
    expect(normalized).not.toHaveProperty("price");
    expect(normalized.venue).toMatchObject({ latitude: undefined, longitude: undefined });
  });

  it("emits JSON-only CLI stdout when invoked with npm --silent run", () => {
    const result = spawnSync("npm", ["--silent", "run", "puntoticket:listing", "--", "tests/fixtures/puntoticket-metadata.html"], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it("does not convert empty, whitespace, null or non-numeric prices to zero", () => {
    const raw = parseEventDetail(`<script type="application/ld+json">{"@type":"Event","startDate":"2026-10-01T20:00:00-03:00","offers":[{"lowPrice":null,"highPrice":"   "},{"price":"nope"}]}</script>`, "https://www.puntoticket.com/evento/precios").value!;
    expect(extractDetail(raw).value!.price).toBeUndefined();
    const zeroRaw = parseEventDetail(`<script type="application/ld+json">{"@type":"Event","startDate":"2026-10-01T20:00:00-03:00","offers":{"price":0}}</script>`, "https://www.puntoticket.com/evento/cero").value!;
    expect(extractDetail(zeroRaw).value!.price).toMatchObject({ min: 0, max: 0 });
  });

  it("extracts Spanish function blocks and merges JSON-LD without propagating publication URLs", () => {
    const raw = parseEventDetail(functionsFixture, "https://www.puntoticket.com/evento/sintetico").value!;
    expect(raw.source_code).toBe("PUB");
    expect(raw.purchase_url).toBeUndefined();
    const extracted = extractDetail(raw).value!;
    expect(extracted.performances.map(({ date, status, performance_code, purchase_url }) => [date, status, performance_code, purchase_url])).toEqual([
      ["2026-12-11T20:00:00", "sold_out", undefined, undefined],
      ["2026-12-12T20:00:00", "available", "PERF", "/queue/enqueue/PERF"],
      ["2026-12-13T20:00:00", "available", "PERF2", "/queue/enqueue/PERF2"]
    ]);
    const normalized = normalizeEvent(raw, extracted, { extracted_at: "2026-09-08T12:00:00.000Z" });
    expect(normalized.source_code).toBe("PUB");
    expect(normalized).not.toHaveProperty("purchase_url");
    expect(normalized.performances[0]).not.toHaveProperty("purchase_url");
    expect(normalized.performances[1]).toMatchObject({ performance_code: "PERF", purchase_url: "https://www.puntoticket.com/queue/enqueue/PERF" });
    expect(normalized.performances[2]).toMatchObject({ performance_code: "PERF2", purchase_url: "https://www.puntoticket.com/queue/enqueue/PERF2" });
  });

  it("does not invent a publication code from function queue links", () => {
    const raw = parseEventDetail(`
      <section class="button-block" data-performance-date="2026-12-12T20:00:00"><a href="/queue/enqueue/PERF">COMPRAR</a></section>
    `, "https://www.puntoticket.com/evento/sin-publicacion").value!;
    expect(raw.source_code).toBeUndefined();
    expect(raw.purchase_url).toBeUndefined();
  });

  it("combines JSON-LD and HTML performances without following queue links", () => {
    const raw = parseEventDetail(detail, "https://www.puntoticket.com/macha-y-el-bloque-depresivo").value!;
    expect(raw.source_code).toBeUndefined();
    expect(raw.purchase_url).toBeUndefined();
    const extracted = extractDetail(raw).value!;
    expect(extracted.performances.map((p) => [p.date, p.status])).toEqual([
      ["2026-12-11T20:00:00-03:00", "sold_out"], ["2026-12-12T20:00:00-03:00", "available"]
    ]);
    const normalized = normalizeEvent(raw, extracted, { extracted_at: "2026-09-08T12:00:00.000Z" });
    expect(normalized.source_code).toBeUndefined();
    expect(normalized.source_url).not.toBe(normalized.performances[1].purchase_url);
    expect(normalized.status).toBe("available");
    expect(normalized.performances[1].timezone).toBe("America/Santiago");
    expect(normalized.performances[1].starts_at).toBe("2026-12-12T20:00:00-03:00");
  });

  it("deduplicates equivalent instants across JSON-LD and HTML with HTML precedence", () => {
    const raw = parseEventDetail(`
      <script type="application/ld+json">{"@type":"Event","startDate":"2026-12-12T23:00:00Z","offers":{"availability":"https://schema.org/SoldOut","url":"/queue/enqueue/JSON"}}</script>
      <div class="performance" data-performance-date="2026-12-12T20:00:00-03:00" data-status="COMPRAR"><a href="/queue/enqueue/HTML"></a></div>
    `, "https://www.puntoticket.com/evento/instante").value!;
    const extracted = extractDetail(raw).value!;
    expect(extracted.performances).toEqual([{ date: "2026-12-12T20:00:00-03:00", status: "available", performance_code: "HTML", purchase_url: "/queue/enqueue/HTML" }]);
  });

  it("keeps unknown state and optional purchase URL", () => {
    const raw = parseEventDetail(`<script type="application/ld+json">{"@type":"Event","name":"TBD","startDate":"2026-10-01T20:00:00-03:00"}</script>`, "https://www.puntoticket.com/evento/TBD").value!;
    const extracted = extractDetail(raw).value!;
    expect(extracted.performances[0].status).toBe("unknown");
    expect(normalizeEvent(raw, extracted, { extracted_at: "2026-09-08T12:00:00.000Z" }).performances[0]).not.toHaveProperty("purchase_url");
  });

  it("does not propagate unsafe or external purchase URLs", () => {
    const raw = parseEventDetail(`
      <script type="application/ld+json">{"@type":"Event","name":"Seguro","startDate":"2026-10-01T20:00:00-03:00","offers":{"url":"https://evil.example/ticket"}}</script>
      <div class="button-block" data-performance-date="2026-10-01T20:00:00-03:00"><a href="javascript:alert(1)">COMPRAR</a></div>
      <div class="button-block" data-performance-date="2026-10-02T20:00:00-03:00"><a href="data:text/html,ticket">COMPRAR</a></div>
      <div class="button-block" data-performance-date="2026-10-03T20:00:00-03:00"><a href="https://evil.example/ticket">COMPRAR</a></div>
      <div class="button-block" data-performance-date="2026-10-04T20:00:00-03:00"><a href="/queue/enqueue/SAFE">COMPRAR</a></div>
      <div class="button-block" data-performance-date="2026-10-05T20:00:00-03:00"><a href="https://www.puntoticket.com:8443/queue/enqueue/PORT">COMPRAR</a></div>
      <div class="button-block" data-performance-date="2026-10-06T20:00:00-03:00"><a href="https://www.puntoticket.com/tickets/NOT-QUEUE">COMPRAR</a></div>
    `, "https://www.puntoticket.com/evento/seguro").value!;
    const extracted = extractDetail(raw).value!;
    expect(extracted.performances.slice(0, 3).every((performance) => !performance.purchase_url)).toBe(true);
    expect(extracted.performances[3].purchase_url).toBe("/queue/enqueue/SAFE");
    expect(extracted.performances.slice(4).every((performance) => !performance.purchase_url)).toBe(true);
    raw.purchase_url = "javascript:alert(1)";
    expect(normalizeEvent(raw, extracted, { extracted_at: "2026-09-08T12:00:00.000Z" })).not.toHaveProperty("purchase_url");
  });

  it("extracts independent HTML availability, JSON-LD functions and PriceCurrency", () => {
    const raw = parseEventDetail(`
      <h1>Macha sintético</h1>
      <script type="application/ld+json">{"@type":"Event","performer":[{"name":"Macha"}],"subEvent":[{"@type":"Event","startDate":"2026-12-14T20:00:00-03:00","offers":{"availability":"https://schema.org/SoldOut"}},{"@type":"Event","startDate":"2026-12-15T20:00:00-03:00","offers":{"price":"25000","availability":"https://schema.org/InStock","PriceCurrency":"CLP","url":"/queue/enqueue/15"}}]}</script>
      <div class="funcion" data-performance-date="2026-12-14T20:00:00-03:00" data-status="AGOTADO"></div>
      <div class="funcion" data-performance-date="2026-12-15T20:00:00-03:00" data-status="COMPRAR"><a href="/tickets/15"></a></div>
    `, "https://www.puntoticket.com/evento/macha").value!;
    const extracted = extractDetail(raw).value!;
    expect(extracted.artists).toEqual(["Macha"]);
    expect(extracted.performances.map(({ date, status, purchase_url }) => [date, status, purchase_url])).toEqual([
      ["2026-12-14T20:00:00-03:00", "sold_out", undefined],
      ["2026-12-15T20:00:00-03:00", "available", "/queue/enqueue/15"]
    ]);
    expect(extracted.price).toEqual({ min: 25000, max: 25000, currency: "CLP" });
  });

  it("reports invalid JSON-LD without discarding the raw detail", () => {
    const result = parseEventDetail(`<script type="application/ld+json">{malformed</script><h1>Evento</h1>`, "https://www.puntoticket.com/evento/x");
    expect(result.value?.html).toContain("malformed");
    expect(result.errors).toEqual(["json_ld_invalid: script 1"]);
  });

  it("interprets an offset-less local date in Santiago and keeps publication purchase_url", () => {
    const raw = parseEventDetail(`<script type="application/ld+json">{"@type":"Event","name":"Local","startDate":"2026-12-12T20:00:00"}</script>`, "https://www.puntoticket.com/evento/local").value!;
    raw.purchase_url = "https://www.puntoticket.com/queue/enqueue/LOCAL";
    const normalized = normalizeEvent(raw, extractDetail(raw).value!, { extracted_at: "2026-09-08T12:00:00.000Z" });
    expect(normalized.purchase_url).toBe(raw.purchase_url);
    expect(normalized.performances[0].starts_at).toBe("2026-12-12T20:00:00-03:00");
  });

  it("rejects nonexistent local DST times and keeps valid summer and winter times deterministic", () => {
    const raw = parseEventDetail(`
      <script type="application/ld+json">{"@type":"Event","name":"DST","subEvent":[
        {"@type":"Event","startDate":"2026-09-06T00:30:00"},
        {"@type":"Event","startDate":"2026-09-06T01:30:00"},
        {"@type":"Event","startDate":"2026-06-15T20:00:00"},
        {"@type":"Event","startDate":"2026-12-15T20:00:00"}
      ]}</script>
    `, "https://www.puntoticket.com/evento/dst").value!;
    const extractedResult = extractDetail(raw);
    expect(extractedResult.errors).toEqual(["invalid_performance_date: 2026-09-06T00:30:00"]);
    const normalized = normalizeEvent(raw, extractedResult.value!, { extracted_at: "2026-09-08T12:00:00.000Z" });
    expect(normalized.performances.map((performance) => performance.starts_at)).toEqual([
      "2026-06-15T20:00:00-04:00",
      "2026-09-06T01:30:00-03:00",
      "2026-12-15T20:00:00-03:00"
    ]);
  });

  it("maps PreOrder availability values to upcoming without changing other states", () => {
    const raw = parseEventDetail(`
      <script type="application/ld+json">{"@type":"Event","subEvent":[
        {"@type":"Event","startDate":"2026-12-16T20:00:00-03:00","offers":{"availability":"PreOrder"}},
        {"@type":"Event","startDate":"2026-12-17T20:00:00-03:00","offers":{"availability":"https://schema.org/PreOrder"}},
        {"@type":"Event","startDate":"2026-12-18T20:00:00-03:00","offers":{"availability":"https://schema.org/InStock"}},
        {"@type":"Event","startDate":"2026-12-19T20:00:00-03:00","offers":{"availability":"https://schema.org/SoldOut"}}
      ]}</script>
    `, "https://www.puntoticket.com/evento/availability").value!;
    expect(extractDetail(raw).value!.performances.map((performance) => performance.status)).toEqual([
      "upcoming", "upcoming", "unknown", "sold_out"
    ]);
  });

  it("keeps per-performance queue identifiers, recognizes full schema Event types, and rejects invalid calendar dates", () => {
    const raw = parseEventDetail(qaRegressionsFixture, "https://www.puntoticket.com/evento/regresiones").value!;
    const extractedResult = extractDetail(raw);
    expect(extractedResult.errors).toEqual(["invalid_performance_date: 2026-02-30T20:00:00"]);
    expect(extractedResult.value?.performances.map(({ date, performance_code }) => [date, performance_code])).toEqual([
      ["2026-09-15T20:00:00", "PERF-C"],
      ["2026-09-13T20:00:00", "PERF-A"],
      ["2026-09-14T20:00:00", "PERF-B"]
    ]);
    const normalized = normalizeEvent(raw, extractedResult.value!, { extracted_at: "2026-09-08T12:00:00.000Z" });
    expect(normalized.performances.map(({ performance_code }) => performance_code)).toEqual(["PERF-A", "PERF-B", "PERF-C"]);
  });
});
