import type { StudyIngestionResponse, StudyPlaneInput } from "../../contracts/inputApiTypes";
import { BackendApiError } from "../../multiplanarApi";
import {
  runProductDiscDegenerativeFindings,
  runProductSeriesSegmentation,
  type DiscLocalization,
  type DiscSegmentationSource,
  type ProductSourceRole,
  type SeriesSegmentationRequest,
  type SeriesSegmentationResult,
} from "../../productAnalysisApi";

export type ProductFlowPhase =
  | "preparing_series"
  | "segmenting_t1"
  | "segmenting_t2"
  | "analyzing_findings"
  | "completed"
  | "degraded"
  | "error";

export type ProductSeriesState = {
  role: ProductSourceRole;
  inputId?: string;
  segmentationRunId?: string;
  status: "unavailable" | "pending" | "segmenting" | "completed" | "error";
  discLocalizations: DiscLocalization[];
  error?: string;
};

export type ProductAnalysisState = {
  phase: ProductFlowPhase;
  series: Record<ProductSourceRole, ProductSeriesState>;
  message: string;
  findingsCount?: number;
  retryable: boolean;
  failureStage?: "series_segmentation" | "disc_findings";
  preparedFor?: { caseId: string; multiplanarRunId: string };
};

export type ProductAnalysisDependencies = {
  runSeriesSegmentation: (payload: SeriesSegmentationRequest) => Promise<SeriesSegmentationResult>;
  runDiscFindings: typeof runProductDiscDegenerativeFindings;
};

const defaultDependencies: ProductAnalysisDependencies = {
  runSeriesSegmentation: runProductSeriesSegmentation,
  runDiscFindings: runProductDiscDegenerativeFindings,
};

function initialSeries(role: ProductSourceRole, input?: StudyPlaneInput): ProductSeriesState {
  return {
    role,
    inputId: input?.inputId,
    status: input?.inputId ? "pending" : "unavailable",
    discLocalizations: [],
  };
}

export function initialProductAnalysisState(study?: Pick<StudyIngestionResponse, "sagittalT1" | "sagittalT2">): ProductAnalysisState {
  return {
    phase: "preparing_series",
    series: {
      sagittal_t1: initialSeries("sagittal_t1", study?.sagittalT1),
      sagittal_t2: initialSeries("sagittal_t2", study?.sagittalT2),
    },
    message: "Preparando series sagitales T1 y T2.",
    retryable: false,
  };
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "El servicio no devolvió un resultado utilizable.";
}

function retryableError(error: unknown): boolean {
  return error instanceof BackendApiError && (error.status === 502 || error.status === 504);
}

function technicalFailureMessage(error: unknown, stage: "series_segmentation" | "disc_findings"): string {
  if (stage === "disc_findings" && error instanceof BackendApiError && error.status === 504) {
    return "El análisis de hallazgos discales agotó el tiempo de espera. La segmentación quedó guardada y podés reintentar únicamente esta clasificación.";
  }
  if (stage === "disc_findings" && error instanceof BackendApiError && error.status === 502) {
    return "El servicio de análisis discal no está disponible en este momento. La segmentación quedó guardada y podés reintentar únicamente esta clasificación.";
  }
  if (retryableError(error)) {
    return "El servicio de IA no está disponible en este momento. La corrida principal permanece guardada y podés reintentar.";
  }
  return stage === "disc_findings"
    ? `No se pudieron completar los hallazgos discales: ${safeMessage(error)}`
    : `No se pudo completar la segmentación: ${safeMessage(error)}`;
}

function reusableDiscSources(
  caseId: string,
  multiplanarRunId: string,
  study: Pick<StudyIngestionResponse, "sagittalT1" | "sagittalT2"> | undefined,
  state: ProductAnalysisState,
): DiscSegmentationSource[] {
  if (state.preparedFor?.caseId !== caseId || state.preparedFor.multiplanarRunId !== multiplanarRunId) return [];
  const sourceFor = (role: ProductSourceRole, input?: StudyPlaneInput) => {
    const prepared = state.series[role];
    if (
      !input?.inputId
      || input.caseId !== caseId
      || prepared.role !== role
      || prepared.inputId !== input.inputId
      || prepared.status !== "completed"
      || !prepared.segmentationRunId?.trim()
      || prepared.discLocalizations.length === 0
    ) return undefined;
    return { role, inputId: input.inputId, segmentationRunId: prepared.segmentationRunId };
  };
  return [
    sourceFor("sagittal_t1", study?.sagittalT1),
    sourceFor("sagittal_t2", study?.sagittalT2),
  ].filter((source): source is DiscSegmentationSource => Boolean(source));
}

export type ProductRetryLock = { current: boolean };

/** Evita que dos activaciones del CTA disparen dos clasificaciones simultáneas. */
export async function runSingleProductRetry<T>(
  lock: ProductRetryLock,
  retry: () => Promise<T>,
): Promise<T | undefined> {
  if (lock.current) return undefined;
  lock.current = true;
  try {
    return await retry();
  } finally {
    lock.current = false;
  }
}

