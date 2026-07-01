export type Plane = "sagittal" | "axial";

export type ReviewStatus = "pendiente" | "aceptado" | "observado" | "descartado";

export type Priority = "alta" | "media" | "baja";

export type ViewKey = "dashboard" | "review" | "history";

export interface PipelineRunRequest {
  caseId: string;
  plane: Plane;
  modelKey: string;
  inputPath?: string;
  metadata?: Record<string, unknown>;
  imageRef?: string;
  metadata?: Record<string, unknown>;
}

export interface ReviewUpdateRequest {
  status: ReviewStatus;
  notes?: string;
  observations?: string;
  reviewer?: string;
}

export interface ReviewStatusResponse {
  runId?: string;
  status?: ReviewStatus;
  notes?: string;
  observations?: string;
  reviewer?: string;
  reviewedAt?: string;
  updatedAt?: string;
}

export interface AgentDecision {
  agentStatus?: string;
  reviewPriority?: string;
  agentReasons?: string[];
  recommendedAction?: string;
  plane?: Plane;
  modelKey?: string;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
  status?: string;
  priority?: Priority;
  flags?: string[];
  reasons?: string[];
}

export interface RawMeasurements {
  status?: string;
  values?: unknown[];
  source?: string;
  description?: string;
}

export interface Measurement {
  id: string;
  label: string;
  value: number | string;
  unit: string;
  confidence?: number;
  plane?: Plane;
  source: "AI" | "Reviewer" | "Placeholder";
  status: "pendiente" | "revisado" | "editado";
  outlier?: boolean;
  placeholder?: boolean;
}

export interface AiRunResponse {
  runId?: string;
  caseId?: string;
  plane?: Plane;
  modelKey?: string;
  inputPath?: string;
  metadata?: Record<string, unknown>;
  agentDecision?: AgentDecision;
  measurements?: Measurement[] | RawMeasurements;
  normalizedMeasurements?: Measurement[];
  measurementsStatus?: string;
  measurementsDescription?: string;
  overlayPath?: string | null;
  review?: ReviewStatusResponse;
  createdAt?: string;
  aiModuleAvailable?: boolean;
  degradedMode?: boolean;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
}

export interface AiModel {
  key?: string;
  name?: string;
  version?: string;
  planes?: Plane[];
  enabled?: boolean;
}

export interface StudyRow {
  caseId: string;
  patientId: string;
  plane: Plane;
  studyDate: string;
  modelKey: string;
  modelStatus: string;
  reviewStatus: ReviewStatus;
  priority: Priority;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
}

export interface PatientStudy {
  caseId: string;
  studyDate: string;
  planes: string;
  modelVersion: string;
  reviewStatus: ReviewStatus;
  priority: Priority;
  metrics: {
    lordosisAngle: number;
    canalDiameter: number;
    averageDiscHeight: number;
    l45DiscHeight: number;
  };
}

export interface ReviewHistoryState {
  runs: AiRunResponse[];
  measurementsByRunId: Record<string, Measurement[]>;
  reviewsByRunId: Record<string, ReviewStatusResponse>;
  auditTrail: AuditEvent[];
  patientStudies: PatientStudy[];
}
