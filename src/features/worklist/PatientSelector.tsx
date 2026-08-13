import { useEffect, useState, type FormEvent } from "react";
import { BackendApiError } from "../../multiplanarApi";
import {
  createPatient,
  searchPatients,
  type PatientSummary,
} from "../../patientApi";

type PatientMode = "existing" | "new";

type Props = {
  disabled?: boolean;
  selectedPatient: PatientSummary | null;
  onSelected: (patient: PatientSummary | null) => void;
};

type SearchState =
  | { status: "idle"; results: PatientSummary[] }
  | { status: "loading"; results: PatientSummary[] }
  | { status: "ready"; results: PatientSummary[] }
  | { status: "error"; results: PatientSummary[] };

const PATIENT_REFERENCE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function patientReferenceIssue(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "Ingresá una referencia de paciente.";
  if (normalized.length > 64) return "La referencia no puede superar 64 caracteres.";
  if (!PATIENT_REFERENCE_PATTERN.test(normalized)) {
    return "Usá sólo letras, números, punto, guion o guion bajo.";
  }
  return "";
}

export function PatientSelector({ disabled = false, selectedPatient, onSelected }: Props) {
  const [mode, setMode] = useState<PatientMode>("existing");
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>({ status: "idle", results: [] });
  const [newReference, setNewReference] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (mode !== "existing" || selectedPatient) return;
    const normalized = query.trim();
    if (!normalized) {
      setSearchState({ status: "idle", results: [] });
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setSearchState((current) => ({ status: "loading", results: current.results }));
      void searchPatients(normalized)
        .then((results) => {
          if (!cancelled) setSearchState({ status: "ready", results });
        })
        .catch(() => {
          if (!cancelled) setSearchState({ status: "error", results: [] });
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [mode, query, selectedPatient]);

  function changeMode(next: PatientMode) {
    setMode(next);
    onSelected(null);
    setCreateError("");
    setSearchState({ status: "idle", results: [] });
  }

  async function submitNewPatient(event: FormEvent) {
    event.preventDefault();
    const issue = patientReferenceIssue(newReference);
    if (issue) {
      setCreateError(issue);
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const patient = await createPatient({ patientReference: newReference.trim() });
      onSelected(patient);
    } catch (error) {
      if (error instanceof BackendApiError && error.status === 409) {
        setCreateError("Ya existe un paciente con esa referencia.");
      } else if (error instanceof BackendApiError && error.status === 400) {
        setCreateError("La referencia no es válida. Revisá el formato e intentá nuevamente.");
      } else {
        setCreateError("No se pudo crear el paciente. Reintentá.");
      }
    } finally {
      setCreating(false);
    }
  }

  if (selectedPatient) {
    return (
      <section aria-live="polite" className="wl-patient-selected">
        <span className="wl-patient-selected-label"><b aria-hidden="true">01</b> Paciente seleccionado</span>
        <strong>{selectedPatient.patientReference}</strong>
        <button
          disabled={disabled}
          onClick={() => {
            onSelected(null);
            setMode("existing");
          }}
          type="button"
        >
          Cambiar
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="patient-section-title" className="wl-patient-selector">
      <div className="wl-patient-heading">
        <strong id="patient-section-title"><span aria-hidden="true">01</span> Paciente</strong>
        <span>Obligatorio para un análisis nuevo</span>
      </div>

      <div aria-label="Tipo de paciente" className="wl-patient-modes" role="radiogroup">
        <label>
          <input
            checked={mode === "existing"}
            disabled={disabled}
            name="patient-mode"
            onChange={() => changeMode("existing")}
            type="radio"
          />
          Paciente existente
        </label>
        <label>
          <input
            checked={mode === "new"}
            disabled={disabled}
            name="patient-mode"
            onChange={() => changeMode("new")}
            type="radio"
          />
          Nuevo paciente
        </label>
      </div>

      {mode === "existing" ? (
        <div className="wl-patient-search">
          <label className="wl-field" htmlFor="patient-search-query">
            <span>Buscar por referencia</span>
            <input
              autoComplete="off"
              disabled={disabled}
              id="patient-search-query"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="PAC-00"
              value={query}
            />
          </label>
          <div aria-live="polite" className="wl-patient-search-state">
            {searchState.status === "idle" && <p>Ingresá una referencia para buscar.</p>}
            {searchState.status === "loading" && <p>Buscando pacientes…</p>}
            {searchState.status === "error" && <p className="wl-drawer-error">No se pudieron buscar pacientes. Reintentá.</p>}
            {searchState.status === "ready" && searchState.results.length === 0 && <p>No se encontraron pacientes.</p>}
            {searchState.status === "ready" && searchState.results.length > 0 && (
              <ul aria-label="Resultados de pacientes" className="wl-patient-results">
                {searchState.results.map((patient) => (
                  <li key={patient.id}>
                    <button disabled={disabled} onClick={() => onSelected(patient)} type="button">
                      {patient.patientReference}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <form className="wl-patient-create" onSubmit={(event) => void submitNewPatient(event)}>
          <label className="wl-field" htmlFor="new-patient-reference">
            <span>Referencia de paciente</span>
            <input
              aria-describedby="new-patient-help"
              autoComplete="off"
              disabled={disabled || creating}
              id="new-patient-reference"
              maxLength={64}
              onChange={(event) => {
                setNewReference(event.target.value);
                setCreateError("");
              }}
              placeholder="PAC-001"
              value={newReference}
            />
            <em id="new-patient-help">Usá una referencia de-identificada. No ingreses nombre, DNI ni otros datos identificatorios.</em>
          </label>
          {createError && <p className="wl-drawer-error">{createError}</p>}
          {createError === "Ya existe un paciente con esa referencia." && (
            <button
              className="wl-patient-link"
              onClick={() => {
                setQuery(newReference.trim());
                changeMode("existing");
              }}
              type="button"
            >
              Buscar paciente existente
            </button>
          )}
          <button className="wl-patient-create-button" disabled={disabled || creating} type="submit">
            {creating ? "Creando…" : "Crear paciente"}
          </button>
        </form>
      )}
    </section>
  );
}
