import type { AiCompletionResponse, AiEvaluationContract, AiEvaluationSummary, AiRoadmap } from "./appTypes";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export function roadmapFromCompletion(completion: AiCompletionResponse): AiRoadmap {
  if (completion.roadmap) return completion.roadmap;
  const aiMvp = asRecord(completion.aiMvpCompletion);
  const items = Array.isArray(aiMvp?.items) ? aiMvp.items : [];
  return {
    currentMode: "contract",
    completed: items.filter((item) => asRecord(item)?.status === "complete").map((item) => String(asRecord(item)?.key ?? "item")),
    pending: items.filter((item) => asRecord(item)?.status !== "complete").map((item) => String(asRecord(item)?.key ?? "item")),
  };
}

export function latestRunEvidence(completion: AiCompletionResponse, summary?: AiEvaluationSummary): string {
  return String(completion.latestRunId || summary?.latestRunId || "");
}

export function evaluationEvidence(summary?: AiEvaluationSummary, contract?: AiEvaluationContract) {
  const reportCount = typeof summary?.reportCount === "number" ? summary.reportCount : 0;
  return {
    status: "evaluation_evidence_ready",
    latestRunId: String(summary?.latestRunId || ""),
    reportCount,
    hasReports: Boolean(summary?.hasReports ?? reportCount > 0),
    requiredEvidence: stringArray(contract?.requiredEvidence),
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
  };
}

export function roadmapLists(roadmap?: AiRoadmap) {
  return {
    completed: stringArray(roadmap?.completed),
    pending: stringArray(roadmap?.pending),
    criteria: stringArray(roadmap?.acceptanceCriteria),
  };
}
