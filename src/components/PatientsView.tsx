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
          <p>Patients</p>
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
            <h2>Patients</h2>
            <p className="muted compact-copy">Derived from real study rows available to the frontend. No longitudinal metrics are inferred here.</p>
          </div>
        </div>
        <div className="worklist-filter-shell">
          <div className="worklist-search-row single-action">
            <label className="worklist-search-input">
              <span>Search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Patient ID, date, status..." type="search" />
            </label>
          </div>
        </div>
        {loading ? (
          <div className="panel-hidden-placeholder">Consulting patient study rows from backend.</div>
        ) : visiblePatients.length ? (
          <div className="table-wrap">
            <table className="worklist-table patient-index-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Studies</th>
                  <th>First Study</th>
                  <th>Most Recent</th>
                  <th>Pending</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
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
                    <td><button className="ghost-button" onClick={() => onOpenHistory(patient.patientId)} type="button">Open history</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-hidden-placeholder">No patient list is available from real study rows.</div>
        )}
      </section>
    </div>
  );
}
