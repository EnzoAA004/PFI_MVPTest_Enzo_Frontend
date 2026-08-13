import { useEffect, useMemo, useState } from "react";
import { BackendApiError } from "../multiplanarApi";
import {
  getPatient,
  getPatientStudies,
  isValidPatientId,
  type PatientDetail,
  type PatientStudySummary,
} from "../patientApi";
import { StatusBadge } from "./StatusBadge";

interface PatientDetailViewProps {
  patientId: string;
  onBack: () => void;
  onOpenStudy: (caseId: string) => void;
}

type PatientDetailState =
  | { status: "loading" }
  | { status: "ready"; patient: PatientDetail; studies: PatientStudySummary[] }
  | { status: "not-found" }
  | { status: "error" };

export function sortPatientStudies(studies: PatientStudySummary[]): PatientStudySummary[] {
  return studies
    .map((study, serverIndex) => ({ study, serverIndex }))
    .sort((left, right) => {
      const leftDate = left.study.studyDate;
      const rightDate = right.study.studyDate;
      if (leftDate && rightDate && leftDate !== rightDate) return rightDate.localeCompare(leftDate);
      if (leftDate && !rightDate) return -1;
      if (!leftDate && rightDate) return 1;
      return left.serverIndex - right.serverIndex;
    })
    .map(({ study }) => study);
}

export function displayPatientStudyDate(value: string | null): string {
  if (!value) return "Fecha no informada";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Fecha no informada";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function displayPatientStudyStatus(value: string | null): string {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "Estado no informado";
  const labels: Record<string, string> = {
    created: "Creado",
    ready: "Listo",
    completed: "Completado",
    failed: "Fallido",
    pending: "Pendiente",
  };
  return labels[normalized] ?? (value as string);
}

function displayPriority(value: string | null): string {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "No informada";
  return ({ low: "Baja", medium: "Media", high: "Alta" } as Record<string, string>)[normalized] ?? (value as string);
}

function statusTone(value: string | null): "green" | "red" | "blue" | "slate" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "completed" || normalized === "ready") return "green";
  if (normalized === "failed") return "red";
  if (normalized === "pending" || normalized === "created") return "blue";
  return "slate";
}

export function PatientDetailView({ patientId, onBack, onOpenStudy }: PatientDetailViewProps) {
  const [retryNonce, setRetryNonce] = useState(0);
  const [state, setState] = useState<PatientDetailState>(() => isValidPatientId(patientId) ? { status: "loading" } : { status: "not-found" });

  useEffect(() => {
    if (!isValidPatientId(patientId)) {
      setState({ status: "not-found" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    void Promise.all([getPatient(patientId), getPatientStudies(patientId)])
      .then(([patient, studies]) => {
        if (!cancelled) setState({ status: "ready", patient, studies: sortPatientStudies(studies) });
      })
      .catch((error) => {
        if (cancelled) return;
        setState(error instanceof BackendApiError && (error.status === 400 || error.status === 404) ? { status: "not-found" } : { status: "error" });
      });
    return () => { cancelled = true; };
  }, [patientId, retryNonce]);

  const summary = useMemo(() => {
    if (state.status !== "ready") return null;
    const latestStudy = state.studies[0];
    return {
      count: state.studies.length,
      latestDate: latestStudy ? displayPatientStudyDate(latestStudy.studyDate) : "Sin estudios",
      latestStatus: latestStudy ? displayPatientStudyStatus(latestStudy.status) : "Sin estudios",
    };
  }, [state]);

  if (state.status === "loading") {
    return <section className="panel-card clinical-loading-state" aria-live="polite"><span className="clinical-spinner" /><div><h2>Cargando paciente</h2><p>Consultando identidad y estudios asociados.</p></div></section>;
  }

  if (state.status === "not-found") {
    return (
      <section className="panel-card clinical-empty-state" role="alert">
        <h2>Paciente no encontrado</h2>
        <p>El enlace no corresponde a un paciente disponible.</p>
        <button className="ghost-button" onClick={onBack} type="button">Volver a pacientes</button>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="panel-card clinical-empty-state" role="alert">
        <h2>No se pudo cargar el paciente</h2>
        <p>Revisá la conexión e intentá nuevamente.</p>
        <div className="patient-detail-actions">
          <button className="ghost-button" onClick={() => setRetryNonce((value) => value + 1)} type="button">Reintentar</button>
          <button className="ghost-button" onClick={onBack} type="button">Volver a pacientes</button>
        </div>
      </section>
    );
  }

  return (
    <div className="view-stack patient-detail-view">
      <section className="page-heading compact-heading patient-detail-header">
        <div>
          <button className="patient-back-link" onClick={onBack} type="button">← Pacientes</button>
          <p>Paciente de-identificado</p>
          <h1>{state.patient.patientReference}</h1>
        </div>
        <dl className="patient-detail-summary">
          <div><dt>Estudios</dt><dd>{summary?.count ?? 0}</dd></div>
          <div><dt>Último estudio conocido</dt><dd>{summary?.latestDate}</dd></div>
          <div><dt>Estado más reciente</dt><dd>{summary?.latestStatus}</dd></div>
        </dl>
      </section>

      <section className="panel-card patient-studies-panel">
        <div className="section-title">
          <div>
            <h2>Estudios</h2>
            <p className="muted compact-copy">Estudios asociados explícitamente a este paciente.</p>
          </div>
        </div>

        {state.studies.length === 0 ? (
          <div className="clinical-empty-state">
            <h3>Este paciente todavía no tiene estudios asociados</h3>
            <p>Puede existir sin estudios si el análisis fue cancelado antes de completarse.</p>
          </div>
        ) : (
          <ol className="patient-study-timeline" aria-label={`Estudios de ${state.patient.patientReference}`}>
            {state.studies.map((study) => (
              <li key={study.id}>
                <div className="patient-study-marker" aria-hidden="true" />
                <article className="patient-study-card">
                  <header>
                    <div>
                      {study.studyDate
                        ? <time dateTime={study.studyDate}>{displayPatientStudyDate(study.studyDate)}</time>
                        : <span className="patient-study-date-missing">Fecha no informada</span>}
                      <h3>{study.caseId}</h3>
                    </div>
                    <StatusBadge tone={statusTone(study.status)}>{displayPatientStudyStatus(study.status)}</StatusBadge>
                  </header>
                  <dl>
                    <div><dt>Modalidad</dt><dd>{study.modality ?? "No informada"}</dd></div>
                    <div><dt>Prioridad</dt><dd>{displayPriority(study.reviewPriority)}</dd></div>
                    <div><dt>Descripción</dt><dd>{study.description ?? "Sin descripción"}</dd></div>
                  </dl>
                  <button className="ghost-button" onClick={() => onOpenStudy(study.caseId)} type="button">Abrir estudio</button>
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
