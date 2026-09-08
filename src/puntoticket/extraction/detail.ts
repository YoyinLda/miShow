import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { EventStatus, ExtractionResult, RawEventDetail } from "../contracts.js";
import { instantKey } from "../time.js";
import { allowedPurchaseUrl, canonicalSourceUrl } from "../url.js";

const QUEUE = /\/queue\/enqueue\/([^/?#]+)/i;
const BUY = /\/comprar\/evento\/([^/?#]+)\/cal\/[^/?#]+/i;
const FUNCTION_BLOCK_SELECTOR = "[data-performance-date], [data-function-date], [data-event-date], .performance, .funcion, .event-date, [data-function], .button-block";
const PUBLICATION_CODE_SELECTOR = "[data-publication-code], [data-source-code], [data-event-code]";
const statuses: Array<[RegExp, EventStatus]> = [[/agotad|sold[ -]?out/i, "sold_out"], [/pr[oó]ximamente|coming soon|\bpreorder\b|https?:\/\/schema\.org\/preorder(?:\b|$)/i, "upcoming"], [/comprar|disponible|venta|in[ -]?stock/i, "available"]];
const AMBIGUOUS_PURCHASE_MAPPING = "ambiguous performance purchase mapping";

export function parseEventDetail(html: string, sourceUrl: string): ExtractionResult<RawEventDetail> {
  const canonicalUrl = canonicalSourceUrl(sourceUrl);
  const $ = cheerio.load(html);
  const jsonLd: unknown[] = [];
  const errors: string[] = [];
  $("script[type='application/ld+json']").each((index, node) => {
    try {
      const parsed = JSON.parse($(node).text());
      jsonLd.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      errors.push(`json_ld_invalid: script ${index + 1}`);
    }
  });
  const sourceCode = publicationCode($);
  const purchaseUrl = publicationPurchaseUrl($, canonicalUrl);
  const availabilityEvidence = publicationAvailabilityEvidence($, canonicalUrl);
  return { value: { source_url: canonicalUrl, html, json_ld: jsonLd, source_code: sourceCode, purchase_url: purchaseUrl, ...(availabilityEvidence ? { availability_evidence: availabilityEvidence } : {}) }, errors };
}

export interface ExtractedDetail {
  name?: string; artists: string[]; image_url?: string; venue?: { name?: string; address?: string; city?: string; latitude?: number; longitude?: number };
  performances: Array<{ date: string; status: EventStatus; performance_code?: string; purchase_url?: string }>;
  availability_evidence?: RawEventDetail["availability_evidence"];
  price?: { min?: number; max?: number; currency?: string };
}

type PerformanceCandidate = ExtractedDetail["performances"][number] & { saleRank?: number };
const saleRanks = new WeakMap<object, number>();

export function extractDetail(detail: RawEventDetail): ExtractionResult<ExtractedDetail> {
  const $ = cheerio.load(detail.html);
  const errors: string[] = [];
  const events = detail.json_ld.flatMap(asEvents);
  const event = events[0] ?? {};
  const artists = unique(events.flatMap((item) => values(item.performer).map(nameOf).filter(Boolean) as string[]));
  const place = event.location && typeof event.location === "object" ? event.location : {};
  const address = place.address && typeof place.address === "object" ? place.address : {};
  const performances: ExtractedDetail["performances"] = [];
  const undatedModalities: Array<Omit<PerformanceCandidate, "date">> = [];
  const referenceDate = events.map((item) => item.startDate).find((value): value is string => typeof value === "string");
  const safeHoras = safeHorasPorFecha(detail.html, detail.source_url);
  errors.push(...safeHoras.errors);
  for (const performance of safeHoras.performances) addPerformance(performances, performance, errors);
  $(FUNCTION_BLOCK_SELECTOR).each((_, node) => {
    const current = $(node);
    const text = nodeText(current);
    const date = explicitFunctionDate(current) ?? datedHeading(current, referenceDate) ?? (current.find(".legal_btn").length ? undefined : dateFromSpanish(text, referenceDate));
    const modality = commercialCandidate(current, detail.source_url, text);
    if (!modality) return;
    if (date) addPerformance(performances, { date, ...modality }, errors);
    else undatedModalities.push(modality);
  });
  for (const item of events) {
    for (const subEvent of values(item.subEvent)) {
      if (!isRecord(subEvent) || typeof subEvent.startDate !== "string") continue;
      const purchaseUrl = offerUrl(subEvent.offers, detail.source_url);
      const status = statusFrom(offerAvailability(subEvent.offers));
      addPerformance(performances, { date: subEvent.startDate, status: status === "available" && !purchaseUrl ? "unknown" : status, ...(purchaseUrl ? { performance_code: queueCode(purchaseUrl, detail.source_url), purchase_url: purchaseUrl } : {}) }, errors);
    }
    if (typeof item.startDate === "string") {
      const purchaseUrl = offerUrl(item.offers, detail.source_url);
      const status = statusFrom(offerAvailability(item.offers));
      addPerformance(performances, { date: item.startDate, status: status === "available" && !purchaseUrl ? "unknown" : status, ...(purchaseUrl ? { performance_code: queueCode(purchaseUrl, detail.source_url), purchase_url: purchaseUrl } : {}) }, errors);
    }
  }
  if (undatedModalities.length) {
    if (performances.length === 1) for (const modality of undatedModalities) addPerformance(performances, { date: performances[0].date, ...modality }, errors);
    else errors.push(...undatedModalities.filter((modality) => modality.purchase_url || modality.status === "available").map(() => AMBIGUOUS_PURCHASE_MAPPING));
  }
  if (detail.availability_evidence?.status === "available" && performances.length > 1 && performances.every((performance) => !performance.purchase_url) && !errors.includes(AMBIGUOUS_PURCHASE_MAPPING)) {
    errors.push(AMBIGUOUS_PURCHASE_MAPPING);
  }
  const geo = place.geo && typeof place.geo === "object" ? place.geo : {};
  const latitude = coordinate(geo.latitude, -90, 90);
  const longitude = coordinate(geo.longitude, -180, 180);
  const venue = { name: place.name, address: address.streetAddress, city: address.addressLocality, ...(latitude !== undefined ? { latitude } : {}), ...(longitude !== undefined ? { longitude } : {}) };
  const imageUrl = image(event.image);
  return { value: { name: event.name ?? ($("h1").first().text().trim() || undefined), artists, ...(imageUrl ? { image_url: imageUrl } : {}), venue, performances, ...(detail.availability_evidence ? { availability_evidence: detail.availability_evidence } : {}), price: priceFrom(events.flatMap(offersInEvent)) }, errors };
}

function statusFrom(value: string): EventStatus { return statuses.find(([pattern]) => pattern.test(value))?.[1] ?? "unknown"; }
function nodeText(current: cheerio.Cheerio<AnyNode>): string { return current.html()?.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? current.text().trim(); }
function explicitFunctionDate(current: cheerio.Cheerio<AnyNode>): string | undefined {
  return current.attr("data-performance-date") ?? current.attr("data-function-date") ?? current.attr("data-event-date");
}
function datedHeading(current: cheerio.Cheerio<AnyNode>, referenceDate?: string): string | undefined {
  const heading = current.find("h1,h2,h3,h4,h5,h6,time,[data-date]").first();
  return heading.length ? dateFromSpanish(heading.text().trim(), referenceDate) : undefined;
}
function commercialCandidate(current: cheerio.Cheerio<AnyNode>, baseUrl: string, text: string): Omit<PerformanceCandidate, "date"> | undefined {
  const link = firstEnabledPurchaseLink(current);
  const href = link ? attrCaseInsensitive(link, "data-buyLink") ?? attrCaseInsensitive(link, "data-purchase-url") ?? link.attr("href") : undefined;
  const purchaseUrl = href && allowedPurchaseUrl(href, baseUrl) ? href : undefined;
  const structuralStatus = current.find(".icon-status.available").filter((_, node) => isVisibleEnabled(current.find(node))).length ? "available" : undefined;
  const status = structuralStatus ?? statusFrom(current.attr("data-status") ?? (link ? text : ""));
  return { status: status === "available" && !purchaseUrl ? "unknown" : status, ...(purchaseUrl ? { performance_code: queueCode(purchaseUrl, baseUrl), purchase_url: purchaseUrl } : {}), saleRank: saleRank(text) };
}
function dateFromSpanish(value: string, referenceDate?: string): string | undefined {
  const explicit = dateFrom(value);
  if (explicit || !referenceDate) return explicit;
  const month = value.match(/\b(\d{1,2})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i);
  if (!month) return undefined;
  const year = Number(referenceDate.match(/^\d{4}/)?.[0]);
  if (!year) return undefined;
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const monthName = month[2].toLocaleLowerCase();
  const monthNumber = monthName === "setiembre" ? 9 : months.indexOf(monthName) + 1;
  const time = referenceDate.match(/T(\d\d:\d\d(?::\d\d)?)/)?.[1] ?? "00:00:00";
  return `${year}-${String(monthNumber).padStart(2, "0")}-${month[1].padStart(2, "0")}T${time}`;
}
function priceFrom(offers: unknown[]): ExtractedDetail["price"] | undefined {
  const records = offers.filter(isRecord);
  const mins = records.map((offer) => number(offer.lowPrice ?? offer.minPrice ?? offer.price)).filter((value): value is number => value !== undefined);
  const maxs = records.map((offer) => number(offer.highPrice ?? offer.maxPrice ?? offer.price)).filter((value): value is number => value !== undefined);
  if (!mins.length && !maxs.length) return undefined;
  const currencies = records.map((offer) => offer.priceCurrency ?? offer.PriceCurrency ?? offer.currency).find((value): value is string => typeof value === "string");
  return { min: mins.length ? Math.min(...mins) : undefined, max: maxs.length ? Math.max(...maxs) : undefined, ...(currencies ? { currency: currencies } : {}) };
}
function number(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}
function coordinate(value: unknown, min: number, max: number): number | undefined {
  const parsed = number(value);
  return parsed !== undefined && parsed >= min && parsed <= max ? parsed : undefined;
}
function image(value: unknown): string | undefined {
  const candidates = values(value).flatMap((item) => {
    if (typeof item === "string") return [item];
    if (isRecord(item)) return [item.url, item.contentUrl].filter((url): url is string => typeof url === "string");
    return [];
  });
  return candidates.find(isHttpsUrl);
}
function isHttpsUrl(value: string): boolean { try { const url = new URL(value); return url.protocol === "https:" && Boolean(url.hostname); } catch { return false; } }
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value && typeof value === "object"); }
function values(value: unknown): unknown[] { return Array.isArray(value) ? value : value === undefined ? [] : [value]; }
function nameOf(value: unknown): string | undefined { return typeof value === "string" ? value : isRecord(value) && typeof value.name === "string" ? value.name : undefined; }
function unique(valuesToDeduplicate: string[]): string[] { return [...new Set(valuesToDeduplicate)]; }
function asEvents(value: unknown): Record<string, any>[] { if (!isRecord(value)) return []; const graph = Array.isArray(value["@graph"]) ? value["@graph"] : [value]; return graph.filter((item): item is Record<string, any> => isRecord(item) && values(item["@type"]).some((type) => type === "Event" || type === "https://schema.org/Event")); }
function dateFrom(value: string): string | undefined { return value.match(/\d{4}-\d\d-\d\d(?:[T ][^\s<]+)?/)?.[0] ?? value.match(/\d{1,2}[/-]\d{1,2}[/-]\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/)?.[0]; }
function addPerformance(list: ExtractedDetail["performances"], candidate: PerformanceCandidate, errors: string[]): void {
  const candidateInstant = instantKey(candidate.date);
  if (candidateInstant === undefined) {
    errors.push(`invalid_performance_date: ${candidate.date}`);
    return;
  }
  const existing = list.find((item) => {
    if (item.date === candidate.date) return true;
    const existingInstant = instantKey(item.date);
    return existingInstant !== undefined && candidateInstant !== undefined && existingInstant === candidateInstant;
  });
  if (!existing) {
    const { saleRank: _saleRank, ...performance } = candidate;
    list.push(performance);
    if (_saleRank !== undefined) saleRanks.set(list[list.length - 1], _saleRank);
    return;
  }
  const currentRank = statusRank(existing.status);
  const candidateRank = statusRank(candidate.status);
  if (candidateRank > currentRank) existing.status = candidate.status;
  if (candidate.purchase_url && (!existing.purchase_url || (candidate.saleRank ?? 0) > (saleRanks.get(existing) ?? 0))) {
    existing.purchase_url = candidate.purchase_url;
    existing.performance_code = candidate.performance_code;
    if (candidate.saleRank !== undefined) saleRanks.set(existing, candidate.saleRank);
  } else if (!existing.performance_code && candidate.performance_code) existing.performance_code = candidate.performance_code;
}
function statusRank(status: EventStatus): number { return status === "available" ? 4 : status === "upcoming" ? 3 : status === "sold_out" ? 2 : 1; }
function saleRank(value: string): number {
  return /venta\s+general|venta\s+normal|general sale/i.test(value) ? 2 : /preventa|banco|medio\s+de\s+pago|tarjeta/i.test(value) ? 1 : 0;
}
function queueCode(value: string, baseUrl: string): string | undefined {
  const allowed = allowedPurchaseUrl(value, baseUrl);
  return allowed?.match(QUEUE)?.[1] ?? allowed?.match(BUY)?.[1];
}
// Publication identity requires an explicit publication/event marker; function queue links are never evidence for source_code.
function publicationCode($: cheerio.CheerioAPI): string | undefined {
  const explicitCode = $(PUBLICATION_CODE_SELECTOR).filter((_, node) => !$(node).closest(FUNCTION_BLOCK_SELECTOR).length)
    .map((_, node) => $(node).attr("data-publication-code") ?? $(node).attr("data-source-code") ?? $(node).attr("data-event-code") ?? "")
    .get().map((value) => value.trim()).find(Boolean);
  if (explicitCode) return explicitCode;
  return $("meta[name='publication-code'], meta[name='source-code'], meta[name='event-code']")
    .map((_, node) => $(node).attr("content")?.trim() ?? "").get().find(Boolean);
}
function publicationPurchaseUrl($: cheerio.CheerioAPI, baseUrl: string): string | undefined {
  return $("[data-publication-purchase-url], [data-event-purchase-url]")
    .filter((_, node) => !$(node).closest(FUNCTION_BLOCK_SELECTOR).length)
    .map((_, node) => $(node).attr("data-publication-purchase-url") ?? $(node).attr("data-event-purchase-url") ?? "")
    .get().map((value) => allowedPurchaseUrl(value, baseUrl)).find((value): value is string => Boolean(value));
}
function publicationAvailabilityEvidence($: cheerio.CheerioAPI, baseUrl: string): RawEventDetail["availability_evidence"] | undefined {
  const hasPurchaseLink = $("a[href], button, [role='button'], [data-buyLink]").toArray().some((node) => {
    const current = $(node);
    const href = attrCaseInsensitive(current, "data-buyLink") ?? current.attr("href");
    return isVisibleEnabled(current) && Boolean(href && allowedPurchaseUrl(href, baseUrl));
  });
  return hasPurchaseLink ? { status: "available", reason: "valid_publication_purchase_link" } : undefined;
}
function offerAvailability(value: unknown): string { return values(value).map((offer) => isRecord(offer) ? String(offer.availability ?? offer.Availability ?? "") : "").join(" "); }
function offerUrl(value: unknown, baseUrl: string): string | undefined {
  return values(value).map((offer) => isRecord(offer) ? offer.url ?? offer.purchaseUrl ?? offer.purchase_url : undefined)
    .filter((url): url is string => typeof url === "string")
    .find((url) => Boolean(allowedPurchaseUrl(url, baseUrl)));
}
function offersInEvent(event: Record<string, any>): unknown[] { return [...values(event.offers), ...values(event.subEvent).filter(isRecord).flatMap(offersInEvent)]; }

function firstEnabledPurchaseLink(current: cheerio.Cheerio<AnyNode>): cheerio.Cheerio<AnyNode> | undefined {
  const directHref = attrCaseInsensitive(current, "data-buyLink") ?? attrCaseInsensitive(current, "data-purchase-url");
  if (directHref && current.is("a, button, [role='button']") && isVisibleEnabled(current)) return current;
  const links = current.find("a[href], button, [role='button'], [data-buyLink]").toArray().map((node) => current.find(node));
  return links.find(isVisibleEnabled);
}

function isVisibleEnabled(current: cheerio.Cheerio<AnyNode>): boolean {
  if (!current.length) return false;
  if (current.is("[disabled], [hidden], [aria-disabled='true'], [aria-hidden='true']")) return false;
  const style = (current.attr("style") ?? "").replace(/\s+/g, "").toLowerCase();
  if (/(?:^|;)display:none(?:;|$)|(?:^|;)visibility:hidden(?:;|$)/.test(style)) return false;
  if (current.attr("type")?.toLowerCase() === "hidden") return false;
  return !current.parents("[disabled], [hidden], [aria-disabled='true'], [aria-hidden='true']").toArray().some((node) => !current.is(node));
}

function attrCaseInsensitive(current: cheerio.Cheerio<AnyNode>, name: string): string | undefined {
  const target = name.toLowerCase();
  const node = current.get(0) as AnyNode & { attribs?: Record<string, string> } | undefined;
  if (!node?.attribs) return undefined;
  const key = Object.keys(node.attribs).find((candidate) => candidate.toLowerCase() === target);
  return key ? node.attribs[key] : undefined;
}

function safeHorasPorFecha(html: string, baseUrl: string): { performances: PerformanceCandidate[]; errors: string[] } {
  const literal = jsonLiteralAfterName(html, "horasPorFecha");
  if (!literal) return { performances: [], errors: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(literal);
  } catch {
    return { performances: [], errors: [AMBIGUOUS_PURCHASE_MAPPING] };
  }
  const records = values(parsed).flatMap((item) => isRecord(item) ? values(item.horas ?? item.Horas ?? item.funciones ?? item.Funciones ?? item).filter(isRecord) : []);
  const performances: PerformanceCandidate[] = [];
  for (const record of records) {
    const disabled = booleanField(record, "Disabled");
    const date = stringField(record, "Fecha");
    const time = stringField(record, "Hora");
    const url = stringField(record, "URL");
    const code = stringField(record, "Codigo");
    const calendar = stringField(record, "Calendario");
    if (disabled !== false || !date || !time || !url || !code || !calendar) continue;
    const purchaseUrl = allowedPurchaseUrl(url, baseUrl);
    const performanceCode = purchaseUrl ? queueCode(purchaseUrl, baseUrl) : undefined;
    if (!purchaseUrl || performanceCode !== code || calendarCode(purchaseUrl) !== calendar) continue;
    const startsAt = structuredDateTime(date, time);
    if (startsAt) performances.push({ date: startsAt, status: "available", performance_code: performanceCode, purchase_url: url });
  }
  return { performances, errors: [] };
}

function jsonLiteralAfterName(html: string, name: string): string | undefined {
  const marker = new RegExp(`\\b${name}\\b\\s*=\\s*`, "u").exec(html);
  if (!marker) return undefined;
  const start = marker.index + marker[0].length;
  const first = html[start];
  if (first !== "[" && first !== "{") return undefined;
  const limit = Math.min(html.length, start + 50000);
  let depth = 0;
  let quote: "\"" | undefined;
  let escaped = false;
  for (let index = start; index < limit; index += 1) {
    const char = html[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === "\"") quote = char;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return html.slice(start, index + 1);
    }
  }
  return undefined;
}

function stringField(record: Record<string, any>, name: string): string | undefined {
  const value = field(record, name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanField(record: Record<string, any>, name: string): boolean | undefined {
  const value = field(record, name);
  return typeof value === "boolean" ? value : undefined;
}

function field(record: Record<string, any>, name: string): unknown {
  const target = fieldKey(name);
  const key = Object.keys(record).find((candidate) => fieldKey(candidate) === target);
  return key ? record[key] : undefined;
}

function calendarCode(value: string): string | undefined {
  return new URL(value, "https://www.puntoticket.com").pathname.match(/\/cal\/([^/?#]+)/i)?.[1];
}

function fieldKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function structuredDateTime(date: string, time: string): string | undefined {
  const isoDate = date.match(/^(\d{4})-(\d\d)-(\d\d)$/);
  const slashDate = date.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const timeMatch = time.match(/^(\d{1,2}):(\d\d)(?::(\d\d))?$/);
  if (!timeMatch) return undefined;
  const parts = isoDate ? [isoDate[1], isoDate[2], isoDate[3]] : slashDate ? [slashDate[3], slashDate[2].padStart(2, "0"), slashDate[1].padStart(2, "0")] : undefined;
  if (!parts) return undefined;
  return `${parts[0]}-${parts[1]}-${parts[2]}T${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:${timeMatch[3] ?? "00"}`;
}
