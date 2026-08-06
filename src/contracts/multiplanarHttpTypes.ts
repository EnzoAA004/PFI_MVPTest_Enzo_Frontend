import type { StudyMetadataInput } from "../appTypes";
import type { StudySeriesSummary } from "./inputApiTypes";

/**
 * DTO HTTP legítimo para el corredor multiplanar: solicitud de corrida y
 * endpoints de diagnóstico. No tipa respuestas de corrida (eso es
 * CanonicalMultiplanarRun, src/contracts/canonicalMultiplanarRun.ts) ni
 * pasa por interpretación v1/v2 (eso vive en multiplanarRunAdapter.ts).
 */

export type AssetName = "input.png" | "overlay.png" | "mask-preview.png";

export type DiagnosticEndpointResponse = Record<string, unknown> & {
  status?: string;
  message?: string;
  service?: string;
  proxiedByBackend?: boolean;
  readyForDemo?: boolean;
  readyForRealInference?: boolean;
  defaultInferenceMode?: string;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};

/**
 * Solicitud real de POST /api/ai/multiplanar/run. El frontend opera
 * exclusivamente con el identificador opaco devuelto por
 * POST /api/ai/inputs; nunca con rutas de archivo del sistema local. La
 * variante legacy basada en rutas de archivo no tuvo nunca un consumidor
 * real en este frontend y fue retirada en P9-C.4.
 */
export type MultiplanarRunRequest = {
  caseId: string;
  studyMetadata?: StudyMetadataInput;
  sagittalInputId: string;
  axialInputId?: string;
  sagittalModelKey?: string;
  axialModelKey?: string;
  allowContractFallback: boolean;
  /**
   * Todas las series del estudio, para que la sala de lectura pueda ofrecerlas.
   *
   * Ausente cuando el análisis se armó con dos archivos por plano en vez de un estudio
   * completo: ahí no hay catálogo, y es un caso legítimo y no una omisión.
   */
  studySeries?: StudySeriesSummary[];
  metadata?: Record<string, unknown>;
};

export type MultiplanarRunPayload = MultiplanarRunRequest;
