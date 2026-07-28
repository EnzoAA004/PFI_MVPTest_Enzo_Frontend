import { ContractError } from "../api";
import type { Plane } from "../appTypes";
import {
  MULTIPLANAR_CONTRACT_V2,
  type CanonicalAssetName,
  type CanonicalLandmark,
  type CanonicalMeasurement,
  type CanonicalMultiplanarRun,
  type CanonicalPlaneAsset,
  type CanonicalPlaneInput,
  type CanonicalPlaneMask,
  type CanonicalPlaneModel,
  type CanonicalPlaneQuality,
  type CanonicalPlaneRun,
  type CanonicalPlaneSeriesItem,
  type CanonicalThreeD,
  type CanonicalThreeDAsset,
  type CanonicalThreeDReconstruction,
} from "../contracts/canonicalMultiplanarRun";

const ALLOWED_ASSET_NAMES: CanonicalAssetName[] = ["input.png", "overlay.png", "mask-preview.png"];

const BLOCKED_URL_PATTERNS: RegExp[] = [
  /^[a-zA-Z]:\\/, // Windows drive path, e.g. C:\...
  /^\/tmp\//,
  /^\/app\//,
  /mask\.npy/i,
  /confidence\.npy/i,
  /trycloudflare\.com/i,
  /\.internal(\/|$)/i,
  /localhost/i,
  /127\.0\.0\.1/,
];

const REQUEST_PATH = "/api/ai/multiplanar/run";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNumberArray(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item)) ? (value as number[]) : undefined;
}

function pickFirst<T>(...candidates: Array<T | undefined>): T | undefined {
  for (const candidate of candidates) {
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function sanitizeBodyForError(raw: unknown): unknown {
  try {
    const clone = JSON.parse(JSON.stringify(raw ?? null));
    return redactUnsafeStrings(clone);
  } catch {
    return undefined;
  }
}

function redactUnsafeStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return BLOCKED_URL_PATTERNS.some((pattern) => pattern.test(value)) ? "[redacted]" : value;
  }
  if (Array.isArray(value)) return value.map(redactUnsafeStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, redactUnsafeStrings(entry)]));
  }
  return value;
}

function contractError(message: string, missingField: string, raw: unknown, traceId?: string): ContractError {
  return new ContractError(message, REQUEST_PATH, {
    code: "AI_MULTIPLANAR_CANONICAL_CONTRACT_VIOLATION",
    traceId,
    body: { missingField, sanitized: sanitizeBodyForError(raw) },
  });
}

function requireString(record: Record<string, unknown>, key: string, context: string, raw: unknown, traceId?: string): string {
  const value = asString(record[key]);
  if (!value) throw contractError(`Contrato incompleto en ${context}: falta ${key}.`, `${context}.${key}`, raw, traceId);
  return value;
}

function requireBooleanAlias(
  record: Record<string, unknown>,
  keys: string[],
  context: string,
  isV2: boolean,
  raw: unknown,
  traceId?: string,
): boolean | null {
  for (const key of keys) {
    const value = asBoolean(record[key]);
    if (value !== undefined) return value;
  }
  if (isV2) throw contractError(`Contrato incompleto en ${context}: falta ${keys[0]} obligatorio para ${MULTIPLANAR_CONTRACT_V2}.`, `${context}.${keys[0]}`, raw, traceId);
  return null;
}

function resolveFallbackReason(...values: unknown[]): string | null {
  for (const value of values) {
    const str = asString(value);
    if (str) return str;
  }
  return null;
}

function isSanitizedPublicUrl(value: unknown): string | undefined {
  const url = asString(value);
  if (!url) return undefined;
  if (BLOCKED_URL_PATTERNS.some((pattern) => pattern.test(url))) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/api/")) return url;
  return undefined;
}

function roleForAssetName(assetName: CanonicalAssetName): string {
  if (assetName === "input.png") return "input";
  if (assetName === "overlay.png") return "overlay";
  return "mask-preview";
}

