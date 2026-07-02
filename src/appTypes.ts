export type Plane = "sagittal" | "axial";
export type ReviewStatus = "pendiente" | "aceptado" | "observado" | "descartado";
export type Priority = "alta" | "media" | "baja";
export type ViewKey = "dashboard" | "review" | "history" | "settings";

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
  level?: string;
  value: number | string;
  aiValue?: number | string;
  reviewerValue?: number | string | null;
  unit: string;
  confidence?: number;
  plane?: Plane;
  source: "AI" | "Reviewer" | "Placeholder";
  status: "pendiente" | "revisado" | "editado";
  outlier?: boolean;
  placeholder?: boolean;
  linkedLandmarks?: string[];
};

export type StudyPoint = {
  x: number;
  y: number;
};

export type MaskContour = {
  seriesId: string;
  sliceIndex: number;
  points: StudyPoint[];
};

export type StudySeries = {
  id: string;
  name: string;
  plane: Plane;
  sequence?: string;
  sliceCount: number;
  selectedSlice: number;
  imageUrl?: string | null;
  overlayUrl?: string | null;
  overlayOpacity?: number;
  status?: string;
};

export type StudyMask = {
  id: string;
  label: string;
  className: string;
  color: string;
  confidence?: number;
  editable?: boolean;
  enabled?: boolean;
  contours?: MaskContour[];
};

export type StudyLandmark = {
  id: string;
  label: string;
  seriesId: string;
  sliceIndex: number;
  x: number;
  y: number;
  editable?: boolean;
  linkedMaskId?: string | null;
};

export type AiOutputState = {
  status?: string;
  label?: string;
  description?: string;
  inferenceMode?: string;
  requestedInferenceMode?: string;
  realInferenceAvailable?: boolean;
  modelReadiness?: string;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
  agentDecision?: AgentDecision;
};

export type AiRunResponse = {
  runId?: string;
  caseId?: string;
  studyId?: string;
  patientId?: string;
  studyDate?: string;
  modality?: string;
  bodyRegion?: string;
  reviewStatus?: ReviewStatus;
  plane?: Plane;
  modelKey?: string;
  modelVersion?: string;
  inputPath?: string;
  metadata?: Record<string, unknown>;
  agentDecision?: AgentDecision;
  aiOutput?: AiOutputState;
  series?: StudySeries[];
  masks?: StudyMask[];
  landmarks?: StudyLandmark[];
  measurements?: Measurement[] | RawMeasurements;
  measurementValues?: Measurement[];
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
  runId?: string;
};

export type StudyRun = {
  runId: string;
  caseId: string;
  plane: Plane;
  modelKey: string;
  modelStatus: string;
  reviewStatus: ReviewStatus;
  measurementCount?: number;
};

export type StudyDetailResponse = {
  status: string;
  study: StudyRow;
  review?: ReviewStatusResponse;
  measurements?: Measurement[];
  runs?: StudyRun[];
  auditTrail?: AuditEvent[];
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};

export type StudyRunsResponse = {
  status: string;
  caseId: string;
  runs: StudyRun[];
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};

export type StudiesSummary = {
  total: number;
  pending: number;
  completed: number;
  flagged: number;
};

export type StudiesResponse = {
  status: string;
  source?: string;
  items: StudyRow[];
  summary?: StudiesSummary;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
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

export type PatientHistorySummary = {
  totalStudies: number;
  mostRecent?: string;
  firstStudy?: string;
};

export type PatientHistoryGovernance = {
  dataScope?: string;
  rawImagesExport?: string;
  derivedMetricsExport?: string;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};

export type PatientHistoryResponse = {
  status: string;
  source?: string;
  subjectRef: string;
  deidentified?: boolean;
  studies: PatientStudy[];
  summary?: PatientHistorySummary;
  governance?: PatientHistoryGovernance;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
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

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresInSeconds?: number;
  user: AuthUser;
};

export type AuthPendingResponse = {
  status: string;
  challengeId: string;
  deliveryHint?: string;
  expiresInSeconds?: number;
  demoCode?: string;
  message?: string;
};

export type AuthTokenResponse = AuthSession;

export type RegisterRequest = {
  fullName: string;
  email: string;
  password: string;
  licenseNumber: string;
  specialty: string;
  institution?: string;
};

export type DiagnosticBlock = Record<string, unknown> & {
  available?: boolean;
  connected?: boolean;
  enabled?: boolean;
  status?: string;
  service?: string;
  mode?: string;
  message?: string;
  defaultInferenceMode?: string;
  artifactSummary?: AiArtifactSummary;
  models?: AiModelsDiagnostics;
  response?: Record<string, unknown>;
};

export type AiArtifactSummary = {
  modelsRegistered?: number;
  artifactsAvailable?: number;
  artifactsMissing?: number;
  readyForRealInference?: boolean;
  defaultInferenceMode?: string;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};

export type AiModelArtifact = {
  path?: string | null;
  exists?: boolean;
  sizeBytes?: number;
  sizeMb?: number;
  extension?: string | null;
};

export type AiModelDiagnostic = Record<string, unknown> & {
  key?: string;
  version?: string;
  plane?: Plane;
  artifact?: AiModelArtifact;
  readiness?: string;
  inferenceModes?: Record<string, boolean>;
  availableForRealInference?: boolean;
  enabled?: boolean;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};

export type AiModelsDiagnostics = Record<string, unknown> & {
  models?: Record<string, AiModelDiagnostic>;
  summary?: AiArtifactSummary;
  paths?: Record<string, string>;
};

export type SystemDiagnostics = {
  status: string;
  checkedAt?: string;
  backend?: DiagnosticBlock;
  aiModule?: DiagnosticBlock;
  database?: DiagnosticBlock;
  auth?: DiagnosticBlock;
  persistence?: Record<string, unknown>;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};
