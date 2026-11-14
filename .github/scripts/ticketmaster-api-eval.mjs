#!/usr/bin/env node
// Brief 009 · Entrega A — Evaluación de la Discovery API de Ticketmaster para Chile.
//
// Sin dependencias (Node >= 20, fetch nativo). Solo lectura: consulta la API y la
// vista pública catalog_events_v2; no escribe en la base.
//
// Env requeridas:
//   TICKETMASTER_API_KEY  key de developer.ticketmaster.com (nunca se imprime)
//   SUPABASE_URL          https://<ref>.supabase.co
//   SUPABASE_SECRET_KEY   para leer catalog_events_v2 (solo lectura)
// Env opcionales:
//   TM_API_COUNTRY (CL), TM_API_CLASSIFICATION (music), TM_API_DELAY_MS (600 => < 2 req/s)
//   REPORT_DIR (directorio donde dejar report.md y report.json; default .)
//   GITHUB_STEP_SUMMARY (lo define Actions: el informe se agrega al resumen del job)

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API_BASE = "https://app.ticketmaster.com/discovery/v2/events.json";
const PAGE_SIZE = 200;
const DEEP_PAGING_LIMIT = 1000; // la API exige size * page < 1000
const TZ = "America/Santiago";

export function eventSlug(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/event\/([^/?#]+)/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

export function normName(name) {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function localDate(iso) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function localTime(iso) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/** Evento de la API reducido a los campos que se comparan. */
export function fromApi(e) {
  const start = e.dates?.start ?? {};
  const venue = e._embedded?.venues?.[0];
  const images = e.images ?? [];
  const best = images.slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return {
    id: e.id,
    name: e.name,
    url: e.url ?? null,
    host: e.url ? safeHost(e.url) : null,
    slug: eventSlug(e.url),
    localDate: start.localDate ?? null,
    localTime: start.localTime ? start.localTime.slice(0, 5) : null,
    timeTBA: Boolean(start.timeTBA || start.noSpecificTime),
    timezone: e.dates?.timezone ?? null,
    venue: venue?.name ?? null,
    city: venue?.city?.name ?? null,
    image: best?.url ?? null,
    priceMin: e.priceRanges?.[0]?.min ?? null,
    segment: e.classifications?.[0]?.segment?.name ?? null
  };
}

/** Evento de catalog_events_v2 con fuente ticketmaster. */
export function fromDb(row) {
  const src = (row.sources ?? []).find((s) => s.source === "ticketmaster");
  return {
    id: row.id,
    name: row.name,
    url: src?.source_url ?? null,
    slug: eventSlug(src?.source_url),
    localDate: localDate(row.next_performance_at),
    localTime: row.next_performance_time_known === false ? null : localTime(row.next_performance_at),
    venue: row.venue?.name ?? null,
    image: row.image_url ?? null
  };
}

/** Empareja por slug de /event/<slug>; si no, por nombre normalizado + fecha local. */
export function match(apiEvents, dbEvents) {
  const bySlug = new Map();
  const byKey = new Map();
  for (const d of dbEvents) {
    if (d.slug) bySlug.set(d.slug, d);
    byKey.set(`${normName(d.name)}|${d.localDate}`, d);
  }
  const used = new Set();
  const pairs = [];
  const onlyApi = [];
  for (const a of apiEvents) {
    let d = a.slug ? bySlug.get(a.slug) : undefined;
    let how = "slug";
    if (!d || used.has(d.id)) {
      d = byKey.get(`${normName(a.name)}|${a.localDate}`);
      how = "nombre+fecha";
    }
    if (d && !used.has(d.id)) {
      used.add(d.id);
      pairs.push({ api: a, db: d, how });
    } else {
      onlyApi.push(a);
    }
  }
  const onlyDb = dbEvents.filter((d) => !used.has(d.id));
  return { pairs, onlyApi, onlyDb };
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function countBy(items, fn) {
  const out = {};
  for (const it of items) {
    const k = fn(it) ?? "(vacío)";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function redact(text, key) {
  return key ? String(text).split(key).join("***") : String(text);
}

async function apiGet(params, key) {
  const qs = new URLSearchParams({ ...params, apikey: key });
  const res = await fetch(`${API_BASE}?${qs}`, { headers: { Accept: "application/json" } });
  const body = await res.text();
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    /* cuerpo no JSON (p. ej. página de bloqueo) */
  }
  return {
    status: res.status,
    json,
    snippet: redact(body.slice(0, 300), key),
    quota: {
      limit: res.headers.get("rate-limit"),
      available: res.headers.get("rate-limit-available"),
      reset: res.headers.get("rate-limit-reset")
    }
  };
}

async function fetchApi(key, { country, classification, delayMs }) {
  const calls = [];
  const events = [];
  // Total del país sin filtro de clasificación (1 llamada, size=1) para dimensionar.
  const all = await apiGet({ countryCode: country, size: "1" }, key);
  calls.push({ what: "total país", status: all.status, quota: all.quota });
  if (all.status !== 200) return { calls, events, totalCountry: null, totalMusic: null, error: all };
  await sleep(delayMs);

  let page = 0;
  let totalMusic = null;
  let totalPages = 1;
  while (page < totalPages && (page + 1) * PAGE_SIZE <= DEEP_PAGING_LIMIT) {
    const r = await apiGet(
      { countryCode: country, classificationName: classification, size: String(PAGE_SIZE), page: String(page), sort: "date,asc" },
      key
    );
    calls.push({ what: `música p${page}`, status: r.status, quota: r.quota });
    if (r.status !== 200) return { calls, events, totalCountry: all.json?.page?.totalElements ?? null, totalMusic, error: r };
    totalMusic = r.json?.page?.totalElements ?? 0;
    totalPages = r.json?.page?.totalPages ?? 0;
    for (const e of r.json?._embedded?.events ?? []) events.push(fromApi(e));
    page += 1;
    if (page < totalPages) await sleep(delayMs);
  }
  return { calls, events, totalCountry: all.json?.page?.totalElements ?? null, totalMusic, truncated: page < totalPages };
}

async function fetchDb(url, key) {
  const qs = new URLSearchParams({
    select: "id,name,image_url,next_performance_at,next_performance_time_known,venue,sources",
    limit: "2000"
  });
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/catalog_events_v2?${qs}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }
  });
  if (!res.ok) throw new Error(`Supabase catalog_events_v2 respondió ${res.status}`);
  const rows = await res.json();
  return rows.filter((r) => (r.sources ?? []).some((s) => s.source === "ticketmaster")).map(fromDb);
}

function table(headers, rows) {
  const esc = (v) => String(v ?? "—").replace(/\|/g, "\\|");
  return [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n");
}

export function buildReport({ api, db, m, country, classification }) {
  const lines = [];
  lines.push(`# Evaluación Discovery API Ticketmaster (${country} · ${classification})`, "");
  lines.push(`Fecha: ${new Date().toISOString()}`, "");
  lines.push("## Acceso", "");
  lines.push(table(["Llamada", "HTTP", "Cuota disponible"], api.calls.map((c) => [c.what, c.status, c.quota?.available ? `${c.quota.available}/${c.quota.limit}` : "—"])), "");
  if (api.error) {
    lines.push(`**Error:** HTTP ${api.error.status}. Respuesta: \`${api.error.snippet.replace(/`/g, "'")}\``, "");
    if (api.error.status === 403) lines.push("La API también bloquea desde esta IP: el runner local sigue siendo necesario.", "");
    return lines.join("\n");
  }
  lines.push("## Cobertura", "");
  lines.push(
    table(
      ["Métrica", "Valor"],
      [
        ["Eventos en la API (país, todas las categorías)", api.totalCountry],
        [`Eventos en la API (${classification})`, api.totalMusic],
        ["Leídos de la API", api.events.length + (api.truncated ? " (truncado por deep paging)" : "")],
        ["Ticketmaster en miShow (catalog_events_v2)", db.length],
        ["Coinciden", m.pairs.length],
        ["Solo en la API", m.onlyApi.length],
        ["Solo en miShow", m.onlyDb.length],
        ["Coincidencia por slug / por nombre+fecha", `${m.pairs.filter((p) => p.how === "slug").length} / ${m.pairs.filter((p) => p.how !== "slug").length}`]
      ]
    ),
    ""
  );
  lines.push("## Calidad de datos de la API", "");
  const n = api.events.length || 1;
  const pct = (k) => `${Math.round((100 * api.events.filter(k).length) / n)}%`;
  lines.push(
    table(
      ["Campo", "Presente"],
      [
        ["URL", pct((e) => e.url)],
        ["Hora local", pct((e) => e.localTime && !e.timeTBA)],
        ["Zona horaria", pct((e) => e.timezone)],
        ["Recinto", pct((e) => e.venue)],
        ["Imagen", pct((e) => e.image)],
        ["Precio mínimo", pct((e) => e.priceMin != null)]
      ]
    ),
    ""
  );
  lines.push(`Hosts de URL: ${JSON.stringify(countBy(api.events, (e) => e.host))}`, "");
  lines.push(`Zonas horarias: ${JSON.stringify(countBy(api.events, (e) => e.timezone))}`, "");
  lines.push(`Ciudades: ${JSON.stringify(countBy(api.events, (e) => e.city))}`, "");

  const same = (a, b) => (a ?? null) === (b ?? null);
  const pairs = m.pairs;
  if (pairs.length) {
    lines.push("## Concordancia en los que coinciden", "");
    const agree = (fn) => `${pairs.filter(fn).length}/${pairs.length}`;
    lines.push(
      table(
        ["Campo", "Iguales"],
        [
          ["Fecha local", agree((p) => same(p.api.localDate, p.db.localDate))],
          ["Hora local", agree((p) => same(p.api.localTime, p.db.localTime))],
          ["Recinto (normalizado)", agree((p) => normName(p.api.venue) === normName(p.db.venue))]
        ]
      ),
      ""
    );
    lines.push("### Muestra (10)", "");
    lines.push(
      table(
        ["miShow", "API", "Fecha miShow/API", "Hora miShow/API", "Recinto miShow / API", "Match"],
        pairs.slice(0, 10).map((p) => [p.db.name, p.api.name, `${p.db.localDate} / ${p.api.localDate}`, `${p.db.localTime} / ${p.api.localTime}`, `${p.db.venue} / ${p.api.venue}`, p.how])
      ),
      ""
    );
  }
  if (m.onlyApi.length) {
    lines.push("## Solo en la API (hasta 15)", "");
    lines.push(table(["Evento", "Fecha", "Recinto", "Segmento"], m.onlyApi.slice(0, 15).map((e) => [e.name, e.localDate, e.venue, e.segment])), "");
  }
  if (m.onlyDb.length) {
    lines.push("## Solo en miShow (hasta 15)", "");
    lines.push(table(["Evento", "Fecha", "Recinto"], m.onlyDb.slice(0, 15).map((e) => [e.name, e.localDate, e.venue])), "");
  }
  return lines.join("\n");
}

async function main() {
  const key = process.env.TICKETMASTER_API_KEY;
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Falta TICKETMASTER_API_KEY");
  if (!sbUrl || !sbKey) throw new Error("Faltan SUPABASE_URL / SUPABASE_SECRET_KEY");
  const country = process.env.TM_API_COUNTRY || "CL";
  const classification = process.env.TM_API_CLASSIFICATION || "music";
  const delayMs = Number(process.env.TM_API_DELAY_MS || 600);
  const dir = process.env.REPORT_DIR || ".";

  const api = await fetchApi(key, { country, classification, delayMs });
  // Si la API falla no hace falta leer la base: el informe solo reporta el acceso.
  const db = api.error ? [] : await fetchDb(sbUrl, sbKey);
  const m = match(api.events, db);
  const md = buildReport({ api, db, m, country, classification });

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "report.md"), md);
  writeFileSync(
    join(dir, "report.json"),
    JSON.stringify(
      { country, classification, calls: api.calls, totalCountry: api.totalCountry, totalMusic: api.totalMusic, apiEvents: api.events, db, onlyApi: m.onlyApi, onlyDb: m.onlyDb, pairs: m.pairs },
      null,
      2
    )
  );
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  console.log(md);
  if (api.error) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(redact(err?.message ?? err, process.env.TICKETMASTER_API_KEY));
    process.exit(1);
  });
}
