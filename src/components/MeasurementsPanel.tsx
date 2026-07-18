import type { Measurement } from "../appTypes";

interface MeasurementsPanelProps {
  measurements: Measurement[];
  inferenceStatus?: string;
  description?: string;
  onChange: (measurements: Measurement[], detail: string) => void;
}

export function MeasurementsPanel({ measurements, inferenceStatus, description, onChange }: MeasurementsPanelProps) {
  function updateValue(id: string, value: string) {
    const updated = measurements.map((measurement) =>
      measurement.id === id
        ? { ...measurement, value, source: "Reviewer" as const, status: "editado" as const, placeholder: false }
        : measurement,
    );
    onChange(updated, `${id} actualizado por revisor`);
  }

  function sourceLabel(source?: Measurement["source"]) {
    if (source === "Reviewer") return "Revisor";
    if (source === "Placeholder") return "Marcador";
    return "IA";
  }

  return (
    <section className="panel-card measurements-panel">
      <div className="section-title">
        <h2>Mediciones</h2>
        <span className="technical-state">{inferenceStatus === "pending_real_inference" ? "Inferencia real pendiente" : "Revisable"}</span>
      </div>
      {description && <p className="technical-note">{description}</p>}
      <div className="measurement-table">
        <div className="measurement-head">
          <span>Medición</span>
          <span>Valor</span>
          <span>Unidad</span>
          <span>Conf.</span>
          <span>Origen</span>
          <span>Estado</span>
          <span>Atípico</span>
        </div>
        {measurements.map((measurement) => (
          <div className="measurement-row" key={measurement.id}>
            <span>{measurement.label}</span>
            <input value={String(measurement.value)} onChange={(event) => updateValue(measurement.id, event.target.value)} />
            <span>{measurement.unit}</span>
            <span>{measurement.confidence ? `${Math.round(measurement.confidence * 100)}%` : "N/D"}</span>
            <span>{sourceLabel(measurement.source)}</span>
            <span>{measurement.status}</span>
            <span>{measurement.outlier ? "Sí" : "No"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
