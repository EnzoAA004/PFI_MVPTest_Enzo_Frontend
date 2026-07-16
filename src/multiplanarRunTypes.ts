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

export type MultiplanarPlaneRun = AiRunResponse & RuntimeStatus & {
  runId: string;
  effectiveInferenceMode: string;
  assets?: PlaneAssetRefs;
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
