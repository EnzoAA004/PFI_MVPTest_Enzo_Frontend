export type Plane = "sagittal" | "axial";
export type ReviewStatus = "pendiente" | "aceptado" | "observado" | "descartado";
export type Priority = "alta" | "media" | "baja";
export type ViewKey = "dashboard" | "review" | "history";

export type PipelineRunRequest = {
  caseId: string;
  plane: Plane;
  modelKey: string;
  inputPath?: string;
  metadata?: Record<string, unknown>;
};

export type ReviewUpdateRequest = {
  status: ReviewStatus;
  notes?: string;
  observations?: string;
  reviewer?: string;
};

export type ReviewStatusResponse = {
  runId?: string;
  status?: ReviewStatus;
  notes?: string;
  observations?: string;
  reviewer?: string;
  reviewedAt?: string;
  updatedAt?: string;
};

export type AgentDecision = {
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
};

export type RawMeasurements = {
  status?: string;
  values?: unknown[];
  source?: string;
  description?: string;
};

export type Measurement = {
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
};

export type AiRunResponse = {
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
};

export type AiModel = {
  key?: string;
  name?: string;
  version?: string;
  planes?: Plane[];
  enabled?: boolean;
};

export type StudyRow = {
  caseId: string;
  patientId: string;
  plane: Plane;
  studyDate: string;
  modelKey: string;
  modelStatus: string;
  reviewStatus: ReviewStatus;
  priority: Priority;
};

export type AuditEvent = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
};

export type PatientStudy = {
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
};

export type ReviewHistoryState = {
  runs: AiRunResponse[];
  measurementsByRunId: Record<string, Measurement[]>;
  reviewsByRunId: Record<string, ReviewStatusResponse>;
  auditTrail: AuditEvent[];
  patientStudies: PatientStudy[];
};

export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  licenseNumber?: string;
  specialty?: string;
  institution?: string;
  roles: string[];
  verified: boolean;
};

export type AuthPendingResponse = {
  challengeId: string;
  channel: string;
  expiresInSeconds: number;
  message: string;
  devVerificationCode?: string | null;
};

export type AuthTokenResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresInSeconds: number;
  user: AuthUser;
};

export type AuthSession = AuthTokenResponse & {
  createdAt: string;
};

export type RegisterRequest = {
  fullName: string;
  email: string;
  password: string;
  licenseNumber?: string;
  specialty?: string;
  institution?: string;
};
