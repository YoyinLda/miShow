import {
  AcquisitionPolicyError,
  acquisitionConfig as coreAcquisitionConfig,
  acquisitionDefaults,
  safeUrlForError,
  validateAcquisitionUrl as coreValidateAcquisitionUrl,
  type AcquisitionConfig,
  type AcquisitionStage,
  type AcquisitionUrlContext,
  type ResilienceConfig
} from "@mishow/scraper-core";
import { ticketmasterAdapter } from "../adapter.js";

export {
  AcquisitionPolicyError,
  safeUrlForError,
  type AcquisitionConfig,
  type AcquisitionStage,
  type AcquisitionUrlContext
};

export const TICKETMASTER_ACQUISITION_DEFAULTS = acquisitionDefaults(ticketmasterAdapter);

export function acquisitionConfig(input: Partial<AcquisitionConfig> = {}): AcquisitionConfig {
  return coreAcquisitionConfig(ticketmasterAdapter, input);
}

export function validateAcquisitionUrl(value: string, stage: AcquisitionStage, baseUrl?: string, context: AcquisitionUrlContext = {}): string {
  return coreValidateAcquisitionUrl(ticketmasterAdapter, value, stage, baseUrl, context);
}

/**
 * Resiliencia de Ticketmaster (bugfix ticketmaster-scrape-failures, brief 008).
 * Defaults aprobados por TL/PO: D1 degraded ≥ 0.25 / failed ≥ 0.75, D2 mínimo
 * 10 referencias, jitter 0.5 y clasificación de bloqueos. Se pueden ajustar con
 * `TM_DEGRADED_RATIO`, `TM_FAILED_RATIO` y `TM_MIN_LISTING_REFS`.
 */
export function ticketmasterResilience(env: Record<string, string | undefined>): ResilienceConfig {
  const degradedRatio = envRatio(env, "TM_DEGRADED_RATIO", 0.25);
  const failedRatio = envRatio(env, "TM_FAILED_RATIO", 0.75);
  if (degradedRatio > failedRatio) throw new AcquisitionPolicyError("TM_DEGRADED_RATIO no puede ser mayor que TM_FAILED_RATIO.");
  return {
    classifyBlocking: true,
    jitterRatio: 0.5,
    minListingRefs: envCount(env, "TM_MIN_LISTING_REFS", 10),
    degradedRatio,
    failedRatio
  };
}

/** D3: ¿una corrida `partial` debe terminar con código de salida 1? Default `false`. */
export function failOnPartial(env: Record<string, string | undefined>): boolean {
  const raw = env.TM_FAIL_ON_PARTIAL?.trim().toLowerCase();
  if (raw === undefined || raw === "") return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new AcquisitionPolicyError("TM_FAIL_ON_PARTIAL debe ser true o false.");
}

function envRatio(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!/^\d+(\.\d+)?$/.test(raw) || value < 0 || value > 1) throw new AcquisitionPolicyError(`${name} debe ser un número entre 0 y 1.`);
  return value;
}

function envCount(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new AcquisitionPolicyError(`${name} debe ser un entero no negativo.`);
  return Number(raw);
}
