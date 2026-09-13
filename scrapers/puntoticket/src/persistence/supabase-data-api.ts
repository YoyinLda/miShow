import {
  SupabaseEventPersistence as CoreSupabaseEventPersistence,
  createSupabaseRpcTransport,
  supabaseServerConfig,
  type RpcRequest,
  type RpcTransport,
  type SupabaseServerConfig
} from "@mishow/scraper-core";
import { puntoticketAdapter } from "../adapter.js";

export { createSupabaseRpcTransport, supabaseServerConfig, type RpcRequest, type RpcTransport, type SupabaseServerConfig };

/** Adaptador de persistencia Supabase ligado a la fuente PuntoTicket. */
export class SupabaseEventPersistence extends CoreSupabaseEventPersistence {
  constructor(rpc: RpcTransport, maxRetries = 2) {
    super(puntoticketAdapter, rpc, maxRetries);
  }
}
