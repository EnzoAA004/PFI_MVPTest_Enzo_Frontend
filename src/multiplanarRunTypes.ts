import type { AiRunResponse, Plane, ReviewStatus } from "./appTypes";

export type InputResponse = {
  inputId: string;
  caseId: string;
  plane: Plane;
  format: string;
  size: number;
};

export type AssetName = "input.png" | "overlay.png" | "mask-preview.png";

export type AssetRef = {
  runId: string;
  plane: Plane;
  assetName: AssetName;
  url?: string;
  contentType?: string;
  size?: number;
  width?: number;
  height?: number;
  checksum?: string;
};

export type PlaneAssetRefs = Partial<Record<AssetName, AssetRef>>;

export type ModelPoint = {
  x: number;
  y: number;
};

export type MultiplanarLandmark = Record<string, unknown> & {
  id?: string;
  label?: string;
  className?: string;
  classLabel?: string;
  classId?: string | number;
  x?: number;
  y?: number;
  centroid?: ModelPoint;
  center?: ModelPoint;
  coordinateSpace?: string;
};

export type MultiplanarMeasurementValue = Record<string, unknown> & {
  id?: string;
  label?: string;
  className?: string;
  classLabel?: string;
  value?: number | string;
  unit?: string;
  level?: string;
  axis?: string;
  coordinateSpace?: string;
};

export type MultiplanarMeasurements = Record<string, unknown> & {
  values?: MultiplanarMeasurementValue[];
  coordinateSpace?: string;
  measurementsDerivedFromPredictionMask?: boolean;
  measurementsDerivedFromContours?: boolean;
};

export type RuntimeStatus = {
  status?: string;
  effectiveInferenceMode?: string;
  requestedInferenceMode?: string;
  aiModuleAvailable?: boolean;
  degradedMode?: boolean;
  modelKey?: string;
  modelVersion?: string;
  traceId?: string;
};

export type MultiplanarReview = {
  status?: ReviewStatus;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
  notes?: string;
  observations?: string;
  reviewer?: string;
  reviewedAt?: string;
  updatedAt?: string;
  flags?: string[];
  recommendations?: string[];
};

export type RunReviewStatus = "accepted" | "observed" | "rejected" | "edited";

export type ReviewMeasurementCorrection = Record<string, string | number | boolean | null | undefined> & {
  measurementId?: string;
  value?: number | string | null;
  unit?: string;
  comment?: string;
};

export type RunReviewRequest = {
  reviewStatus: RunReviewStatus;
  reviewer: string;
  comments?: string;
  measurementCorrections?: ReviewMeasurementCorrection[];
};

export type RunReviewResponse = {
  reviewStatus: RunReviewStatus;
  reviewer: string;
  reviewedAt?: string;
  comments?: string;
  measurementCorrections?: ReviewMeasurementCorrection[];
};

export type MultiplanarPlaneRun = Omit<AiRunResponse, "landmarks" | "measurements"> & RuntimeStatus & {
  runId: string;
  effectiveInferenceMode: string;
  assets?: PlaneAssetRefs;
  landmarks?: MultiplanarLandmark[];
  measurements?: MultiplanarMeasurements | MultiplanarMeasurementValue[];
  coordinateSpace?: string;
  measurementsDerivedFromPredictionMask?: boolean;
};

export type WorkspaceAssetRefs = Partial<Record<Plane | "workspace", PlaneAssetRefs>>;

export type MultiplanarRunRequest = {
  caseId: string;
  sagittalInputId: string;
  axialInputId: string;
  sagittalModelKey?: string;
  axialModelKey?: string;
  allowContractFallback: boolean;
  metadata?: Record<string, unknown>;
};

export type LegacyMultiplanarRunRequest = {
  caseId: string;
  sagittalInputPath?: string;
  axialInputPath?: string;
  sagittalModelKey?: string;
  axialModelKey?: string;
  metadata?: Record<string, unknown>;
};

export type MultiplanarRunPayload = MultiplanarRunRequest | LegacyMultiplanarRunRequest;

export type MultiplanarRunResponse = {
  status?: string;
  runId: string;
  traceId?: string;
  caseId?: string;
  workspaceMode?: "dual_plane_with_3d_context" | string;
  requestedInferenceMode?: string;
  effectiveInferenceMode: string;
  planes?: {
    sagittal?: MultiplanarPlaneRun;
    axial?: MultiplanarPlaneRun;
  };
  assets?: WorkspaceAssetRefs;
  threeD?: {
    status?: string;
    sourcePlanes?: Plane[];
    asset?: AssetRef;
  };
  quality?: {
    status?: string;
    maskCount?: number;
    landmarkCount?: number;
    measurementCount?: number;
    warnings?: string[];
  };
  review?: MultiplanarReview;
  metadata?: Record<string, unknown>;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};
