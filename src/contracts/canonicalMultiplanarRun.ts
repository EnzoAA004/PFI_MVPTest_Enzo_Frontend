import type { Plane } from "../appTypes";

export const MULTIPLANAR_CONTRACT_V2 = "pfi.multiplanar-run.v2";

export type CanonicalAssetName = "input.png" | "overlay.png" | "mask-preview.png";

export type CanonicalCoordinateSpace = string;

export type CanonicalModelPoint = {
  x: number;
  y: number;
};

export type CanonicalGovernance = {
  humanReviewRequired: boolean | null;
  notClinicalDiagnosis: boolean | null;
  synthetic: boolean | null;
  fallbackReason: string | null;
};

export type CanonicalPlaneAsset = {
  assetName: CanonicalAssetName;
  role?: string;
  contentType?: string;
  generated?: boolean;
  url: string;
};

export type CanonicalPlaneModel = {
  key?: string;
  version?: string;
  artifactHash?: string;
  readiness?: string;
  trainingStatus?: string;
  baselineReady?: boolean;
  availableForRealInference?: boolean;
  runtimeQualification?: string;
  qualityGatePassed?: boolean;
  manifestStatus?: string;
  manifestValid?: boolean;
};

export type CanonicalPlaneInput = {
  inputId?: string;
  nativeShape?: number[];
  canonicalShape?: number[];
  orientationTransform?: string;
  selectedSliceIndex?: number;
  sliceCount?: number;
  selectedAxis?: number;
  inPlaneSpacingMm?: number[];
};

export type CanonicalPlaneSeriesItem = {
  plane?: Plane | string;
  imageUrl?: string;
  overlayUrl?: string;
};

export type CanonicalPlaneMask = {
  id?: string;
  label?: string;
  role?: string;
  url?: string;
};

export type CanonicalPlaneQuality = {
  status?: string;
  warnings?: string[];
};

export type CanonicalLandmark = {
  id?: string;
  labelKey?: string;
  x?: number;
  y?: number;
  centroid?: CanonicalModelPoint;
  center?: CanonicalModelPoint;
  coordinateSpace?: CanonicalCoordinateSpace;
};

export type CanonicalMeasurement = {
  id: string;
  labelKey: string;
  value: number | string | null;
  unit?: string;
  confidence?: number;
  status?: string;
  placeholder?: boolean;
  plane?: Plane | string;
  level?: string | null;
  reviewerValue?: number | string | null;
};

export type CanonicalPlaneRun = CanonicalGovernance & {
  planeRunId?: string;
  plane: Plane | string;
  status?: string;
  effectiveInferenceMode?: string;
  model: CanonicalPlaneModel;
  input: CanonicalPlaneInput;
  coordinateSpace?: CanonicalCoordinateSpace;
  assets: CanonicalPlaneAsset[];
  series?: CanonicalPlaneSeriesItem[];
  masks?: CanonicalPlaneMask[];
  landmarks: CanonicalLandmark[];
  measurements: CanonicalMeasurement[];
  quality?: CanonicalPlaneQuality;
};

/**
 * Recognized statuses for the experimental 3D geometric proxy (see AI Module
 * P9-A.3.1/P9-A.3.1.1). `pending_registered_reconstruction` was retired by the
 * AI Module and must never be reintroduced here or interpreted specially — any
 * status outside this set is treated as unavailable by the view model layer,
 * never as a hidden "ready" state.
 */
export type CanonicalThreeDStatus =
  | "blocked_missing_axial"
  | "blocked_missing_sagittal"
  | "experimental_ready"
  | "experimental_blocked_insufficient_geometry"
  | "experimental_blocked_missing_anatomical_mapping";

export type CanonicalThreeDAsset = {
  assetName: string;
  url: string;
};

export type CanonicalThreeDReconstruction = {
  kind?: string;
  method?: string;
  anatomicalReconstruction?: boolean;
  volumetricReconstruction?: boolean;
  coordinateSystem?: string;
  mappingSource?: string;
  mappingValidated?: boolean;
  available?: boolean;
  experimental?: boolean;
};

export type CanonicalThreeD = {
  enabled: boolean;
  status: CanonicalThreeDStatus | string;
  sourcePlaneRunIds: { sagittal: string | null; axial: string | null };
  requiredInputs: string[];
  assets: CanonicalThreeDAsset[];
  reconstruction?: CanonicalThreeDReconstruction;
  warnings: string[];
};

export type CanonicalMultiplanarRun = CanonicalGovernance & {
  status?: string;
  schemaVersion?: string;
  runId: string;
  traceId?: string;
  caseId?: string;
  workspaceMode?: string;
  requestedInferenceMode?: string;
  effectiveInferenceMode?: string;
  planes: {
    sagittal: CanonicalPlaneRun;
    axial?: CanonicalPlaneRun;
  };
  threeD?: CanonicalThreeD;
  degradedMode?: boolean;
};
