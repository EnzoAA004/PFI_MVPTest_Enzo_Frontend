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

function technicalFailureMessage(error: unknown): string {
  if (retryableError(error)) {
    return "El servicio de IA no respondió o agotó el tiempo de espera. La corrida principal quedó guardada y podés reintentar P10.7.";
  }
  return `No se pudo completar P10.7: ${safeMessage(error)}`;
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
  let state = initialProductAnalysisState(params.study);
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
      message: "La corrida principal está lista, pero no hay series sagitales T1/T2 explícitas para ejecutar P10.7.",
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
            error: technicalFailureMessage(error),
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
      message: "No se pudo segmentar ninguna fuente T1/T2. La corrida multiplanar permanece disponible.",
    };
    publish(failed);
    return failed;
  }

  publish({ ...state, phase: "analyzing_findings", message: "Analizando hallazgos discales P10.7." });
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
        ? `P10.7 completado y persistido: ${result.findings.length} findings listos para revisión.`
        : `P10.7 completado con ${successfulSources.length} fuente disponible. La modalidad faltante o fallida no se sustituyó.`,
    };
    publish(finished);
    return finished;
  } catch (error) {
    const failed = {
      ...state,
      phase: "error" as const,
      retryable: retryableError(error),
      message: technicalFailureMessage(error),
    };
    publish(failed);
    return failed;
  }
}
