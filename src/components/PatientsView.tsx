import { useMemo, useState } from "react";
import type { StudyRow } from "../appTypes";
import { PriorityBadge, ReviewBadge } from "./StatusBadge";

interface PatientsViewProps {
  studies: StudyRow[];
  loading?: boolean;
  onOpenHistory: (patientId: string) => void;
}

type PatientRow = {
  patientId: string;
  totalStudies: number;
  firstStudy: string;
  mostRecent: string;
  pending: number;
  highestPriority: StudyRow["priority"];
  latestReviewStatus: StudyRow["reviewStatus"];
};

const priorityRank: Record<StudyRow["priority"], number> = { alta: 0, media: 1, baja: 2 };

function buildPatients(studies: StudyRow[]): PatientRow[] {
  const grouped = new Map<string, StudyRow[]>();
  studies.forEach((study) => grouped.set(study.patientId, [...(grouped.get(study.patientId) ?? []), study]));
  return Array.from(grouped.entries()).map(([patientId, patientStudies]) => {
    const sortedByDate = [...patientStudies].sort((a, b) => Date.parse(a.studyDate) - Date.parse(b.studyDate));
    const latest = sortedByDate[sortedByDate.length - 1] ?? patientStudies[0];
    const highestPriority = [...patientStudies].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])[0]?.priority ?? "baja";
    return {
      patientId,
      totalStudies: patientStudies.length,
      firstStudy: sortedByDate[0]?.studyDate ?? "sin datos",
      mostRecent: latest?.studyDate ?? "sin datos",
      pending: patientStudies.filter((study) => study.reviewStatus === "pendiente" || study.reviewStatus === "observado").length,
      highestPriority,
      latestReviewStatus: latest?.reviewStatus ?? "pendiente",
    };
  }).sort((a, b) => Date.parse(b.mostRecent) - Date.parse(a.mostRecent));
}

function matchesQuery(patient: PatientRow, query: string) {
  if (!query.trim()) return true;
  const normalized = query.trim().toLowerCase();
  return [patient.patientId, patient.firstStudy, patient.mostRecent, patient.highestPriority, patient.latestReviewStatus]
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
          <h1>Patient Index</h1>
        </div>
        <div className="screen-summary">
          <strong>{visiblePatients.length}</strong>
          <span>de-identified patient records</span>
        </div>
      </section>

      <section className="panel-card worklist-panel">
        <div className="section-title">
          <div>
            <h2>Pacientes</h2>
            <p className="muted compact-copy">Derivado de filas reales de estudios disponibles para el frontend. No se infieren métricas longitudinales acá.</p>
          </div>
        </div>
        <div className="worklist-filter-shell">
          <div className="worklist-search-row single-action">
            <label className="worklist-search-input">
              <span>Buscar</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ID de paciente, fecha, estado..." type="search" />
            </label>
          </div>
        </div>
        {loading ? (
          <div className="panel-hidden-placeholder">Consultando filas de estudios de pacientes desde backend.</div>
        ) : visiblePatients.length ? (
          <>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- axe requires keyboard focus for horizontally scrollable tables. */}
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla de pacientes">
            <table className="worklist-table patient-index-table">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Estudios</th>
                  <th>Primer estudio</th>
                  <th>Más reciente</th>
                  <th>Pendientes</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th aria-label="Acciones"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {visiblePatients.map((patient) => (
                  <tr key={patient.patientId}>
                    <td><strong>{patient.patientId}</strong><small>De-identified</small></td>
                    <td>{patient.totalStudies}</td>
                    <td>{patient.firstStudy}</td>
                    <td>{patient.mostRecent}</td>
                    <td>{patient.pending}</td>
                    <td><PriorityBadge priority={patient.highestPriority} /></td>
                    <td><ReviewBadge status={patient.latestReviewStatus} /></td>
                    <td><button className="ghost-button" onClick={() => onOpenHistory(patient.patientId)} type="button">Abrir historial</button></td>
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
