import {
  SupabaseEventPersistence as CoreSupabaseEventPersistence,
  createSupabaseRpcTransport,
  supabaseServerConfig,
  type RpcRequest,
  type RpcTransport,
  type SupabaseServerConfig
} from "@mishow/scraper-core";
import { ticketmasterAdapter } from "../adapter.js";

export { createSupabaseRpcTransport, supabaseServerConfig, type RpcRequest, type RpcTransport, type SupabaseServerConfig };

/** Adaptador de persistencia Supabase ligado a la fuente Ticketmaster. */
export class SupabaseEventPersistence extends CoreSupabaseEventPersistence {
  constructor(rpc: RpcTransport, maxRetries = 2) {
    super(ticketmasterAdapter, rpc, maxRetries);
  }
}
