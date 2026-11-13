import {
  HttpAcquisitionError,
  HttpClient,
  createFetchTransport,
  type HttpClientOptions,
  type SourceAdapter,
  type HttpErrorCode,
  type HttpTransport,
  type HttpTransportRequest,
  type HttpTransportResponse,
  type Sleep
} from "@mishow/scraper-core";
import { puntoticketAdapter } from "../adapter.js";

export {
  HttpAcquisitionError,
  createFetchTransport,
  type HttpErrorCode,
  type HttpTransport,
  type HttpTransportRequest,
  type HttpTransportResponse,
  type Sleep
};

export type PuntoTicketHttpClientOptions = Omit<HttpClientOptions, "adapter"> & {
  /** Adapter a usar; por defecto `puntoticketAdapter` (sin discovery). */
  adapter?: SourceAdapter;
};

/** Cliente HTTP ligado al adapter de PuntoTicket. */
export class PuntoTicketHttpClient extends HttpClient {
  constructor(options: PuntoTicketHttpClientOptions) {
    super({ ...options, adapter: options.adapter ?? puntoticketAdapter });
  }
}
