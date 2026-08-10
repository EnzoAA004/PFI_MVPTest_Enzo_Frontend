import { parseDiscDegenerativeFindingsResponse, type DiscFinding } from "./features/reading/discDegenerativeFindings";
import { multiplanarRequest } from "./multiplanarApi";

export type ProductSourceRole = "sagittal_t1" | "sagittal_t2";

export type DiscLocalization = Record<string, unknown>;

export type SeriesSegmentationRequest = {
  caseId: string;
  inputId: string;
  plane: "sagittal";
  modelKey: "sagittal_spider";
};

export type SeriesSegmentationResult = {
  runId: string;
  caseId: string;
  inputId: string;
  plane: "sagittal";
  modelKey: "sagittal_spider";
  status: "completed";
  coverageComplete: true;
  sliceCount: number;
  segmentedSliceCount: number;
  discLocalizations: DiscLocalization[];
  humanReviewRequired: true;
  notClinicalDiagnosis: true;
};

export type DiscSegmentationSource = {
  role: ProductSourceRole;
  inputId: string;
  segmentationRunId: string;
};

export type DiscDegenerativeFindingsRequest = {
  multiplanarRunId: string;
  caseId: string;
  sources: DiscSegmentationSource[];
};

export type DiscDegenerativeFindingsResult = {
  findings: DiscFinding[];
  humanReviewRequired: true;
  notClinicalDiagnosis: true;
  autonomousDiagnosis: false;
};

export class ProductAnalysisContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductAnalysisContractError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProductAnalysisContractError(`Contrato P10.9 inválido: falta ${field}.`);
  }
  return value.trim();
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProductAnalysisContractError(`Contrato P10.9 inválido: ${field} no es válido.`);
  }
  return value;
}

export function parseSeriesSegmentationResponse(
  value: unknown,
  request: SeriesSegmentationRequest,
): SeriesSegmentationResult {
  const raw = asRecord(value);
  if (!raw || raw.schemaVersion !== "pfi.full-series-segmentation.v1") {
    throw new ProductAnalysisContractError("Contrato P10.9 inválido: schemaVersion inesperado.");
  }
  if (raw.status !== "completed" || raw.coverageComplete !== true) {
    throw new ProductAnalysisContractError("La segmentación full-series no informó cobertura completa.");
  }
  if (raw.humanReviewRequired !== true || raw.notClinicalDiagnosis !== true) {
    throw new ProductAnalysisContractError("La segmentación full-series omitió sus flags de seguridad.");
  }

  const runId = requiredText(raw.runId, "runId");
  const caseId = requiredText(raw.caseId, "caseId");
  const inputId = requiredText(raw.inputId, "inputId");
  const plane = requiredText(raw.plane, "plane");
  const modelKey = requiredText(raw.modelKey, "modelKey");
  if (caseId !== request.caseId || inputId !== request.inputId || plane !== request.plane || modelKey !== request.modelKey) {
    throw new ProductAnalysisContractError("La segmentación full-series no corresponde a la fuente solicitada.");
  }

  const sliceCount = requiredPositiveInteger(raw.sliceCount, "sliceCount");
  const segmentedSliceCount = requiredPositiveInteger(raw.segmentedSliceCount, "segmentedSliceCount");
  if (sliceCount !== segmentedSliceCount || !Array.isArray(raw.slices) || raw.slices.length !== sliceCount) {
    throw new ProductAnalysisContractError("La segmentación full-series devolvió cobertura incompleta.");
  }
  if (!Array.isArray(raw.discLocalizations)) {
    throw new ProductAnalysisContractError("La segmentación sagital no devolvió discLocalizations.");
  }
  const discLocalizations = raw.discLocalizations.map((item) => {
    const localization = asRecord(item);
    if (!localization) throw new ProductAnalysisContractError("discLocalizations contiene un elemento inválido.");
    return localization;
  });

  return {
    runId,
    caseId,
    inputId,
    plane: "sagittal",
    modelKey: "sagittal_spider",
    status: "completed",
    coverageComplete: true,
    sliceCount,
    segmentedSliceCount,
    discLocalizations,
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
  };
}

export async function runProductSeriesSegmentation(
  payload: SeriesSegmentationRequest,
): Promise<SeriesSegmentationResult> {
  const raw = await multiplanarRequest<unknown>("/api/ai/v2/product/series-segmentation", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parseSeriesSegmentationResponse(raw, payload);
}

export async function runProductDiscDegenerativeFindings(
  payload: DiscDegenerativeFindingsRequest,
): Promise<DiscDegenerativeFindingsResult> {
  const raw = await multiplanarRequest<unknown>("/api/ai/v2/product/disc-degenerative-findings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return {
    findings: parseDiscDegenerativeFindingsResponse(raw, payload.multiplanarRunId),
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    autonomousDiagnosis: false,
  };
}
