import type { ExtractionResult, RawEventDetail, SourceUrlOptions } from "@mishow/domain";
import { extractJsonLdDetail, parseJsonLdDetail, type ExtractedDetail } from "@mishow/scraper-core";

const HOST = "www.ticketmaster.cl";
const URL_OPTIONS: SourceUrlOptions = {
  host: HOST,
  // Ticketmaster no expone URLs de compra internas seguibles en el detalle; sin
  // patrones de compra, ninguna oferta se convierte en purchase_url. La compra
  // vive detrás de la landing del evento y no se sigue.
  purchasePathPatterns: []
};

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};

export function parseEventDetail(html: string, sourceUrl: string): ExtractionResult<RawEventDetail> {
  return parseJsonLdDetail(html, sourceUrl, URL_OPTIONS);
}

export function extractDetail(detail: RawEventDetail): ExtractionResult<ExtractedDetail> {
  return extractJsonLdDetail(detail, URL_OPTIONS, { descriptionDate: dateFromDescription });
}

/**
 * Deriva una fecha ISO (local, sin offset) desde una descripción con el patrón
 * español "DD de Mes YYYY" cuando el JSON-LD no trae `startDate`. La hora se
 * asume 00:00:00; la normalización posterior fija America/Santiago.
 */
export function dateFromDescription(description: string): string | undefined {
  const match = description.match(/\b(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(?:de\s+)?(\d{4})\b/i);
  if (!match) return undefined;
  const day = Number(match[1]);
  const monthName = match[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  const month = MONTHS[monthName];
  const year = Number(match[3]);
  if (!month || day < 1 || day > 31) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`;
}
