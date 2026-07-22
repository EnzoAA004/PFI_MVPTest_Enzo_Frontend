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
  spiderShapeDetected: boolean;
  orientationExpected: boolean;
};

export type PlaneAssetUrls = Partial<Record<AssetName, string>>;

const realModes = new Set(["real", "real_baseline"]);
const blockedModes = new Set(["contract", "mock", "fallback", "mixed"]);

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

function hasSameNumbers(left: number[] | undefined, right: number[]) {
  return Boolean(left && left.length === right.length && left.every((value, index) => value === right[index]));
}

function hasFallbackStatus(status: unknown) {
  return typeof status === "string" && status.trim().toLowerCase().includes("fallback");
}

export function resolvePlaneInferenceMode(planeRun?: MultiplanarPlaneRun | null) {
  return normalizedString(planeRun?.effectiveInferenceMode)
    ?? normalizedString(planeRun?.inferenceMode)
    ?? normalizedString(planeRun?.aiOutput?.inferenceMode)
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
  return planeRun.measurements?.values ?? [];
}

export function hasRealMeasurements(run?: MultiplanarRunResponse | null) {
  const rows = (["sagittal", "axial"] as Plane[]).flatMap((plane) => extractMeasurementRows(run?.planes?.[plane]));
  return rows.some((row) => !row.placeholder && row.value !== undefined && row.value !== null && row.value !== "");
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
  const selectedSliceOutOfRange = typeof selectedSlice === "number" && typeof sliceCount === "number" && (selectedSlice < 0 || selectedSlice >= sliceCount);
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
    spiderShapeDetected: hasSameNumbers(inputShapeNative, [17, 512, 512]) && hasSameNumbers(inputShapeCanonical, [512, 512, 17]),
    orientationExpected: selectedAxis === 2 && sliceCount === 17 && inputOrientationTransform === "move_axis_0_to_last",
  };
}

export function evaluateSagittalReadiness(run?: MultiplanarRunResponse | null, requireFinalSpider = true): ReadinessResult {
  const reasons: string[] = [];
  const sagittal = run?.planes?.sagittal;
  if (!sagittal) reasons.push("Plano sagital ausente.");
  if (sagittal && !isRealPlaneRun(sagittal)) reasons.push("Plano sagital no volvió en real_baseline.");
  if (sagittal?.modelKey === SAGITTAL_FINAL_MODEL_KEY && requireFinalSpider) {
    if (sagittal.modelVersion !== SAGITTAL_FINAL_MODEL_VERSION) reasons.push("La versión del modelo sagital no coincide.");
    const artifactHash = sagittal.artifactHash ?? sagittal.aiOutput?.artifactHash;
    if (artifactHash !== SAGITTAL_FINAL_ARTIFACT_HASH) reasons.push("La huella del modelo sagital no coincide.");
    if (sagittal.allowContractFallback === true) reasons.push("El fallback contractual sagital está habilitado.");
    if (sagittal.aiOutput?.realInferenceAvailable === false) reasons.push("El modelo sagital no devolvió inferencia real disponible.");
    const metadata = readSpiderRuntimeMetadata(sagittal);
    if (metadata.selectedSliceOutOfRange) reasons.push("El corte sagital seleccionado está fuera de rango.");
    if (metadata.inputShapeNative && !hasSameNumbers(metadata.inputShapeNative, [17, 512, 512])) reasons.push("La forma nativa SPIDER no coincide con [17,512,512].");
    if (metadata.inputOrientationTransform && metadata.inputOrientationTransform !== "move_axis_0_to_last") reasons.push("La transformación de orientación sagital no coincide.");
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
  return evaluateDualReadiness(run);
}

export function abbreviateArtifactHash(hash?: string) {
  return hash && hash.length > 16 ? `${hash.slice(0, 12)}...${hash.slice(-4)}` : hash ?? "no informado";
}

export function resolvePlaneAssetUrls(planeRun: MultiplanarPlaneRun | undefined, plane: Plane, fallbackUrl: (runId: string, plane: Plane, assetName: AssetName) => string): PlaneAssetUrls {
  const runId = planeRun?.runId;
  return {
    "input.png": planeRun?.series?.find((series) => series.plane === plane)?.imageUrl ?? planeRun?.assets?.["input.png"]?.url ?? (runId ? fallbackUrl(runId, plane, "input.png") : undefined),
    "overlay.png": planeRun?.series?.find((series) => series.plane === plane)?.overlayUrl ?? planeRun?.assets?.["overlay.png"]?.url ?? (runId ? fallbackUrl(runId, plane, "overlay.png") : undefined),
    "mask-preview.png": planeRun?.assets?.["mask-preview.png"]?.url ?? (runId ? fallbackUrl(runId, plane, "mask-preview.png") : undefined),
  };
}
