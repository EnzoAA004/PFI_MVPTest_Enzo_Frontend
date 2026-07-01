import type { AuditEvent, PatientStudy, StudyRow } from "../types";

export const worklistStudies: StudyRow[] = [
  {
    caseId: "CASE-DEMO-0142",
    patientId: "PAT-0087",
    plane: "sagittal",
    studyDate: "2026-07-01",
    modelKey: "sagittal_spider",
    modelStatus: "Pipeline tecnico listo",
    reviewStatus: "pendiente",
    priority: "media",
  },
  {
    caseId: "CASE-0110",
    patientId: "PAT-0087",
    plane: "axial",
    studyDate: "2026-05-19",
    modelKey: "axial_lumbar_v0",
    modelStatus: "AI-ready",
    reviewStatus: "observado",
    priority: "alta",
  },
  {
    caseId: "CASE-0089",
    patientId: "PAT-0214",
    plane: "sagittal",
    studyDate: "2026-04-04",
    modelKey: "sagittal_spider",
    modelStatus: "Inference pending",
    reviewStatus: "pendiente",
    priority: "media",
  },
  {
    caseId: "CASE-0061",
    patientId: "PAT-0332",
    plane: "sagittal",
    studyDate: "2026-02-12",
    modelKey: "sagittal_spider",
    modelStatus: "AI-ready",
    reviewStatus: "aceptado",
    priority: "baja",
  },
];

export const patientStudies: PatientStudy[] = [
  {
    caseId: "CASE-0142",
    studyDate: "2026-07-01",
    planes: "Sagittal T2, Sagittal T1, Axial T2",
    modelVersion: "sagittal_spider v0.3",
    reviewStatus: "pendiente",
    priority: "media",
    metrics: { lordosisAngle: 41.5, canalDiameter: 14.2, averageDiscHeight: 12.7, l45DiscHeight: 13.8 },
  },
  {
    caseId: "CASE-0110",
    studyDate: "2026-05-19",
    planes: "Sagittal T2, Axial T2",
    modelVersion: "sagittal_spider v0.3",
    reviewStatus: "observado",
    priority: "alta",
    metrics: { lordosisAngle: 39.2, canalDiameter: 13.7, averageDiscHeight: 12.2, l45DiscHeight: 12.9 },
  },
  {
    caseId: "CASE-0089",
    studyDate: "2026-04-04",
    planes: "Sagittal T1, Sagittal T2",
    modelVersion: "sagittal_spider v0.2",
    reviewStatus: "aceptado",
    priority: "media",
    metrics: { lordosisAngle: 40.1, canalDiameter: 14.6, averageDiscHeight: 12.9, l45DiscHeight: 13.2 },
  },
  {
    caseId: "CASE-0061",
    studyDate: "2026-02-12",
    planes: "Sagittal T2, Axial T1",
    modelVersion: "sagittal_spider v0.2",
    reviewStatus: "aceptado",
    priority: "baja",
    metrics: { lordosisAngle: 42.8, canalDiameter: 15.1, averageDiscHeight: 13.3, l45DiscHeight: 14.1 },
  },
  {
    caseId: "CASE-0027",
    studyDate: "2025-11-28",
    planes: "Sagittal T2",
    modelVersion: "sagittal_spider v0.1",
    reviewStatus: "aceptado",
    priority: "baja",
    metrics: { lordosisAngle: 43.4, canalDiameter: 15.4, averageDiscHeight: 13.6, l45DiscHeight: 14.4 },
  },
];

export const initialAuditTrail: AuditEvent[] = [
  {
    id: "audit-1",
    timestamp: "2026-07-01T17:03:05.786Z",
    actor: "System",
    action: "pipeline run generado",
    detail: "CASE-DEMO-0142 preparado para revision profesional.",
  },
  {
    id: "audit-2",
    timestamp: "2026-07-01T17:03:09.120Z",
    actor: "AI Agent",
    action: "reporte agente recuperado",
    detail: "Salida marcada como requiere revision profesional.",
  },
];
