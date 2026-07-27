/**
 * DTO HTTP legítimo para POST/GET /api/ai/runs/{id}/review. No es dominio
 * canónico (src/contracts/canonicalMultiplanarRun.ts) ni tipo de corrida
 * legacy: es la forma exacta que el backend de revisión espera/devuelve.
 */

export type RunReviewStatus = "pending" | "accepted" | "observed" | "rejected" | "edited";

export type ReviewCorrectionValue = {
  value: number | string | null;
  unit?: string;
};

export type RunReviewCorrection = Record<string, unknown> & {
  measurementId?: string;
  /** Clave canónica (CanonicalMeasurement.labelKey), nunca texto traducido. */
  labelKey?: string;
  /** Solo por compatibilidad con el DTO legacy que todavía únicamente admite "label"; ver reviewCorrectionsFrom(). */
  label?: string;
  beforeValue?: ReviewCorrectionValue;
  afterValue?: ReviewCorrectionValue;
  comment?: string;
};

export type RunReviewRequest = {
  reviewStatus: RunReviewStatus;
  reviewer: string;
  comments?: string;
  corrections?: RunReviewCorrection[];
};

export type RunReviewResponse = {
  reviewStatus: RunReviewStatus;
  reviewer: string;
  reviewedAt?: string;
  comments?: string;
  corrections?: RunReviewCorrection[];
};
