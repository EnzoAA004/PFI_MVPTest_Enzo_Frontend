import type { AiModel, AiRunResponse } from "../types";
import { mockMeasurements } from "../data/mockMeasurements";

export const sampleModels: AiModel[] = [
  {
    key: "sagittal_spider",
    name: "Sagittal SPIDER technical pipeline",
    version: "0.3.0",
    planes: ["sagittal"],
    enabled: true,
  },
  {
    key: "axial_lumbar_v0",
    name: "Axial lumbar technical pipeline",
    version: "0.1.0",
    planes: ["axial"],
    enabled: true,
  },
];

export const sampleRun: AiRunResponse = {
  runId: "demo-run-2026-001",
  caseId: "CASE-DEMO-0142",
  plane: "sagittal",
  modelKey: "sagittal_spider",
  inputPath: "demo/CASE-DEMO-0142",
  createdAt: "2026-07-01T17:03:05.786Z",
  metadata: {
    source: "frontend-review-workspace",
    uiVersion: "redesign-v1",
  },
  agentDecision: {
    agentStatus: "requires_professional_review",
    reviewPriority: "standard",
    agentReasons: ["contract_smoke_pipeline_requires_review"],
    recommendedAction: "Revisar overlays, mediciones y trazabilidad antes de usar el resultado.",
    plane: "sagittal",
    modelKey: "sagittal_spider",
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    status: "requiere_revision",
    priority: "media",
    flags: ["contract_smoke_pipeline_requires_review"],
    reasons: ["contract_smoke_pipeline_requires_review"],
  },
  measurements: {
    status: "pending_real_inference",
    values: [],
    source: "contract_smoke_pipeline",
    description: "No se calcularon mediciones clinicas; pendiente conectar inferencia real.",
  },
  normalizedMeasurements: mockMeasurements,
  measurementsStatus: "pending_real_inference",
  overlayPath: null,
  review: {
    runId: "demo-run-2026-001",
    status: "pendiente",
    notes: "",
    observations: "",
    reviewer: "",
    updatedAt: "2026-07-01T17:03:05.786Z",
  },
  aiModuleAvailable: true,
  degradedMode: false,
  humanReviewRequired: true,
  notClinicalDiagnosis: true,
};
