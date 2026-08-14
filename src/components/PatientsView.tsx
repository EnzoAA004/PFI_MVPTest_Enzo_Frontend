import { useEffect, useState } from "react";
import { searchPatients, type PatientSummary } from "../patientApi";
import { OperationsPageHeader } from "./OperationsPageHeader";

interface PatientsViewProps {
  onOpenPatient: (patientId: string) => void;
}

type PatientListState =
  | { status: "loading"; patients: PatientSummary[] }
  | { status: "ready"; patients: PatientSummary[] }
  | { status: "error"; patients: PatientSummary[] };

function displayCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function PatientsView({ onOpenPatient }: PatientsViewProps) {
  const [query, setQuery] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [state, setState] = useState<PatientListState>({ status: "loading", patients: [] });

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setState((current) => ({ status: "loading", patients: current.patients }));
      void searchPatients(query, 100)
        .then((patients) => {
          if (!cancelled) setState({ status: "ready", patients });
        })
        .catch(() => {
          if (!cancelled) setState({ status: "error", patients: [] });
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [query, retryNonce]);

  const normalizedQuery = query.trim();
  const initialEmpty = state.status === "ready" && !normalizedQuery && state.patients.length === 0;
  const searchEmpty = state.status === "ready" && Boolean(normalizedQuery) && state.patients.length === 0;

  return (
    <div className="view-stack patient-directory-view">
      {/*
        El mismo encabezado que la lista de trabajo, y por el mismo motivo: la
        barra lateral ya dice "Pacientes", así que el antetítulo lo repetía, y
        el título de la tarjeta interna ("Índice de pacientes") era el tercer
        nombre para la misma pantalla en veinte píxeles de alto.

        Lo que sí se conserva como bajada es de dónde salen los datos: que la
        lista venga del registro de pacientes y no de las referencias de los
        estudios no se deduce mirándola, y es justamente la distinción que
        PATIENT-PR2 introdujo.
      */}
      <OperationsPageHeader
        title="Pacientes registrados"
        description="Del registro de pacientes, no derivado de las referencias de los estudios."
        meta={(
          <span className="patient-directory-total" aria-live="polite">
            {state.status === "ready" ? state.patients.length : "—"} {normalizedQuery ? "resultados" : "registrados"}
          </span>
        )}
      />

      <section className="panel-card patient-directory-panel">
        <div className="patient-directory-search">
          <label className="worklist-search-input" htmlFor="patient-directory-query">
            <span>Buscar por referencia</span>
            <input
              autoComplete="off"
              id="patient-directory-query"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="PAC-001"
              type="search"
              value={query}
            />
          </label>
          {query && (
            <button className="ghost-button" onClick={() => setQuery("")} type="button">
              Limpiar búsqueda
            </button>
          )}
        </div>

        <div aria-live="polite" aria-busy={state.status === "loading"}>
          {state.status === "loading" && (
            <div className="panel-hidden-placeholder">Consultando pacientes…</div>
          )}
          {state.status === "error" && (
            <div className="clinical-empty-state" role="alert">
              <h3>No se pudo cargar la lista de pacientes</h3>
              <p>Revisá la conexión e intentá nuevamente.</p>
              <button className="ghost-button" onClick={() => setRetryNonce((value) => value + 1)} type="button">Reintentar</button>
            </div>
          )}
          {initialEmpty && (
            <div className="clinical-empty-state">
              <h3>No hay pacientes registrados todavía</h3>
              <p>Los pacientes se crean de forma de-identificada desde Nuevo análisis.</p>
            </div>
          )}
          {searchEmpty && (
            <div className="clinical-empty-state">
              <h3>No se encontraron pacientes</h3>
              <p>Probá con otro prefijo de referencia.</p>
              <button className="ghost-button" onClick={() => setQuery("")} type="button">Ver todos</button>
            </div>
          )}
          {state.status === "ready" && state.patients.length > 0 && (
            <ul className="patient-directory-list" aria-label="Pacientes registrados">
              {state.patients.map((patient) => (
                <li key={patient.id}>
                  <div>
                    <strong>{patient.patientReference}</strong>
                    <span>Paciente de-identificado · registrado el {displayCreatedAt(patient.createdAt)}</span>
                  </div>
                  <button className="ghost-button" onClick={() => onOpenPatient(patient.id)} type="button">
                    Ver paciente
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
