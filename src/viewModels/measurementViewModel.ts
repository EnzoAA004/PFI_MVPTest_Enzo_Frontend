import type { Measurement, Plane } from "../appTypes";
import type { CanonicalMeasurement } from "../contracts/canonicalMultiplanarRun";

/**
 * CanonicalMeasurement -> Measurement (visual view model). labelKey is the
 * stable, untranslated identity of the measurement; `label` mirrors it
 * unchanged (no Spanish translation happens here — that belongs exclusively
 * to clinicalDisplay.ts / displayMeasurementLabel() at render time).
 */
export function canonicalMeasurementToViewMeasurement(measurement: CanonicalMeasurement, plane: Plane, index: number): Measurement {
  const id = measurement.id || `${plane}-measurement-${index}`;
  const labelKey = measurement.labelKey || undefined;
  return {
    id,
    label: labelKey ?? `Medición ${index + 1}`,
    labelKey,
    level: measurement.level ?? undefined,
    value: measurement.value ?? "",
    aiValue: measurement.value ?? "",
    reviewerValue: measurement.reviewerValue ?? undefined,
    unit: measurement.unit ?? "",
    confidence: measurement.confidence,
    plane,
    source: "AI",
    status: "pendiente",
    outlier: false,
    placeholder: Boolean(measurement.placeholder),
  };
}
