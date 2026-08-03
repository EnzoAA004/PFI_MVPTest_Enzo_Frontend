import { ALWAYS_SHOWN_LEVELS, SPINE_LEVELS, normalizeLevel, type SpineLevel } from "../../clinicalDisplay";

/**
 * Groups findings by vertebral level — the axis a radiologist actually reads and
 * reports a lumbar MRI on, craniocaudal and alternating body with disc space.
 *
 * The ten lumbar levels are always rendered, with or without a finding: "nothing at
 * L3-L4" is a clinical statement, and a level silently missing from the panel is
 * indistinguishable from a level that was never looked at. Levels outside that range
 * appear only when the study reaches them, which is the same rule read the other
 * way: an always-present empty T9-T10 row would claim a level was examined that was
 * never in the field of view.
 *
 * A finding without a level lands in one of two places, and the distinction is the
 * point: the canal area describes the whole study because its mask runs the length
 * of the spine, while a measurement whose level the AI could not determine is a gap.
 * Filing both under "sin nivel asignado" accused the model of a failure it did not
 * have. Neither is ever spread across levels by guesswork.
 */

export type LevelFinding = {
  id: string;
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  confidence?: number;
  outlier?: boolean;
};

export type LevelGroupKind = "level" | "study" | "unassigned";

export type LevelGroup = {
  /** Canonical level, or null for the groups that are not a level. */
  level: SpineLevel | null;
  kind: LevelGroupKind;
  /** Stable identity for selection — two groups can share a null level. */
  key: string;
  label: string;
  findings: LevelFinding[];
};

export type LevelledInput = {
  id: string;
  label: string;
  level?: string | null;
  /** "study" when the measurement does not describe a level. Defaults to "level". */
  levelScope?: string | null;
  value?: number | string | null;
  unit?: string;
  confidence?: number;
  outlier?: boolean;
};

const GENERAL_KEY = "__general__";
const UNASSIGNED_KEY = "__unassigned__";

/**
 * Recovers the level from a measurement id, for runs persisted before the backend
 * stopped discarding levels outside L1-L2…L5-S1.
 *
 * This reads back what the AI Module wrote rather than inferring anything: the id is
 * built from the level it assigned (`sagittal-disc-t11-t12-width`), and a disc it
 * could not name gets a positional slug (`sagittal-disc-d1-width`) that no level
 * matches. So a level only comes back when there was one to begin with.
 *
 * Without this, a study whose legend reads "Disco T11-T12" listed that same disc
 * under "sin nivel asignado" two panels to the right.
 */
export function levelFromMeasurementId(id: string): SpineLevel | null {
  const parts = id.split("-");
  // El ultimo segmento es la magnitud (area/width/height); antes viene el nivel, que
  // puede ocupar uno o dos segmentos segun sea un cuerpo ("l4") o un espacio ("l4-l5").
  for (const candidate of [parts.slice(-3, -1).join("-"), parts.slice(-2, -1).join("-")]) {
    const level = normalizeLevel(candidate);
    if (level) return level;
  }
  return null;
}

export function groupFindingsByLevel(items: LevelledInput[]): LevelGroup[] {
  const byLevel = new Map<string, LevelFinding[]>();
  for (const level of SPINE_LEVELS) byLevel.set(level, []);
  byLevel.set(GENERAL_KEY, []);
  byLevel.set(UNASSIGNED_KEY, []);

  for (const item of items) {
    const level = normalizeLevel(item.level) ?? levelFromMeasurementId(item.id);
    const fallback = item.levelScope === "study" ? GENERAL_KEY : UNASSIGNED_KEY;
    const bucket = byLevel.get(level ?? fallback) ?? byLevel.get(UNASSIGNED_KEY)!;
    bucket.push({
      id: item.id,
      label: item.label,
      value: item.value,
      unit: item.unit,
      confidence: item.confidence,
      outlier: item.outlier,
    });
  }

  const groups: LevelGroup[] = SPINE_LEVELS.filter(
    (level) => ALWAYS_SHOWN_LEVELS.includes(level) || (byLevel.get(level) ?? []).length,
  ).map((level) => ({
    level,
    kind: "level" as const,
    key: level,
    label: level,
    findings: byLevel.get(level) ?? [],
  }));

  const general = byLevel.get(GENERAL_KEY) ?? [];
  if (general.length) {
    groups.push({ level: null, kind: "study", key: GENERAL_KEY, label: "Medición general", findings: general });
  }
  const unassigned = byLevel.get(UNASSIGNED_KEY) ?? [];
  if (unassigned.length) {
    groups.push({ level: null, kind: "unassigned", key: UNASSIGNED_KEY, label: "Sin nivel asignado", findings: unassigned });
  }
  return groups;
}

/** True when no finding reached a level — drives the panel's notice. */
export function allFindingsUnassigned(groups: LevelGroup[]) {
  const assigned = groups.filter((g) => g.kind === "level").reduce((total, g) => total + g.findings.length, 0);
  const unassigned = groups.find((g) => g.kind === "unassigned")?.findings.length ?? 0;
  return assigned === 0 && unassigned > 0;
}