function toCanonicalAsset(assetName: string, rawEntry: unknown): CanonicalPlaneAsset | undefined {
  if (!ALLOWED_ASSET_NAMES.includes(assetName as CanonicalAssetName)) return undefined;
  const name = assetName as CanonicalAssetName;
  const entryRecord = asRecord(rawEntry);
  const url = isSanitizedPublicUrl(typeof rawEntry === "string" ? rawEntry : entryRecord?.url);
  if (!url) return undefined;
  return {
    assetName: name,
    role: asString(entryRecord?.role) ?? roleForAssetName(name),
    contentType: asString(entryRecord?.contentType),
    generated: asBoolean(entryRecord?.generated),
    url,
  };
}

function parsePlaneAssets(rawAssets: unknown): CanonicalPlaneAsset[] {
  if (Array.isArray(rawAssets)) {
    return rawAssets.reduce<CanonicalPlaneAsset[]>((assets, item) => {
      const record = asRecord(item);
      const assetName = asString(record?.assetName);
      if (!assetName) return assets;
      const asset = toCanonicalAsset(assetName, record);
      if (asset) assets.push(asset);
      return assets;
    }, []);
  }
  const record = asRecord(rawAssets);
  if (!record) return [];
  return Object.entries(record).reduce<CanonicalPlaneAsset[]>((assets, [assetName, entry]) => {
    const asset = toCanonicalAsset(assetName, entry);
    if (asset) assets.push(asset);
    return assets;
  }, []);
}

function parseLandmarks(rawLandmarks: unknown): CanonicalLandmark[] {
  if (!Array.isArray(rawLandmarks)) return [];
  return rawLandmarks.map((item) => {
    const record = asRecord(item) ?? {};
    const centroid = asRecord(record.centroid);
    const center = asRecord(record.center);
    const landmark: CanonicalLandmark = {
      id: asString(record.id),
      labelKey: asString(record.label) ?? asString(record.labelKey) ?? asString(record.className) ?? asString(record.classLabel),
      x: asNumber(record.x),
      y: asNumber(record.y),
      coordinateSpace: asString(record.coordinateSpace),
    };
    if (centroid) {
      const cx = asNumber(centroid.x);
      const cy = asNumber(centroid.y);
      if (cx !== undefined && cy !== undefined) landmark.centroid = { x: cx, y: cy };
    }
    if (center) {
      const cx = asNumber(center.x);
      const cy = asNumber(center.y);
      if (cx !== undefined && cy !== undefined) landmark.center = { x: cx, y: cy };
    }
    return landmark;
  });
}

function toCanonicalMeasurement(value: unknown, index: number, plane: Plane | string): CanonicalMeasurement {
  const record = asRecord(value) ?? {};
  const labelKey = asString(record.labelKey) ?? asString(record.label) ?? `measurement-${index}`;
  const value_ = typeof record.value === "number" || typeof record.value === "string" ? record.value : record.value === null ? null : null;
  const reviewerValue = typeof record.reviewerValue === "number" || typeof record.reviewerValue === "string" || record.reviewerValue === null
    ? record.reviewerValue
    : undefined;
  return {
    id: asString(record.id) ?? `measurement-${index}`,
    labelKey,
    value: value_,
    unit: asString(record.unit),
    confidence: asNumber(record.confidence),
    status: asString(record.status),
    placeholder: asBoolean(record.placeholder),
    plane: asString(record.plane) ?? plane,
    level: asString(record.level) ?? null,
    reviewerValue,
  };
}

function parseMeasurements(rawMeasurements: unknown, plane: Plane | string): CanonicalMeasurement[] {
  if (Array.isArray(rawMeasurements)) return rawMeasurements.map((item, index) => toCanonicalMeasurement(item, index, plane));
  const record = asRecord(rawMeasurements);
  if (record && Array.isArray(record.values)) return record.values.map((item, index) => toCanonicalMeasurement(item, index, plane));
  return [];
}

