import type { StudyMetadataInput } from "./appTypes";

export type AssetName = "input.png" | "overlay.png" | "mask-preview.png";

export type DiagnosticEndpointResponse = Record<string, unknown> & {
  status?: string;
  message?: string;
  service?: string;
  proxiedByBackend?: boolean;
  readyForDemo?: boolean;
  readyForRealInference?: boolean;
  defaultInferenceMode?: string;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};

export type MultiplanarRunRequest = {
  caseId: string;
  studyMetadata?: StudyMetadataInput;
  sagittalInputId: string;
  axialInputId?: string;
  sagittalModelKey?: string;
  axialModelKey?: string;
  allowContractFallback: boolean;
  metadata?: Record<string, unknown>;
};

export type LegacyMultiplanarRunRequest = {
  caseId: string;
  studyMetadata?: StudyMetadataInput;
  sagittalInputPath?: string;
  axialInputPath?: string;
  sagittalModelKey?: string;
  axialModelKey?: string;
  metadata?: Record<string, unknown>;
};

export type MultiplanarRunPayload = MultiplanarRunRequest | LegacyMultiplanarRunRequest;
