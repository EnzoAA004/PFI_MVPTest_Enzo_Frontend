import type { Measurement } from "../types";

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
    onChange(updated, `${id} actualizado por Reviewer`);
  }

  return (
    <section className="panel-card measurements-panel">
      <div className="section-title">
        <h2>Measurements</h2>
        <span className="technical-state">{inferenceStatus === "pending_real_inference" ? "Inferencia real pendiente" : "Revisable"}</span>
      </div>
      {description && <p className="technical-note">{description}</p>}
      <div className="measurement-table">
        <div className="measurement-head">
          <span>Measurement</span>
          <span>Value</span>
          <span>Unit</span>
          <span>Conf.</span>
          <span>Source</span>
          <span>Status</span>
          <span>Outlier</span>
        </div>
        {measurements.map((measurement) => (
          <div className="measurement-row" key={measurement.id}>
            <span>{measurement.label}</span>
            <input value={String(measurement.value)} onChange={(event) => updateValue(measurement.id, event.target.value)} />
            <span>{measurement.unit}</span>
            <span>{measurement.confidence ? `${Math.round(measurement.confidence * 100)}%` : "N/A"}</span>
            <span>{measurement.source}</span>
            <span>{measurement.status}</span>
            <span>{measurement.outlier ? "Yes" : "No"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