function parseSeries(rawSeries: unknown): CanonicalPlaneSeriesItem[] | undefined {
  if (!Array.isArray(rawSeries)) return undefined;
  return rawSeries.map((item) => {
    const record = asRecord(item) ?? {};
    return {
      plane: asString(record.plane),
      imageUrl: isSanitizedPublicUrl(record.imageUrl),
      overlayUrl: isSanitizedPublicUrl(record.overlayUrl),
    };
  });
}

function parseMasks(rawMasks: unknown): CanonicalPlaneMask[] | undefined {
  if (!Array.isArray(rawMasks)) return undefined;
  return rawMasks.map((item) => {
    const record = asRecord(item) ?? {};
    return {
      id: asString(record.id),
      label: asString(record.label),
      role: asString(record.role),
      url: isSanitizedPublicUrl(record.url),
    };
  });
}

function parseQuality(rawQuality: unknown): CanonicalPlaneQuality | undefined {
  const record = asRecord(rawQuality);
  if (!record) return undefined;
  const warnings = Array.isArray(record.warnings) ? record.warnings.filter((item): item is string => typeof item === "string") : undefined;
  return { status: asString(record.status), warnings };
}

function parseModel(rawPlane: Record<string, unknown>): CanonicalPlaneModel {
  const modelArtifact = asRecord(rawPlane.modelArtifact);
  const aiOutput = asRecord(rawPlane.aiOutput);
  return {
    key: pickFirst(asString(rawPlane.modelKey), asString(modelArtifact?.key)),
    version: pickFirst(asString(rawPlane.modelVersion), asString(modelArtifact?.version)),
    artifactHash: pickFirst(asString(rawPlane.artifactHash), asString(aiOutput?.artifactHash), asString(modelArtifact?.artifactHash)),
    readiness: asString(modelArtifact?.readiness),
    trainingStatus: asString(modelArtifact?.trainingStatus),
    baselineReady: asBoolean(modelArtifact?.baselineReady),
    availableForRealInference: pickFirst(asBoolean(modelArtifact?.availableForRealInference), asBoolean(aiOutput?.realInferenceAvailable)),
    runtimeQualification: asString(modelArtifact?.runtimeQualification),
    qualityGatePassed: asBoolean(modelArtifact?.qualityGatePassed),
    manifestStatus: asString(modelArtifact?.manifestStatus),
    manifestValid: asBoolean(modelArtifact?.manifestValid),
  };
}

const ALLOWED_THREE_D_STATUSES = new Set<string>([
  "blocked_missing_axial",
  "blocked_missing_sagittal",
  "experimental_ready",
  "experimental_blocked_insufficient_geometry",
  "experimental_blocked_missing_anatomical_mapping",
]);

function parseThreeDAssets(rawAssets: unknown): CanonicalThreeDAsset[] {
  if (!Array.isArray(rawAssets)) return [];
  return rawAssets.reduce<CanonicalThreeDAsset[]>((assets, item) => {
    const record = asRecord(item);
    if (!record) return assets;
    const assetName = asString(record.assetName);
    const url = isSanitizedPublicUrl(record.url) ?? isSanitizedPublicUrl(record.relativePath);
    if (!assetName || !url) return assets;
    assets.push({ assetName, url });
    return assets;
  }, []);
}

function parseThreeDReconstruction(rawReconstruction: unknown): CanonicalThreeDReconstruction | undefined {
  const record = asRecord(rawReconstruction);
  if (!record) return undefined;
  return {
    kind: asString(record.kind),
    method: asString(record.method),
    anatomicalReconstruction: asBoolean(record.anatomicalReconstruction),
    volumetricReconstruction: asBoolean(record.volumetricReconstruction),
    coordinateSystem: asString(record.coordinateSystem),
    mappingSource: pickFirst(asString(record.mappingSource), asString((asRecord(record.parameters))?.mappingSource)),
    mappingValidated: pickFirst(asBoolean(record.mappingValidated), asBoolean((asRecord(record.parameters))?.mappingValidated)),
    available: asBoolean(record.available),
    experimental: asBoolean(record.experimental),
  };
}

