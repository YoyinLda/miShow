import {
  HttpAcquisitionError,
  HttpClient,
  createFetchTransport,
  type HttpClientOptions,
  type HttpErrorCode,
  type HttpTransport,
  type HttpTransportRequest,
  type HttpTransportResponse,
  type Sleep
} from "@mishow/scraper-core";
import { ticketmasterAdapter } from "../adapter.js";

export {
  HttpAcquisitionError,
  createFetchTransport,
  type HttpErrorCode,
  type HttpTransport,
  type HttpTransportRequest,
  type HttpTransportResponse,
  type Sleep
};

export type TicketmasterHttpClientOptions = Omit<HttpClientOptions, "adapter">;

/** Cliente HTTP ligado al adapter de Ticketmaster. */
export class TicketmasterHttpClient extends HttpClient {
  constructor(options: TicketmasterHttpClientOptions) {
    super({ ...options, adapter: ticketmasterAdapter });
  }
}
