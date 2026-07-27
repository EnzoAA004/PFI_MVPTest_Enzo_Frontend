import type { Plane } from "./appTypes";
import type {
  CanonicalAssetName,
  CanonicalMeasurement,
  CanonicalMultiplanarRun,
  CanonicalPlaneAsset,
  CanonicalPlaneRun,
} from "./contracts/canonicalMultiplanarRun";

export const SAGITTAL_FINAL_MODEL_KEY = "sagittal_spider";
export const SAGITTAL_FINAL_MODEL_VERSION = "sagittal-spider-final-v1";
export const SAGITTAL_FINAL_ARTIFACT_HASH = "cf11dcc0ad77a7c787e64a796a2fd7398ef906add461cef4b3d61f1a5238e944";

export type ReadinessResult = {
  ready: boolean;
  reasons: string[];
};

export type WorkspaceInferenceMode = "real" | "real_baseline" | "mixed" | undefined;
export type ReviewWorkspaceMode = "sagittal_only" | "axial_only" | "dual_plane" | "unavailable";

export type SpiderRuntimeMetadata = {
  selectedSlice?: number;
  selectedAxis?: number;
  sliceCount?: number;
  inputShapeNative?: number[];
  inputShapeCanonical?: number[];
  inputOrientationTransform?: string;
  inPlaneSpacing?: number[];
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

export type PlaneAssetUrls = Partial<Record<CanonicalAssetName, string>>;

const realModes = new Set(["real", "real_baseline"]);
const supportedSagittalTransforms = new Set(["none", "move_axis_0_to_last"]);

function normalizedString(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : undefined;
}

function hasFallbackStatus(status: unknown) {
  return typeof status === "string" && status.trim().toLowerCase().includes("fallback");
}

export function resolvePlaneInferenceMode(planeRun?: CanonicalPlaneRun | null) {
  return normalizedString(planeRun?.effectiveInferenceMode);
}

export function isRealInferenceMode(mode?: string) {
  return Boolean(mode && realModes.has(mode));
}

export function isRealPlaneRun(planeRun?: CanonicalPlaneRun | null): boolean {
  if (!planeRun) return false;
  const mode = resolvePlaneInferenceMode(planeRun);
  if (!isRealInferenceMode(mode)) return false;
  if (planeRun.synthetic !== false) return false;
  if (planeRun.fallbackReason) return false;
  if (hasFallbackStatus(planeRun.status)) return false;
  if (planeRun.model?.availableForRealInference !== true) return false;
  return true;
}

export function resolveWorkspaceInferenceMode(run?: CanonicalMultiplanarRun | null): WorkspaceInferenceMode {
  const effective = normalizedString(run?.effectiveInferenceMode);
  if (isRealInferenceMode(effective)) return effective as WorkspaceInferenceMode;
  const sagittalMode = resolvePlaneInferenceMode(run?.planes?.sagittal);
  const axialMode = resolvePlaneInferenceMode(run?.planes?.axial);
  if (isRealInferenceMode(sagittalMode) && sagittalMode === axialMode) return sagittalMode as WorkspaceInferenceMode;
  if (sagittalMode || axialMode || normalizedString(run?.requestedInferenceMode)) return "mixed";
  return undefined;
}

export function extractMeasurementRows(planeRun?: CanonicalPlaneRun | null): CanonicalMeasurement[] {
  return planeRun?.measurements ?? [];
}

function isRealMeasurementRow(row: CanonicalMeasurement) {
  return row.placeholder !== true && row.value !== null && row.value !== undefined && row.value !== "";
}

export function hasRealMeasurements(run?: CanonicalMultiplanarRun | null) {
  const rows = (["sagittal", "axial"] as Plane[]).flatMap((plane) => extractMeasurementRows(run?.planes?.[plane]));
  return rows.some(isRealMeasurementRow);
}

export function hasRealPlaneMeasurements(run: CanonicalMultiplanarRun | null | undefined, plane: Plane) {
  return extractMeasurementRows(run?.planes?.[plane]).some(isRealMeasurementRow);
}

export function readSpiderRuntimeMetadata(planeRun?: CanonicalPlaneRun | null): SpiderRuntimeMetadata {
  const input = planeRun?.input;
  const inputShapeNative = input?.nativeShape;
  const inputShapeCanonical = input?.canonicalShape;
  const selectedSlice = input?.selectedSliceIndex;
  const selectedAxis = input?.selectedAxis;
  const sliceCount = input?.sliceCount;
  const inputOrientationTransform = input?.orientationTransform;
  const inPlaneSpacing = input?.inPlaneSpacingMm;
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

export function evaluateSagittalReadiness(run?: CanonicalMultiplanarRun | null, requireFinalSpider = true): ReadinessResult {
  const reasons: string[] = [];
  const sagittal = run?.planes?.sagittal;
  if (!sagittal) reasons.push("Plano sagital ausente.");
  if (sagittal && !isRealPlaneRun(sagittal)) reasons.push("Plano sagital no volvió en real_baseline.");
  if (sagittal && requireFinalSpider) {
    if (sagittal.model.key !== SAGITTAL_FINAL_MODEL_KEY) reasons.push("El modelo sagital no es sagittal_spider.");
    if (resolvePlaneInferenceMode(sagittal) !== "real_baseline") reasons.push("El modo sagital efectivo no es real_baseline.");
    if (sagittal.model.version !== SAGITTAL_FINAL_MODEL_VERSION) reasons.push("La versión del modelo sagital no coincide.");
    if (sagittal.model.artifactHash !== SAGITTAL_FINAL_ARTIFACT_HASH) reasons.push("La huella del modelo sagital no coincide.");
    if (sagittal.synthetic !== false) reasons.push("El modo sintético sagital no está deshabilitado.");
    if (sagittal.fallbackReason) reasons.push("La corrida sagital informa un motivo de fallback.");
    if (sagittal.model.baselineReady !== true) reasons.push("El artifact sagital no informa baselineReady=true.");
    if (sagittal.model.availableForRealInference !== true) reasons.push("El artifact sagital no informa availableForRealInference=true.");
    if (sagittal.model.manifestValid === false) reasons.push("El manifest sagital no es válido.");
    if (sagittal.humanReviewRequired !== true) reasons.push("La revisión humana requerida sagital no está confirmada.");
    if (sagittal.notClinicalDiagnosis !== true) reasons.push("La restricción de no diagnóstico clínico sagital no está confirmada.");
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

export function evaluateAxialReadiness(run?: CanonicalMultiplanarRun | null): ReadinessResult {
  const axial = run?.planes?.axial;
  const reasons: string[] = [];
  if (!axial) reasons.push("Plano axial no se encuentra disponible para inferencia real.");
  if (axial && !isRealPlaneRun(axial)) reasons.push("Plano axial no volvió en real_baseline.");
  return { ready: reasons.length === 0, reasons };
}

export function evaluateSagittalReviewReadiness(run?: CanonicalMultiplanarRun | null): ReadinessResult {
  const reasons: string[] = [];
  if (!run) reasons.push("No hay corrida sagital.");
  if (run && run.synthetic !== false) reasons.push("La corrida no confirma synthetic=false.");
  if (run?.degradedMode === true) reasons.push("La corrida está en modo degradado.");
  if (run && run.fallbackReason) reasons.push("La corrida informa un motivo de fallback.");
  if (run && run.humanReviewRequired !== true) reasons.push("La revisión humana requerida no está confirmada.");
  if (run && run.notClinicalDiagnosis !== true) reasons.push("La restricción de no diagnóstico clínico no está confirmada.");
  reasons.push(...evaluateSagittalReadiness(run).reasons);
  if (!hasRealPlaneMeasurements(run, "sagittal")) reasons.push("La corrida sagital no devolvió mediciones reales.");
  return { ready: reasons.length === 0, reasons };
}

export function evaluateDualReadiness(run?: CanonicalMultiplanarRun | null): ReadinessResult {
  const reasons: string[] = [];
  if (!run) reasons.push("No hay corrida multiplanar.");
  if (run && run.synthetic !== false) reasons.push("La corrida no confirma synthetic=false.");
  if (run?.degradedMode === true) reasons.push("La corrida está en modo degradado.");
  if (run && run.fallbackReason) reasons.push("La corrida informa un motivo de fallback.");
  if (run && run.humanReviewRequired !== true) reasons.push("La revisión humana requerida no está confirmada.");
  if (run && run.notClinicalDiagnosis !== true) reasons.push("La restricción de no diagnóstico clínico no está confirmada.");
  reasons.push(...evaluateSagittalReadiness(run).reasons, ...evaluateAxialReadiness(run).reasons);
  const workspaceMode = resolveWorkspaceInferenceMode(run);
  if (!isRealInferenceMode(workspaceMode)) reasons.push(`Workspace dual bloqueado por modo efectivo ${workspaceMode ?? "no informado"}.`);
  if (!hasRealMeasurements(run)) reasons.push("La corrida no devolvió mediciones reales.");
  if (!hasRealPlaneMeasurements(run, "axial")) reasons.push("El plano axial no devolvió mediciones reales.");
  return { ready: reasons.length === 0, reasons };
}

export function evaluateRealInferenceReadiness(run?: CanonicalMultiplanarRun | null): ReadinessResult {
  return evaluateSagittalReviewReadiness(run);
}

export function resolveReviewWorkspaceMode(run?: CanonicalMultiplanarRun | null): ReviewWorkspaceMode {
  const sagittalReady = evaluateSagittalReviewReadiness(run).ready;
  const axialReady = evaluateAxialReadiness(run).ready && hasRealPlaneMeasurements(run, "axial");
  if (sagittalReady && axialReady) return "dual_plane";
  if (sagittalReady) return "sagittal_only";
  if (axialReady) return "axial_only";
  return "unavailable";
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

function findAsset(assets: CanonicalPlaneAsset[] | undefined, assetName: CanonicalAssetName): string | undefined {
  return assets?.find((asset) => asset.assetName === assetName)?.url;
}

export function resolvePlaneAssetUrls(
  planeRun: CanonicalPlaneRun | null | undefined,
  plane: Plane,
  fallbackUrl: (runId: string, plane: Plane, assetName: CanonicalAssetName) => string,
  apiBaseUrl = "",
): PlaneAssetUrls {
  const runId = planeRun?.planeRunId;
  const declaredInput = normalizeAiAssetUrl(findAsset(planeRun?.assets, "input.png"), apiBaseUrl);
  const declaredOverlay = normalizeAiAssetUrl(findAsset(planeRun?.assets, "overlay.png"), apiBaseUrl);
  const declaredMaskPreview = normalizeAiAssetUrl(findAsset(planeRun?.assets, "mask-preview.png"), apiBaseUrl);
  return {
    "input.png": declaredInput ?? (runId ? fallbackUrl(runId, plane, "input.png") : undefined),
    "overlay.png": declaredOverlay ?? (runId ? fallbackUrl(runId, plane, "overlay.png") : undefined),
    "mask-preview.png": declaredMaskPreview,
  };
}
