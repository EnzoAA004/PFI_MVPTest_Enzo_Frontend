export type Plane = "sagittal" | "axial";

export type ReviewStatus = "pendiente" | "aceptado" | "observado" | "descartado";

export interface PipelineRunRequest {
  caseId: string;
  plane: Plane;
  modelKey: string;
  inputPath?: string;
  imageRef?: string;
  metadata?: Record<string, unknown>;
}

export interface ReviewUpdateRequest {
  status: ReviewStatus;
  observations: string;
  notes?: string;
  reviewer?: string;
}

export interface ReviewStatusResponse {
  runId?: string;
  status?: ReviewStatus;
  observations?: string;
  notes?: string;
  reviewer?: string;
  reviewedAt?: string;
  updatedAt?: string;
}

export interface AgentDecision {
  priority?: "alta" | "media" | "baja";
  status?: "requiere_revision" | "listo_para_revision" | "sin_priorizacion" | string;
  flags?: string[];
  reasons?: string[];
  humanReviewRequired?: boolean;
}

export interface Measurement {
  id?: string;
  label?: string;
  value?: number | string;
  unit?: string;
  confidence?: number;
  plane?: Plane;
}

export interface AiRunResponse {
  runId?: string;
  caseId?: string;
  plane?: Plane;
  modelKey?: string;
  agentDecision?: AgentDecision;
  measurements?: Measurement[];
  overlayPath?: string;
  review?: ReviewStatusResponse;
  createdAt?: string;
}

export interface AiModel {
  key?: string;
  name?: string;
  version?: string;
  planes?: Plane[];
  enabled?: boolean;
}
