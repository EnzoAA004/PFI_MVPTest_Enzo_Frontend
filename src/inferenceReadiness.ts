import type { AssetName, MultiplanarMeasurementValue, MultiplanarPlaneRun, MultiplanarRunResponse } from "./multiplanarRunTypes";
import type { Plane } from "./appTypes";

export const SAGITTAL_FINAL_MODEL_KEY = "sagittal_spider";
export const SAGITTAL_FINAL_MODEL_VERSION = "sagittal-spider-final-v1";
export const SAGITTAL_FINAL_ARTIFACT_HASH = "cf11dcc0ad77a7c787e64a796a2fd7398ef906add461cef4b3d61f1a5238e944";

export type ReadinessResult = {
  ready: boolean;
  reasons: string[];
};

export type WorkspaceInferenceMode = "real" | "real_baseline" | "mixed" | undefined;

export type SpiderRuntimeMetadata = {
  selectedSlice?: number;
  selectedAxis?: number;
  sliceCount?: number;
  inputShapeNative?: number[];
  inputShapeCanonical?: number[];
  inputOrientationTransform?: string;
  inPlaneSpacing?: number[];
  inPlaneSpacingUnit?: string;
  selectedSliceOutOfRange: boolean;
  canonicalShapeValid: boolean;
  selectedAxisValid: boolean;
  sliceCountValid: boolean;
  sliceCountMatchesAxis: boolean;
  selectedSliceInRange: boolean;
  supportedTransform: boolean;
  spiderShapeDetected: boolean;
  orientationExpected: boolean;
};

export type PlaneAssetUrls = Partial<Record<AssetName, string>>;

const realModes = new Set(["real", "real_baseline"]);
const blockedModes = new Set(["contract", "mock", "fallback", "mixed"]);
const supportedSagittalTransforms = new Set(["none", "move_axis_0_to_last"]);

function normalizedString(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : undefined;
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string) {
  return normalizedString(metadata?.[key]);
}

function metadataNumber(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function metadataNumberArray(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item)) ? value : undefined;
}

function hasFallbackStatus(status: unknown) {
  return typeof status === "string" && status.trim().toLowerCase().includes("fallback");
}

export function resolvePlaneInferenceMode(planeRun?: MultiplanarPlaneRun | null) {
  return normalizedString(planeRun?.effectiveInferenceMode)
    ?? normalizedString(planeRun?.inferenceMode)
    ?? normalizedString(planeRun?.aiOutput?.inferenceMode)
    ?? (normalizedString(planeRun?.aiOutput?.status) === "real_baseline_ready" ? "real_baseline" : undefined)
    ?? metadataString(planeRun?.metadata, "inferenceMode");
}

export function isRealInferenceMode(mode?: string) {
  return Boolean(mode && realModes.has(mode));
}

export function isRealPlaneRun(planeRun?: MultiplanarPlaneRun | null) {
  const mode = resolvePlaneInferenceMode(planeRun);
  if (!planeRun || !isRealInferenceMode(mode) || blockedModes.has(mode ?? "")) return false;
  if (planeRun.aiOutput?.realInferenceAvailable === false) return false;
  if (planeRun.degradedMode === true) return false;
  if (hasFallbackStatus(planeRun.status)) return false;
  if (planeRun.metadata && "realInferenceFailure" in planeRun.metadata) return false;
  return true;
}

export function resolveWorkspaceInferenceMode(run?: MultiplanarRunResponse | null): WorkspaceInferenceMode {
  const effective = normalizedString(run?.effectiveInferenceMode);
  if (isRealInferenceMode(effective)) return effective as WorkspaceInferenceMode;
  const sagittalMode = resolvePlaneInferenceMode(run?.planes?.sagittal);
  const axialMode = resolvePlaneInferenceMode(run?.planes?.axial);
  if (isRealInferenceMode(sagittalMode) && sagittalMode === axialMode) return sagittalMode as WorkspaceInferenceMode;
  if (sagittalMode || axialMode || normalizedString(run?.requestedInferenceMode)) return "mixed";
  return undefined;
}

export function extractMeasurementRows(planeRun?: MultiplanarPlaneRun): MultiplanarMeasurementValue[] {
  if (!planeRun) return [];
  if (Array.isArray(planeRun.measurements)) return planeRun.measurements;
  if (Array.isArray(planeRun.measurements?.values)) return planeRun.measurements.values;
  if (planeRun.measurements && typeof planeRun.measurements === "object") {
    return Object.entries(planeRun.measurements).reduce<MultiplanarMeasurementValue[]>((rows, [key, value]) => {
      if (typeof value === "number" || typeof value === "string") rows.push({ id: key, label: key, value, unit: key.toLowerCase().includes("area") ? "mm2" : "mm" });
      return rows;
    }, []);
  }
  return [];
}

export function hasRealMeasurements(run?: MultiplanarRunResponse | null) {
  const rows = (["sagittal", "axial"] as Plane[]).flatMap((plane) => extractMeasurementRows(run?.planes?.[plane]));
  return rows.some((row) => !row.placeholder && row.value !== undefined && row.value !== null && row.value !== "");
}