/**
 * `threeD` is optional on purpose: legacy/sagittal-only responses never carry
 * it, and this must never be fabricated. Unknown or missing `status` values
 * are preserved as-is (never coerced into `experimental_ready` or a retired
 * status like `pending_registered_reconstruction`) — display-state
 * interpretation belongs to threeDProxyViewModel.ts, not this adapter.
 */
function parseThreeD(rawThreeD: unknown): CanonicalThreeD | undefined {
  const record = asRecord(rawThreeD);
  if (!record) return undefined;
  const sourcePlaneRunIds = asRecord(record.sourcePlaneRunIds);
  const warnings = Array.isArray(record.warnings) ? record.warnings.filter((item): item is string => typeof item === "string") : [];
  const requiredInputs = Array.isArray(record.requiredInputs) ? record.requiredInputs.filter((item): item is string => typeof item === "string") : [];
  const status = asString(record.status) ?? "blocked_missing_axial";
  return {
    enabled: asBoolean(record.enabled) ?? false,
    status: ALLOWED_THREE_D_STATUSES.has(status) ? (status as CanonicalThreeD["status"]) : status,
    sourcePlaneRunIds: {
      sagittal: asString(sourcePlaneRunIds?.sagittal) ?? null,
      axial: asString(sourcePlaneRunIds?.axial) ?? null,
    },
    requiredInputs,
    assets: parseThreeDAssets(record.assets),
    reconstruction: parseThreeDReconstruction(record.reconstruction),
    warnings,
  };
}

function parseInput(rawPlane: Record<string, unknown>): CanonicalPlaneInput {
  const metadata = asRecord(rawPlane.metadata);
  return {
    inputId: pickFirst(asString(metadata?.inputId), asString(rawPlane.inputId)),
    nativeShape: pickFirst(asNumberArray(metadata?.inputShapeNative), asNumberArray(metadata?.nativeShape)),
    canonicalShape: pickFirst(asNumberArray(metadata?.inputShapeCanonical), asNumberArray(metadata?.canonicalShape)),
    orientationTransform: pickFirst(asString(metadata?.inputOrientationTransform), asString(metadata?.orientationTransform)),
    selectedSliceIndex: pickFirst(asNumber(metadata?.selectedSlice), asNumber(metadata?.selectedSliceIndex)),
    sliceCount: asNumber(metadata?.sliceCount),
    selectedAxis: asNumber(metadata?.selectedAxis),
    inPlaneSpacingMm: pickFirst(asNumberArray(metadata?.inPlaneSpacing), asNumberArray(metadata?.inPlaneSpacingMm)),
  };
}

function resolvePlaneSynthetic(record: Record<string, unknown>, context: string, isV2: boolean, raw: unknown, traceId?: string): boolean | null {
  const aiOutput = asRecord(record.aiOutput);
  const metadata = asRecord(record.metadata);
  const flat: Record<string, unknown> = {
    synthetic: record.synthetic,
    degradedMode: record.degradedMode,
    "aiOutput.synthetic": aiOutput?.synthetic,
    "metadata.synthetic": metadata?.synthetic,
  };
  return requireBooleanAlias(flat, ["synthetic", "degradedMode", "aiOutput.synthetic", "metadata.synthetic"], context, isV2, raw, traceId);
}

