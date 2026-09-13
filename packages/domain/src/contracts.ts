export type EventStatus = "available" | "sold_out" | "upcoming" | "unknown";

export interface RawEventReference {
  source_url: string;
  title?: string;
}

export interface RawEventDetail {
  source_url: string;
  html: string;
  json_ld: unknown[];
  source_code?: string;
  purchase_url?: string;
  availability_evidence?: {
    status: EventStatus;
    reason: "valid_publication_purchase_link";
  };
}

export interface EventPerformance {
  starts_at: string;
  timezone: string;
  status: EventStatus;
  performance_code?: string;
  purchase_url?: string;
}

export interface NormalizedEvent {
  source: "puntoticket";
  source_url: string;
  extracted_at: string;
  purchase_url?: string;
  source_code?: string;
  image_url?: string;
  name: string;
  artists: string[];
  venue?: { name?: string; address?: string; city?: string; latitude?: number; longitude?: number };
  performances: EventPerformance[];
  status: EventStatus;
  price?: { min?: number; max?: number; currency?: string };
}

export interface ExtractionResult<T> {
  value?: T;
  errors: string[];
}