export function hasRealPlaneMeasurements(run: MultiplanarRunResponse | null | undefined, plane: Plane) {
  return extractMeasurementRows(run?.planes?.[plane]).some((row) => !row.placeholder && row.value !== undefined && row.value !== null && row.value !== "");
}

export function readSpiderRuntimeMetadata(planeRun?: MultiplanarPlaneRun | null): SpiderRuntimeMetadata {
  const metadata = planeRun?.metadata;
  const inputShapeNative = metadataNumberArray(metadata, "inputShapeNative");
  const inputShapeCanonical = metadataNumberArray(metadata, "inputShapeCanonical");
  const selectedSlice = metadataNumber(metadata, "selectedSlice");
  const selectedAxis = metadataNumber(metadata, "selectedAxis");
  const sliceCount = metadataNumber(metadata, "sliceCount");
  const inputOrientationTransform = typeof metadata?.inputOrientationTransform === "string" ? metadata.inputOrientationTransform : undefined;
  const inPlaneSpacing = metadataNumberArray(metadata, "inPlaneSpacing");
  const inPlaneSpacingUnit = typeof metadata?.inPlaneSpacingUnit === "string" ? metadata.inPlaneSpacingUnit : undefined;
  const canonicalShapeValid = Boolean(inputShapeCanonical?.length === 3);
  const selectedAxisValid = typeof selectedAxis === "number" && Number.isInteger(selectedAxis) && selectedAxis >= 0 && Boolean(inputShapeCanonical && selectedAxis < inputShapeCanonical.length);
  const sliceCountValid = typeof sliceCount === "number" && Number.isInteger(sliceCount) && sliceCount > 0;
  const sliceCountMatchesAxis = Boolean(canonicalShapeValid && selectedAxisValid && sliceCountValid && inputShapeCanonical?.[selectedAxis ?? -1] === sliceCount);
  const selectedSliceInRange = typeof selectedSlice === "number" && Number.isInteger(selectedSlice) && sliceCountValid && selectedSlice >= 0 && selectedSlice < (sliceCount ?? 0);
  const selectedSliceOutOfRange = Boolean(typeof selectedSlice === "number" && Number.isInteger(selectedSlice) && sliceCountValid && !selectedSliceInRange);
  const supportedTransform = Boolean(inputOrientationTransform && supportedSagittalTransforms.has(inputOrientationTransform));
  return {
    selectedSlice,
    selectedAxis,
    sliceCount,
    inputShapeNative,
    inputShapeCanonical,
    inputOrientationTransform,
    inPlaneSpacing,
    inPlaneSpacingUnit,
    selectedSliceOutOfRange,
    canonicalShapeValid,
    selectedAxisValid,
    sliceCountValid,
    sliceCountMatchesAxis,
    selectedSliceInRange,
    supportedTransform,
    spiderShapeDetected: canonicalShapeValid && selectedAxisValid && sliceCountMatchesAxis && selectedSliceInRange && supportedTransform,
    orientationExpected: canonicalShapeValid && selectedAxisValid && sliceCountMatchesAxis && selectedSliceInRange && supportedTransform,
  };
}

export function evaluateSagittalReadiness(run?: MultiplanarRunResponse | null, requireFinalSpider = true): ReadinessResult {
  const reasons: string[] = [];
  const sagittal = run?.planes?.sagittal;
  if (!sagittal) reasons.push("Plano sagital ausente.");
  if (sagittal && !isRealPlaneRun(sagittal)) reasons.push("Plano sagital no volvió en real_baseline.");
  if (sagittal && requireFinalSpider) {
    if (sagittal.modelKey !== SAGITTAL_FINAL_MODEL_KEY) reasons.push("El modelo sagital no es sagittal_spider.");
    if (resolvePlaneInferenceMode(sagittal) !== "real_baseline") reasons.push("El modo sagital efectivo no es real_baseline.");
    if (sagittal.modelVersion !== SAGITTAL_FINAL_MODEL_VERSION) reasons.push("La versión del modelo sagital no coincide.");
    const artifactHash = sagittal.artifactHash ?? sagittal.aiOutput?.artifactHash;
    if (artifactHash !== SAGITTAL_FINAL_ARTIFACT_HASH) reasons.push("La huella del modelo sagital no coincide.");
    if (sagittal.allowContractFallback !== false) reasons.push("El fallback contractual sagital no está deshabilitado.");
    if (sagittal.aiOutput?.realInferenceAvailable !== true) reasons.push("El modelo sagital no devolvió inferencia real disponible.");
    if (sagittal.modelArtifact?.baselineReady !== true) reasons.push("El artifact sagital no informa baselineReady=true.");
    if (sagittal.modelArtifact?.availableForRealInference !== true) reasons.push("El artifact sagital no informa availableForRealInference=true.");
    if ((sagittal.humanReviewRequired ?? sagittal.aiOutput?.humanReviewRequired) !== true) reasons.push("La revisión humana requerida sagital no está confirmada.");
    if ((sagittal.notClinicalDiagnosis ?? sagittal.aiOutput?.notClinicalDiagnosis) !== true) reasons.push("La restricción de no diagnóstico clínico sagital no está confirmada.");
    const metadata = readSpiderRuntimeMetadata(sagittal);
    if (!metadata.canonicalShapeValid) reasons.push("La forma canónica sagital no informa 3 dimensiones.");
    if (!metadata.selectedAxisValid) reasons.push("El eje sagital seleccionado no es válido.");
    if (!metadata.sliceCountValid) reasons.push("El conteo de cortes sagitales no es válido.");
    if (!metadata.sliceCountMatchesAxis) reasons.push("El conteo de cortes no coincide con la dimensión canónica del eje seleccionado.");
    if (!metadata.selectedSliceInRange) reasons.push("El corte sagital seleccionado está fuera de rango.");
    if (!metadata.supportedTransform) reasons.push("La transformación de orientación sagital no está soportada.");
  }
  return { ready: reasons.length === 0, reasons };
}

