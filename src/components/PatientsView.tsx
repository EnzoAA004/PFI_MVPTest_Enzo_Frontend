import { useMemo, useState } from "react";
import type { HistoryTarget, StudyRow } from "../appTypes";
import { displayReviewStatus } from "../clinicalDisplay";
import { displayStudyDate, displaySubjectRef } from "../studyDisplay";
import { PriorityBadge, ReviewBadge } from "./StatusBadge";

interface PatientsViewProps {
  studies: StudyRow[];
  loading?: boolean;
  onOpenHistory: (target: HistoryTarget) => void;
}

type PatientRow = {
  id: string;
  label: string;
  detail: string;
  target: HistoryTarget;
  kind: HistoryTarget["kind"];
  totalStudies: number;
  firstStudy: string;
  mostRecent: string;
  pending: number;
  highestPriority: StudyRow["priority"];
  latestReviewStatus: StudyRow["reviewStatus"];
};

const priorityRank: Record<StudyRow["priority"], number> = { alta: 0, media: 1, baja: 2 };
export function buildPatients(studies: StudyRow[]): PatientRow[] {
  const grouped = new Map<string, StudyRow[]>();
  studies.forEach((study) => {
    const key = study.subjectRef && study.subjectRef.trim() ? `subject:${study.subjectRef}` : `study:${study.caseId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), study]);
  });
  return Array.from(grouped.entries()).map(([key, patientStudies]) => {
    const sortedByDate = [...patientStudies].sort((a, b) => Date.parse(a.studyDate ?? "") - Date.parse(b.studyDate ?? ""));
    const latest = sortedByDate[sortedByDate.length - 1] ?? patientStudies[0];
    const highestPriority = [...patientStudies].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])[0]?.priority ?? "baja";
    const subjectRef = latest?.subjectRef?.trim();
    const isSubject = key.startsWith("subject:") && Boolean(subjectRef);
    const target: HistoryTarget = isSubject ? { kind: "subject", subjectRef: subjectRef as string } : { kind: "study", caseId: latest?.caseId ?? "" };
    return {
      id: key,
      label: isSubject ? subjectRef as string : "Referencia de paciente no informada",
      detail: isSubject ? "Paciente de-identificado" : `Referencia técnica: ${latest?.caseId ?? "sin caso"}`,
      target,
      kind: target.kind,
      totalStudies: patientStudies.length,
      firstStudy: displayStudyDate(sortedByDate[0]?.studyDate),
      mostRecent: displayStudyDate(latest?.studyDate),
      pending: patientStudies.filter((study) => study.reviewStatus === "pendiente" || study.reviewStatus === "observado").length,
      highestPriority,
      latestReviewStatus: latest?.reviewStatus ?? "pendiente",
    };
  }).sort((a, b) => Date.parse(b.mostRecent) - Date.parse(a.mostRecent));
}

function matchesQuery(patient: PatientRow, query: string) {
  if (!query.trim()) return true;
  const normalized = query.trim().toLowerCase();
  return [patient.label, patient.detail, patient.firstStudy, patient.mostRecent, patient.highestPriority, patient.latestReviewStatus, displayReviewStatus(patient.latestReviewStatus)]
    .some((value) => String(value).toLowerCase().includes(normalized));
}

export function PatientsView({ studies, loading = false, onOpenHistory }: PatientsViewProps) {
  const [query, setQuery] = useState("");
  const patients = useMemo(() => buildPatients(studies), [studies]);
  const visiblePatients = useMemo(() => patients.filter((patient) => matchesQuery(patient, query)), [patients, query]);

  return (
    <div className="view-stack">
      <section className="page-heading compact-heading">
        <div>
          <p>Pacientes</p>
          <h1>Indice de pacientes</h1>
        </div>
        <div className="screen-summary">
          <strong>{visiblePatients.length}</strong>
          <span>referencias o trazabilidades reales</span>
        </div>
      </section>

      <section className="panel-card worklist-panel">
        <div className="section-title">
          <div>
            <h2>Pacientes</h2>
            <p className="muted compact-copy">Derivado de filas reales de estudios disponibles para el frontend. No se infieren metricas longitudinales aca.</p>
          </div>
        </div>
        <div className="worklist-filter-shell">
          <div className="worklist-search-row single-action">
            <label className="worklist-search-input">
              <span>Buscar</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Referencia, fecha, estado..." type="search" />
            </label>
          </div>
        </div>
        {loading ? (
          <div className="panel-hidden-placeholder">Consultando filas de estudios desde backend.</div>
        ) : visiblePatients.length ? (
          <>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- axe requires keyboard focus for horizontally scrollable tables. */}
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla de pacientes">
            <table className="worklist-table patient-index-table">
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th>Estudios</th>
                  <th>Primer estudio</th>
                  <th>Mas reciente</th>
                  <th>Pendientes</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th aria-label="Acciones"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {visiblePatients.map((patient) => (
                  <tr key={patient.id}>
                    <td><strong>{patient.label}</strong><small>{patient.detail}</small></td>
                    <td>{patient.totalStudies}</td>
                    <td>{patient.firstStudy}</td>
                    <td>{patient.mostRecent}</td>
                    <td>{patient.pending}</td>
                    <td><PriorityBadge priority={patient.highestPriority} /></td>
                    <td><ReviewBadge status={patient.latestReviewStatus} /></td>
                    <td><button className="ghost-button" onClick={() => onOpenHistory(patient.target)} type="button">{patient.kind === "subject" ? "Abrir historial" : "Abrir trazabilidad del estudio"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <div className="panel-hidden-placeholder">No hay lista de pacientes disponible desde filas reales de estudios.</div>
        )}
      </section>
    </div>
  );
}
