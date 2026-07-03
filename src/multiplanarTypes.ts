export type MultiplanarPlaneKey = "sagittal" | "axial";

export type MultiplanarPlaneContract = {
  plane?: MultiplanarPlaneKey;
  modelKey?: string;
  modelVersion?: string;
  readiness?: string;
  baselineReady?: boolean;
  availableForRealInference?: boolean;
  artifactHash?: string | null;
  artifactExists?: boolean;
  externalArtifactConfigured?: boolean;
  manifestStatus?: string;
  manifestValid?: boolean;
  outputs?: string[];
  viewerRole?: string;
};

export type MultiplanarContract = Record<string, unknown> & {
  status?: string;
  schemaVersion?: string;
  workspaceMode?: string;
  planes?: Partial<Record<MultiplanarPlaneKey, MultiplanarPlaneContract>>;
  threeD?: Record<string, unknown>;
  sync?: Record<string, unknown>;
  review?: Record<string, unknown>;
  readyForRealBaseline?: boolean;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};

export function panelOrder(): Array<MultiplanarPlaneKey | "three_d"> {
  return ["sagittal", "axial", "three_d"];
}

export function readyPlaneCount(contract?: MultiplanarContract): number {
  const planes = contract?.planes ?? {};
  return [planes.sagittal, planes.axial].filter((plane) => plane?.baselineReady).length;
}
