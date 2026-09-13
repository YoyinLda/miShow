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