export function evaluateAxialReadiness(run?: MultiplanarRunResponse | null): ReadinessResult {
  const axial = run?.planes?.axial;
  const reasons: string[] = [];
  if (!axial) reasons.push("Plano axial no se encuentra disponible para inferencia real.");
  if (axial && !isRealPlaneRun(axial)) reasons.push("Plano axial no volvió en real_baseline.");
  return { ready: reasons.length === 0, reasons };
}

export function evaluateSagittalReviewReadiness(run?: MultiplanarRunResponse | null): ReadinessResult {
  const reasons: string[] = [];
  if (!run) reasons.push("No hay corrida sagital.");
  if (run?.degradedMode === true) reasons.push("La corrida está en modo degradado.");
  if (run?.humanReviewRequired === false) reasons.push("La revisión humana requerida no está confirmada.");
  if (run?.notClinicalDiagnosis === false) reasons.push("La restricción de no diagnóstico clínico no está confirmada.");
  reasons.push(...evaluateSagittalReadiness(run).reasons);
  if (!hasRealPlaneMeasurements(run, "sagittal")) reasons.push("La corrida sagital no devolvió mediciones reales.");
  return { ready: reasons.length === 0, reasons };
}

export function evaluateDualReadiness(run?: MultiplanarRunResponse | null): ReadinessResult {
  const reasons: string[] = [];
  if (!run) reasons.push("No hay corrida multiplanar.");
  if (run?.degradedMode === true) reasons.push("La corrida está en modo degradado.");
  if (run?.humanReviewRequired === false) reasons.push("La revisión humana requerida no está confirmada.");
  if (run?.notClinicalDiagnosis === false) reasons.push("La restricción de no diagnóstico clínico no está confirmada.");
  reasons.push(...evaluateSagittalReadiness(run).reasons, ...evaluateAxialReadiness(run).reasons);
  const workspaceMode = resolveWorkspaceInferenceMode(run);
  if (!isRealInferenceMode(workspaceMode)) reasons.push(`Workspace dual bloqueado por modo efectivo ${workspaceMode ?? "no informado"}.`);
  if (!hasRealMeasurements(run)) reasons.push("La corrida no devolvió mediciones reales.");
  return { ready: reasons.length === 0, reasons };
}

export function evaluateRealInferenceReadiness(run?: MultiplanarRunResponse | null): ReadinessResult {
  return evaluateSagittalReviewReadiness(run);
}

export function abbreviateArtifactHash(hash?: string) {
  return hash && hash.length > 16 ? `${hash.slice(0, 12)}...${hash.slice(-4)}` : hash ?? "no informado";
}

export function normalizeAiAssetUrl(value: unknown, apiBaseUrl = "") {
  const rawUrl = typeof value === "string" ? value : typeof value === "object" && value && "url" in value ? (value as { url?: unknown }).url : undefined;
  if (typeof rawUrl !== "string") return undefined;
  const url = rawUrl.trim();
  if (!url || url.includes("mask.npy") || url.includes("confidence.npy")) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/api/")) return `${apiBaseUrl}${url}`;
  return undefined;
}

export function resolvePlaneAssetUrls(planeRun: MultiplanarPlaneRun | undefined, plane: Plane, fallbackUrl: (runId: string, plane: Plane, assetName: AssetName) => string, apiBaseUrl = ""): PlaneAssetUrls {
  const runId = planeRun?.runId;
  const series = planeRun?.series?.find((item) => item.plane === plane);
  const declaredInput = normalizeAiAssetUrl(series?.imageUrl, apiBaseUrl) ?? normalizeAiAssetUrl(planeRun?.assets?.["input.png"], apiBaseUrl);
  const declaredOverlay = normalizeAiAssetUrl(series?.overlayUrl, apiBaseUrl) ?? normalizeAiAssetUrl(planeRun?.assets?.["overlay.png"], apiBaseUrl);
  const declaredMaskPreview = normalizeAiAssetUrl(planeRun?.assets?.["mask-preview.png"], apiBaseUrl);
  return {
    "input.png": declaredInput ?? (runId ? fallbackUrl(runId, plane, "input.png") : undefined),
    "overlay.png": declaredOverlay ?? (runId ? fallbackUrl(runId, plane, "overlay.png") : undefined),
    "mask-preview.png": declaredMaskPreview,
  };
}
