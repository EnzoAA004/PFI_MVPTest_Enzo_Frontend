/** Public presentation contract for P10.7 disc-degenerative findings. */

export const DISC_FINDING_TYPES = [
  "disc_bulging",
  "disc_narrowing",
  "upper_endplate_change",
  "lower_endplate_change",
  "pfirrmann_grade",
  "modic_change",
  "disc_herniation",
  "spondylolisthesis",
] as const;
export type DiscFindingType = typeof DISC_FINDING_TYPES[number];

export const DISC_LEVELS = ["L1-L2", "L2-L3", "L3-L4", "L4-L5", "L5-S1"] as const;
export type DiscLevel = typeof DISC_LEVELS[number];

export const DEPLOYMENT_STATUSES = ["supported_internal", "experimental", "not_product_supported"] as const;
export type DeploymentStatus = typeof DEPLOYMENT_STATUSES[number];

const PFIRRMANN_LABELS = ["I", "II", "III", "IV", "V"] as const;
const MODIC_LABELS = ["none", "I", "II", "III"] as const;
const BINARY_LABELS = ["absent", "present"] as const;

export function labelsFor(findingType: DiscFindingType): readonly string[] {
  if (findingType === "pfirrmann_grade") return PFIRRMANN_LABELS;
  if (findingType === "modic_change") return MODIC_LABELS;
  return BINARY_LABELS;
}

export const SCHEMA_VERSION = "pfi.disc-degenerative-findings.v1";

export type DiscFinding = {
  findingId: string;
  findingType: DiscFindingType;
  level: DiscLevel;
  label: string;
  deploymentStatus: DeploymentStatus;
  evaluationDataset: string;
  externalValidationAvailable: boolean;
  researchOnly: true;
  localizationValidated: false;
  modelId: string;
  modelSha256: string;
  reviewRequired: true;
  reviewStatus: "pending";
};

export class DiscDegenerativeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscDegenerativeContractError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Parses one finding from the Backend public projection. Probabilities are not
 * part of that contract: their presence invalidates the item instead of creating
 * confidence bars or reconstructing a score.
 */
export function parseDiscFinding(value: unknown): DiscFinding | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const findingId = text(raw.findingId);
  const findingType = text(raw.findingType) as DiscFindingType;
  if (!findingId || !DISC_FINDING_TYPES.includes(findingType)) return null;

  const anatomy = asRecord(raw.anatomy);
  const level = text(anatomy?.level) as DiscLevel;
  if (!DISC_LEVELS.includes(level)) return null;

  const classification = asRecord(raw.classification);
  const label = text(classification?.label);
  if (!classification || !labelsFor(findingType).includes(label)) return null;
  const expectedKind = findingType === "pfirrmann_grade" || findingType === "modic_change"
    ? "categorical"
    : "binary";
  if (classification.kind !== expectedKind) return null;
  if (Object.prototype.hasOwnProperty.call(classification, "probabilities")) return null;

  const evidence = asRecord(raw.evidence);
  const deploymentStatus = text(evidence?.deploymentStatus) as DeploymentStatus;
  if (!evidence
    || !DEPLOYMENT_STATUSES.includes(deploymentStatus)
    || typeof evidence.externalValidationAvailable !== "boolean") return null;

  const localization = asRecord(raw.localization);
  if (!localization
    || localization.source !== "segmentation_derived_disc_level"
    || localization.researchOnly !== true
    || localization.automaticAnatomicalLocalizationValidated !== false) return null;

  const model = asRecord(raw.model);
  const modelId = text(model?.modelId);
  const modelSha256 = text(model?.modelSha256);
  if (!modelId || !/^[a-f0-9]{64}$/i.test(modelSha256)) return null;

  const review = asRecord(raw.review);
  if (!review || review.required !== true || review.status !== "pending" || raw.notClinicalDiagnosis !== true) return null;

  return {
    findingId,
    findingType,
    level,
    label,
    deploymentStatus,
    evaluationDataset: text(evidence.evaluationDataset),
    externalValidationAvailable: evidence.externalValidationAvailable,
    researchOnly: true,
    localizationValidated: false,
    modelId,
    modelSha256,
    reviewRequired: true,
    reviewStatus: "pending",
  };
}

