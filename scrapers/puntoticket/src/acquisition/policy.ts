import {
  AcquisitionPolicyError,
  acquisitionConfig as coreAcquisitionConfig,
  acquisitionDefaults,
  safeUrlForError,
  validateAcquisitionUrl as coreValidateAcquisitionUrl,
  type AcquisitionConfig,
  type AcquisitionStage,
  type AcquisitionUrlContext
} from "@mishow/scraper-core";
import { puntoticketAdapter } from "../adapter.js";

export {
  AcquisitionPolicyError,
  safeUrlForError,
  type AcquisitionConfig,
  type AcquisitionStage,
  type AcquisitionUrlContext
};

// Defaults ligados al adapter de PuntoTicket, preservando el nombre histórico
// que consumen el CLI y otros módulos.
export const PUNTOTICKET_ACQUISITION_DEFAULTS = acquisitionDefaults(puntoticketAdapter);

export function acquisitionConfig(input: Partial<AcquisitionConfig> = {}): AcquisitionConfig {
  return coreAcquisitionConfig(puntoticketAdapter, input);
}

export function validateAcquisitionUrl(value: string, stage: AcquisitionStage, baseUrl?: string, context: AcquisitionUrlContext = {}): string {
  return coreValidateAcquisitionUrl(puntoticketAdapter, value, stage, baseUrl, context);
}
