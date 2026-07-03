import type { AiRunResponse } from "./appTypes";

export type MultiplanarRunRequest = {
  caseId: string;
  sagittalInputPath?: string;
  axialInputPath?: string;
  sagittalModelKey?: string;
  axialModelKey?: string;
  metadata?: Record<string, unknown>;
};

export type MultiplanarRunResponse = Record<string, unknown> & {
  status?: string;
  runId?: string;
  traceId?: string;
  caseId?: string;
  workspaceMode?: string;
  requestedInferenceMode?: string;
  effectiveInferenceMode?: string;
  planes?: {
    sagittal?: AiRunResponse;
    axial?: AiRunResponse;
  };
  threeD?: Record<string, unknown>;
  quality?: Record<string, unknown>;
  review?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};
