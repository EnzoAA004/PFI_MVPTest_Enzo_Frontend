import type { AiModel, AiRunResponse } from "../types";

export const sampleModels: AiModel[] = [
  {
    key: "pfi-segmentation-sagittal-v1",
    name: "Segmentacion tecnica sagital",
    version: "1.0.0",
    planes: ["sagittal"],
    enabled: true,
  },
  {
    key: "pfi-segmentation-axial-v1",
    name: "Segmentacion tecnica axial",
    version: "1.0.0",
    planes: ["axial"],
    enabled: true,
  },
];

export const sampleRun: AiRunResponse = {
  runId: "demo-run-2026-001",
  caseId: "CASE-DEMO-0142",
  plane: "sagittal",
  modelKey: "pfi-segmentation-sagittal-v1",
  createdAt: "2026-06-30T21:00:00.000Z",
  agentDecision: {
    priority: "media",
    status: "requiere_revision",
    flags: ["overlay_disponible", "mediciones_revisables", "calidad_aceptable"],
    reasons: [
      "El modulo tecnico encontro regiones de interes con contraste suficiente para revision.",
      "Las mediciones generadas deben ser validadas por un profesional antes de incorporarse al informe.",
      "La priorizacion es asistiva y no reemplaza el criterio profesional.",
    ],
    humanReviewRequired: true,
  },
  measurements: [
    {
      id: "m-001",
      label: "Longitud tecnica de referencia",
      value: 18.4,
      unit: "mm",
      confidence: 0.86,
      plane: "sagittal",
    },
    {
      id: "m-002",
      label: "Area aproximada de region marcada",
      value: 52.7,
      unit: "mm2",
      confidence: 0.81,
      plane: "sagittal",
    },
    {
      id: "m-003",
      label: "Indice de continuidad visual",
      value: 0.74,
      unit: "score",
      confidence: 0.78,
      plane: "sagittal",
    },
  ],
  overlayPath: "/demo-overlay.svg",
  review: {
    runId: "demo-run-2026-001",
    status: "pendiente",
    observations: "",
  },
};