/** Reintenta únicamente la clasificación a partir de segmentaciones completas. */
export async function retryDiscFindingsFromPreparedSources(
  params: {
    caseId: string;
    multiplanarRunId: string;
    study?: Pick<StudyIngestionResponse, "sagittalT1" | "sagittalT2">;
    state: ProductAnalysisState;
    onState?: (state: ProductAnalysisState) => void;
  },
  dependencies: ProductAnalysisDependencies = defaultDependencies,
): Promise<ProductAnalysisState> {
  const sources = reusableDiscSources(params.caseId, params.multiplanarRunId, params.study, params.state);
  if (!sources.length) {
    const unavailable = {
      ...params.state,
      phase: "error" as const,
      retryable: false,
      failureStage: "disc_findings" as const,
      message: "Las fuentes segmentadas ya no están disponibles para reintentar los hallazgos discales.",
    };
    params.onState?.(unavailable);
    return unavailable;
  }

  const analyzing = {
    ...params.state,
    phase: "analyzing_findings" as const,
    retryable: false,
    failureStage: undefined,
    message: "Analizando hallazgos discales con las segmentaciones ya preparadas.",
  };
  params.onState?.(analyzing);
  try {
    const result = await dependencies.runDiscFindings({
      multiplanarRunId: params.multiplanarRunId,
      caseId: params.caseId,
      sources,
    });
    const complete = Boolean(params.study?.sagittalT1?.inputId && params.study?.sagittalT2?.inputId && sources.length === 2);
    const finished = {
      ...analyzing,
      phase: complete ? "completed" as const : "degraded" as const,
      findingsCount: result.findings.length,
      retryable: false,
      message: complete
        ? `Hallazgos discales completados y guardados: ${result.findings.length} resultados listos para revisión.`
        : `Hallazgos discales completados con ${sources.length} fuente disponible. La modalidad faltante no se sustituyó.`,
    };
    params.onState?.(finished);
    return finished;
  } catch (error) {
    const failed = {
      ...analyzing,
      phase: "error" as const,
      retryable: retryableError(error),
      failureStage: "disc_findings" as const,
      message: technicalFailureMessage(error, "disc_findings"),
    };
    params.onState?.(failed);
    return failed;
  }
}

export async function runP109ProductFlow(
  params: {
    caseId: string;
    multiplanarRunId: string;
    study?: Pick<StudyIngestionResponse, "sagittalT1" | "sagittalT2">;
    onState?: (state: ProductAnalysisState) => void;
  },
  dependencies: ProductAnalysisDependencies = defaultDependencies,
): Promise<ProductAnalysisState> {
  let state: ProductAnalysisState = {
    ...initialProductAnalysisState(params.study),
    preparedFor: { caseId: params.caseId, multiplanarRunId: params.multiplanarRunId },
  };
  const publish = (next: ProductAnalysisState) => {
    state = next;
    params.onState?.(next);
  };
  publish(state);

  const candidates: { role: ProductSourceRole; input: StudyPlaneInput; phase: ProductFlowPhase }[] = [];
  if (params.study?.sagittalT1?.inputId) candidates.push({ role: "sagittal_t1", input: params.study.sagittalT1, phase: "segmenting_t1" });
  if (params.study?.sagittalT2?.inputId) candidates.push({ role: "sagittal_t2", input: params.study.sagittalT2, phase: "segmenting_t2" });

  if (!candidates.length) {
    const degraded = {
      ...state,
      phase: "degraded" as const,
      message: "La corrida principal está lista, pero no hay series sagitales T1/T2 explícitas para analizar hallazgos discales.",
    };
    publish(degraded);
    return degraded;
  }

  const successfulSources: DiscSegmentationSource[] = [];
  let hasRetryableSegmentationError = false;
  for (const candidate of candidates) {
    publish({
      ...state,
      phase: candidate.phase,
      message: candidate.role === "sagittal_t1" ? "Segmentando la serie Sagittal T1 completa." : "Segmentando la serie Sagittal T2 completa.",
      series: {
        ...state.series,
        [candidate.role]: { ...state.series[candidate.role], status: "segmenting", error: undefined },
      },
    });
    try {
      const segmentation = await dependencies.runSeriesSegmentation({
        caseId: params.caseId,
        inputId: candidate.input.inputId,
        plane: "sagittal",
        modelKey: "sagittal_spider",
      });
      successfulSources.push({
        role: candidate.role,
        inputId: candidate.input.inputId,
        segmentationRunId: segmentation.runId,
      });
      publish({
        ...state,
        series: {
          ...state.series,
          [candidate.role]: {
            ...state.series[candidate.role],
            status: "completed",
            segmentationRunId: segmentation.runId,
            discLocalizations: segmentation.discLocalizations,
          },
        },
      });
    } catch (error) {
      hasRetryableSegmentationError ||= retryableError(error);
      publish({
        ...state,
        series: {
          ...state.series,
          [candidate.role]: {
            ...state.series[candidate.role],
            status: "error",
            error: technicalFailureMessage(error, "series_segmentation"),
          },
        },
      });
    }
  }

  if (!successfulSources.length) {
    const failed = {
      ...state,
      phase: "error" as const,
      retryable: hasRetryableSegmentationError,
      failureStage: "series_segmentation" as const,
      message: "No se pudo segmentar ninguna fuente T1/T2. La corrida multiplanar permanece disponible.",
    };
    publish(failed);
    return failed;
  }

  publish({ ...state, phase: "analyzing_findings", message: "Analizando hallazgos discales." });
  try {
    const result = await dependencies.runDiscFindings({
      multiplanarRunId: params.multiplanarRunId,
      caseId: params.caseId,
      sources: successfulSources,
    });
    const complete = candidates.length === 2 && successfulSources.length === 2;
    const finished = {
      ...state,
      phase: complete ? "completed" as const : "degraded" as const,
      findingsCount: result.findings.length,
      retryable: false,
      message: complete
        ? `Hallazgos discales completados y guardados: ${result.findings.length} resultados listos para revisión.`
        : `Hallazgos discales completados con ${successfulSources.length} fuente disponible. La modalidad faltante o fallida no se sustituyó.`,
    };
    publish(finished);
    return finished;
  } catch (error) {
    const failed = {
      ...state,
      phase: "error" as const,
      retryable: retryableError(error),
      failureStage: "disc_findings" as const,
      message: technicalFailureMessage(error, "disc_findings"),
    };
    publish(failed);
    return failed;
  }
}