function parsePlaneRun(rawPlane: unknown, plane: Plane, context: string, raw: unknown, isV2: boolean, traceId?: string): CanonicalPlaneRun {
  const record = asRecord(rawPlane);
  if (!record) throw contractError(`Contrato incompleto en ${context}: plano ${plane} ausente o invalido.`, `${context}.${plane}`, raw, traceId);
  const aiOutput = asRecord(record.aiOutput);
  const metadata = asRecord(record.metadata);
  return {
    planeRunId: pickFirst(asString(record.runId), asString(record.planeRunId)),
    plane,
    status: asString(record.status),
    effectiveInferenceMode: pickFirst(asString(record.effectiveInferenceMode), asString(record.inferenceMode), asString(aiOutput?.inferenceMode)),
    synthetic: resolvePlaneSynthetic(record, `${context}.${plane}`, isV2, raw, traceId),
    fallbackReason: resolveFallbackReason(record.fallbackReason, aiOutput?.fallbackReason, metadata?.fallbackReason),
    model: parseModel(record),
    input: parseInput(record),
    coordinateSpace: asString(record.coordinateSpace),
    assets: parsePlaneAssets(record.assets),
    series: parseSeries(record.series),
    masks: parseMasks(record.masks),
    landmarks: parseLandmarks(record.landmarks),
    measurements: parseMeasurements(record.measurements, plane),
    quality: parseQuality(record.quality),
    humanReviewRequired: asBoolean(record.humanReviewRequired) ?? asBoolean(asRecord(record.aiOutput)?.humanReviewRequired) ?? null,
    notClinicalDiagnosis: asBoolean(record.notClinicalDiagnosis) ?? asBoolean(asRecord(record.aiOutput)?.notClinicalDiagnosis) ?? null,
  };
}

function requireGovernanceField(
  record: Record<string, unknown>,
  key: "humanReviewRequired" | "notClinicalDiagnosis" | "synthetic",
  context: string,
  isV2: boolean,
  raw: unknown,
  traceId?: string,
): boolean | null {
  const value = asBoolean(record[key]);
  if (value !== undefined) return value;
  if (isV2) throw contractError(`Contrato incompleto en ${context}: falta ${key} obligatorio para ${MULTIPLANAR_CONTRACT_V2}.`, `${context}.${key}`, raw, traceId);
  return null;
}

export function parseMultiplanarRunResponse(raw: unknown): CanonicalMultiplanarRun {
  const record = asRecord(raw);
  if (!record) throw contractError("Contrato incompleto: respuesta vacia o invalida.", REQUEST_PATH, raw);
  const traceId = asString(record.traceId);
  const schemaVersion = asString(record.schemaVersion);
  const isV2 = schemaVersion === MULTIPLANAR_CONTRACT_V2;

  const runId = requireString(record, "runId", REQUEST_PATH, raw, traceId);

  const planesRecord = asRecord(record.planes);
  const rawSagittal = planesRecord?.sagittal;
  const sagittal = parsePlaneRun(rawSagittal, "sagittal", REQUEST_PATH, raw, isV2, traceId);
  const rawAxial = planesRecord?.axial;
  const axial = rawAxial ? parsePlaneRun(rawAxial, "axial", REQUEST_PATH, raw, isV2, traceId) : undefined;

  const synthetic = requireBooleanAlias(record, ["synthetic", "degradedMode"], REQUEST_PATH, isV2, raw, traceId);
  const fallbackReason = resolveFallbackReason(record.fallbackReason, sagittal.fallbackReason, axial?.fallbackReason);
  const degradedMode = asBoolean(record.degradedMode) ?? (synthetic === null ? undefined : synthetic);

  return {
    status: asString(record.status),
    schemaVersion,
    runId,
    traceId,
    caseId: asString(record.caseId),
    workspaceMode: asString(record.workspaceMode),
    requestedInferenceMode: asString(record.requestedInferenceMode),
    effectiveInferenceMode: asString(record.effectiveInferenceMode),
    planes: { sagittal, axial },
    threeD: parseThreeD(record.threeD),
    humanReviewRequired: requireGovernanceField(record, "humanReviewRequired", REQUEST_PATH, isV2, raw, traceId),
    notClinicalDiagnosis: requireGovernanceField(record, "notClinicalDiagnosis", REQUEST_PATH, isV2, raw, traceId),
    synthetic,
    fallbackReason,
    degradedMode,
  };
}
