import { API_BASE_URL } from "./api";
import { authHeaders } from "./authClient";

export type PipelineContractSchema = {
  schemaVersion?: string;
  status?: string;
  purpose?: string;
  proxiedByBackend?: boolean;
  aiModuleAvailable?: boolean;
  degradedMode?: boolean;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
  message?: string;
  rootFields?: Record<string, string>;
  aiOutput?: Record<string, unknown>;
  quality?: Record<string, unknown>;
  guarantees?: string[];
};

export async function getPipelineContractSchema(): Promise<PipelineContractSchema> {
  const response = await fetch(`${API_BASE_URL}/api/ai/pipeline/schema`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
  });
  if (!response.ok) throw new Error(`Backend respondio ${response.status}`);
  return (await response.json()) as PipelineContractSchema;
}
