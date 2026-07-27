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
  degradedMode?: boolean;
};
