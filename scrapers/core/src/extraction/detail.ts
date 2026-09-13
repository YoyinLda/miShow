import type { EventStatus, RawEventDetail } from "@mishow/domain";

/**
 * Forma extraída común a todas las fuentes: el resultado intermedio entre el
 * detalle crudo (`RawEventDetail`) y el evento normalizado (`NormalizedEvent`).
 */
export interface ExtractedDetail {
  name?: string;
  artists: string[];
  image_url?: string;
  venue?: { name?: string; address?: string; city?: string; latitude?: number; longitude?: number };
  performances: Array<{ date: string; status: EventStatus; performance_code?: string; purchase_url?: string }>;
  availability_evidence?: RawEventDetail["availability_evidence"];
  price?: { min?: number; max?: number; currency?: string };
}