/** All-or-nothing parsing prevents a broken item from becoming a partial clinical result. */
export function parseDiscDegenerativeFindings(value: unknown): DiscFinding[] {
  const raw = asRecord(value);
  if (!raw || text(raw.schemaVersion) !== SCHEMA_VERSION) {
    throw new DiscDegenerativeContractError("Contrato P10.7 inválido: schemaVersion inesperado.");
  }
  if (!Array.isArray(raw.findings) || raw.findings.length === 0) {
    throw new DiscDegenerativeContractError("Contrato P10.7 inválido: findings ausente o vacío.");
  }
  const findings = raw.findings.map(parseDiscFinding);
  if (findings.some((finding) => finding === null)) {
    throw new DiscDegenerativeContractError("Contrato P10.7 inválido: contiene findings incompletos.");
  }
  return findings as DiscFinding[];
}

function requireSafetyFlags(raw: Record<string, unknown>, context: string) {
  if (raw.humanReviewRequired !== true
    || raw.notClinicalDiagnosis !== true
    || raw.autonomousDiagnosis !== false) {
    throw new DiscDegenerativeContractError(`${context}: faltan flags de seguridad obligatorios.`);
  }
}

/** Live POST response, including confirmation that the immutable snapshot was persisted. */
export function parseDiscDegenerativeFindingsResponse(value: unknown, multiplanarRunId: string): DiscFinding[] {
  const raw = asRecord(value);
  if (!raw) throw new DiscDegenerativeContractError("Contrato P10.7 inválido: respuesta vacía.");
  requireSafetyFlags(raw, "Contrato P10.7 inválido");
  const persistence = asRecord(raw.persistence);
  if (!persistence
    || persistence.status !== "persisted_immutable"
    || persistence.multiplanarRunId !== multiplanarRunId
    || persistence.reviewStoredSeparately !== true) {
    throw new DiscDegenerativeContractError("Contrato P10.7 inválido: persistencia no confirmada.");
  }
  return parseDiscDegenerativeFindings(raw.discDegenerativeFindings);
}

/** Durable projection returned in a persisted run's metricsSnapshot. */
export function parsePersistedDiscDegenerativeFindings(value: unknown): DiscFinding[] {
  const snapshot = asRecord(value);
  if (!snapshot) throw new DiscDegenerativeContractError("Snapshot P10.7 inválido.");
  const governance = asRecord(snapshot.discDegenerativeGovernance);
  if (!governance) throw new DiscDegenerativeContractError("Snapshot P10.7 sin governance.");
  requireSafetyFlags(governance, "Snapshot P10.7 inválido");
  if (governance.predictionImmutable !== true || governance.reviewStoredSeparately !== true) {
    throw new DiscDegenerativeContractError("Snapshot P10.7 no separa predicción y revisión.");
  }
  return parseDiscDegenerativeFindings(snapshot.discDegenerativeFindings);
}

export function sortDiscFindings(findings: DiscFinding[]): DiscFinding[] {
  return [...findings].sort((a, b) => {
    const byLevel = DISC_LEVELS.indexOf(a.level) - DISC_LEVELS.indexOf(b.level);
    if (byLevel !== 0) return byLevel;
    return DISC_FINDING_TYPES.indexOf(a.findingType) - DISC_FINDING_TYPES.indexOf(b.findingType);
  });
}

export function groupDiscFindingsByLevel(findings: DiscFinding[]): { level: DiscLevel; findings: DiscFinding[] }[] {
  const byLevel = new Map<DiscLevel, DiscFinding[]>();
  for (const finding of sortDiscFindings(findings)) {
    const bucket = byLevel.get(finding.level);
    if (bucket) bucket.push(finding);
    else byLevel.set(finding.level, [finding]);
  }
  return DISC_LEVELS
    .filter((level) => byLevel.has(level))
    .map((level) => ({ level, findings: byLevel.get(level) as DiscFinding[] }));
}
