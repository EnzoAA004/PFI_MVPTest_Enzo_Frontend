import type { Measurement } from "../appTypes";

interface MeasurementsPanelProps {
  measurements: Measurement[];
  inferenceStatus?: string;
  description?: string;
  onChange: (measurements: Measurement[], detail: string) => void;
}

const measurementLabelMap: Record<string, string> = {
  "vertebra_group area": "Área total segmentada — grupo vertebral",
  "vertebra_group width": "Extensión horizontal — grupo vertebral",
  "vertebra_group height": "Extensión vertical — grupo vertebral",
  "canal area": "Área total segmentada — canal",
  "canal width": "Extensión horizontal — canal",
  "canal height": "Extensión vertical — canal",
  "disc_group area": "Área total segmentada — grupo discal",
  "disc_group width": "Extensión horizontal — grupo discal",
  "disc_group height": "Extensión vertical — grupo discal",
};

function normalizedMeasurementKey(measurement: Measurement) {
  return `${measurement.label ?? measurement.id}`.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase().trim();
}

export function displayMeasurementLabel(measurement: Measurement) {
  const key = normalizedMeasurementKey(measurement);
  if (measurementLabelMap[key]) return measurementLabelMap[key];
  if (key.includes("vertebra group") && key.includes("area")) return measurementLabelMap["vertebra_group area"];
  if (key.includes("vertebra group") && key.includes("width")) return measurementLabelMap["vertebra_group width"];
  if (key.includes("vertebra group") && key.includes("height")) return measurementLabelMap["vertebra_group height"];
  if (key.includes("canal") && key.includes("area")) return measurementLabelMap["canal area"];
  if (key.includes("canal") && key.includes("width")) return measurementLabelMap["canal width"];
  if (key.includes("canal") && key.includes("height")) return measurementLabelMap["canal height"];
  if (key.includes("disc group") && key.includes("area")) return measurementLabelMap["disc_group area"];
  if (key.includes("disc group") && key.includes("width")) return measurementLabelMap["disc_group width"];
  if (key.includes("disc group") && key.includes("height")) return measurementLabelMap["disc_group height"];
  return measurement.label;
}

export function displayMeasurementUnit(unit: string) {
  return unit === "mm2" ? "mm²" : unit;
}

function numericValue(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function formatTechnicalConfidence(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1).replace(".", ",")} %` : "N/D";
}

export function displayMeasurementPlane(plane: Measurement["plane"]) {
  if (plane === "sagittal") return "Sagital";
  if (plane === "axial") return "Axial";
  return "no informado";
}

export function measurementDelta(measurement: Measurement) {
  const ai = numericValue(measurement.aiValue ?? measurement.value);
  const reviewer = numericValue(measurement.reviewerValue);
  if (ai === undefined || reviewer === undefined) return "N/D";
  const delta = reviewer - ai;
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta.toFixed(2).replace(".", ",")}`;
}

export function applyReviewerMeasurementEdit(measurements: Measurement[], id: string, reviewerValue: string) {
  return measurements.map((measurement) =>
    measurement.id === id
      ? {
        ...measurement,
        aiValue: measurement.aiValue ?? measurement.value,
        reviewerValue,
        source: "Reviewer" as const,
        status: "editado" as const,
        placeholder: false,
      }
      : measurement,
  );
}

export function MeasurementsPanel({ measurements, inferenceStatus, description, onChange }: MeasurementsPanelProps) {
  function updateValue(id: string, value: string) {
    onChange(applyReviewerMeasurementEdit(measurements, id, value), `${id} actualizado por revisor`);
  }

  const hasMultiplePlanes = new Set(measurements.map((measurement) => measurement.plane ?? "no informado")).size > 1;
  const orderedMeasurements = hasMultiplePlanes
    ? [...measurements].sort((a, b) => (a.plane === b.plane ? 0 : a.plane === "sagittal" ? -1 : 1))
    : measurements;
  const regionLabel = hasMultiplePlanes ? "Mediciones tecnicas por plano (sagital y axial)" : "Mediciones tecnicas sagitales";

  return (
    <section className="panel-card measurements-panel">
      <div className="section-title">
        <h2>Mediciones</h2>
        <span className="technical-state">{inferenceStatus === "pending_real_inference" ? "Inferencia real pendiente" : "Revisable"}</span>
      </div>
      {description && <p className="technical-note">{description}</p>}
      <p className="technical-note measurement-honesty-note">Estas son metricas geometricas tecnicas calculadas sobre mascaras agrupadas. No corresponden todavia a mediciones clinicas por nivel vertebral y requieren revision profesional.</p>
      <div className="measurement-table professional-measurement-table" role="region" aria-label={regionLabel}>
        <div className="measurement-head">
          {hasMultiplePlanes && <span>Plano</span>}
          <span>Metrica</span>
          <span>Valor IA original</span>
          <span>Valor revisado</span>
          <span>Unidad</span>
          <span title="Promedio de probabilidades del modelo sobre los pixeles de la clase predicha. No representa certeza clinica.">Confianza tecnica</span>
          <span>Estado</span>
          <span>Diferencia</span>
        </div>
        {orderedMeasurements.map((measurement) => {
          const aiValue = measurement.aiValue ?? measurement.value;
          const reviewerValue = measurement.reviewerValue ?? "";
          return (
            <div className="measurement-row" data-plane={measurement.plane ?? "no informado"} key={measurement.id}>
              {hasMultiplePlanes && <span className="measurement-plane-tag">{displayMeasurementPlane(measurement.plane)}</span>}
              <span title={`Tecnico original: ${measurement.label}`}>{displayMeasurementLabel(measurement)}</span>
              <span className="tabular-value ai-measurement-value">{String(aiValue)}</span>
              <input aria-label={`Valor revisado para ${displayMeasurementLabel(measurement)} (${displayMeasurementPlane(measurement.plane)})`} value={String(reviewerValue)} onChange={(event) => updateValue(measurement.id, event.target.value)} placeholder={String(aiValue)} />
              <span>{displayMeasurementUnit(measurement.unit)}</span>
              <span>{formatTechnicalConfidence(measurement.confidence)}</span>
              <span>{measurement.status}</span>
              <span className="tabular-value">{measurementDelta(measurement)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
