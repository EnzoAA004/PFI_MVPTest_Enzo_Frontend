export type MeasurementCategory = "disc" | "canal" | "vertebra" | "general" | "unassigned" | "other";

export type GroupableMeasurement = {
  id: string;
  labelKey?: string | null;
  label?: string | null;
  level?: string | null;
  levelScope?: string | null;
};

export type MeasurementGroup<T extends GroupableMeasurement> = {
  category: MeasurementCategory;
  label: string;
  rows: T[];
};

export const MEASUREMENT_CATEGORY_ORDER: readonly MeasurementCategory[] = [
  "disc",
  "canal",
  "vertebra",
  "general",
  "unassigned",
  "other",
];

export const MEASUREMENT_CATEGORY_LABELS: Record<MeasurementCategory, string> = {
  disc: "Disco",
  canal: "Canal",
  vertebra: "Vértebra",
  general: "Generales",
  unassigned: "Sin nivel",
  other: "Otras",
};

const UNKNOWN_LEVELS = new Set(["", "nivel no informado", "sin nivel", "unassigned", "unknown"]);

function technicalTokens(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function categoryFromTechnicalValue(value: string | null | undefined): MeasurementCategory | null {
  const normalized = (value ?? "").trim().toLowerCase().replace(/-/g, "_");
  // Convenciones de clases axiales ya persistidas por el producto.
  if (/(^|_)raw_50(?:_|\s|$)/.test(normalized)) return "disc";
  if (/(^|_)raw_150(?:_|\s|$)/.test(normalized)) return "canal";
  const tokens = new Set(technicalTokens(value));
  if (tokens.has("disc") || tokens.has("discal") || tokens.has("intervertebral")) return "disc";
  if (tokens.has("canal") || tokens.has("spinalcanal")) return "canal";
  if (tokens.has("vertebra") || tokens.has("vertebral") || tokens.has("body")) return "vertebra";
  return null;
}

/**
 * Clasificación exclusivamente visual. Prioriza la clave canónica, conserva una
 * compatibilidad acotada con convenciones técnicas antiguas y usa el id sólo como
 * último recurso. Nunca deriva anatomía de un label clínico traducido.
 */
export function classifyMeasurement(row: GroupableMeasurement): MeasurementCategory {
  if (row.levelScope === "study") return "general";

  const level = (row.level ?? "").trim().toLowerCase();
  if (!row.level || UNKNOWN_LEVELS.has(level)) return "unassigned";

  return categoryFromTechnicalValue(row.labelKey)
    ?? categoryFromTechnicalValue(row.label)
    ?? categoryFromTechnicalValue(row.id)
    ?? "other";
}

export function groupMeasurements<T extends GroupableMeasurement>(rows: readonly T[]): MeasurementGroup<T>[] {
  const buckets = new Map<MeasurementCategory, T[]>();
  for (const category of MEASUREMENT_CATEGORY_ORDER) buckets.set(category, []);

  for (const row of rows) buckets.get(classifyMeasurement(row))!.push(row);

  return MEASUREMENT_CATEGORY_ORDER.flatMap((category) => {
    const groupedRows = buckets.get(category)!;
    return groupedRows.length
      ? [{ category, label: MEASUREMENT_CATEGORY_LABELS[category], rows: groupedRows }]
      : [];
  });
}
