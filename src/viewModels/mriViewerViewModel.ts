import { API_BASE_URL } from "../api";
import type { Plane, StudyLandmark, StudyMask, StudySeries } from "../appTypes";
import type { CanonicalAssetName, CanonicalPlaneMask, CanonicalPlaneRun } from "../contracts/canonicalMultiplanarRun";
import { normalizeAiAssetUrl } from "../inferenceReadiness";
import { aiAssetUrl } from "../multiplanarApi";

/**
 * Pure visual domain for MriSliceViewer. Neither the canonical multiplanar
 * domain (CanonicalPlaneRun) nor the legacy single-plane pipeline domain
 * (StudySeries/StudyMask/StudyLandmark) leak past this file — MriSliceViewer
 * only ever sees MriViewerModel.
 */

export type MriViewerAssetRole = "input" | "overlay" | "mask-preview";

export type MriViewerAsset = {
  assetName: CanonicalAssetName;
  role: MriViewerAssetRole;
  url: string;
  contentType?: string;
};

export type MriViewerCoordinateSpace = string;

export type MriViewerPoint = {
  x: number;
  y: number;
};

export type MriViewerSeries = {
  id: string;
  plane: Plane;
  selectedSliceIndex: number;
  sliceCount: number;
  imageUrl?: string;
  width?: number;
  height?: number;
};

export type MriViewerMask = {
  id: string;
  labelKey: string;
  classIndex?: number;
  groupName?: string;
  color?: string;
  visible?: boolean;
  opacity?: number;
};

export type MriViewerLandmark = {
  id: string;
  labelKey: string;
  x: number;
  y: number;
  centroid?: MriViewerPoint;
  center?: MriViewerPoint;
  coordinateSpace?: MriViewerCoordinateSpace;
  source?: "ai" | "reviewer";
};

export type MriViewerModel = {
  plane: Plane;
  planeRunId?: string;
  series?: MriViewerSeries;
  assets: MriViewerAsset[];
  masks: MriViewerMask[];
  landmarks: MriViewerLandmark[];
  coordinateSpace?: MriViewerCoordinateSpace;
};

const ASSET_NAMES: CanonicalAssetName[] = ["input.png", "overlay.png", "mask-preview.png"];

function roleForAssetName(assetName: CanonicalAssetName): MriViewerAssetRole {
  if (assetName === "input.png") return "input";
  if (assetName === "overlay.png") return "overlay";
  return "mask-preview";
}

function groupNameForLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const raw = label.toLowerCase();
  if (raw.includes("vertebra")) return "Grupo vertebral";
  if (raw.includes("canal")) return "Canal";
  if (raw.includes("disc")) return "Grupo discal";
  return label;
}

function resolveAssetUrl(declaredUrl: string | null | undefined, planeRunId: string | undefined, plane: Plane, assetName: CanonicalAssetName, allowFallback: boolean): string | undefined {
  const sanitized = normalizeAiAssetUrl(declaredUrl, API_BASE_URL);
  if (sanitized) return sanitized;
  if (allowFallback && planeRunId) return aiAssetUrl(planeRunId, plane, assetName);
  return undefined;
}

// --- Canonical multiplanar domain -------------------------------------------------

function assetsForCanonicalPlane(plane: CanonicalPlaneRun): MriViewerAsset[] {
  const declared = new Map(plane.assets.map((asset) => [asset.assetName, asset]));
  const planeName = plane.plane as Plane;
  return ASSET_NAMES.reduce<MriViewerAsset[]>((list, assetName) => {
    const found = declared.get(assetName);
    const allowFallback = assetName !== "mask-preview.png";
    const url = resolveAssetUrl(found?.url, plane.planeRunId, planeName, assetName, allowFallback);
    if (!url) return list;
    list.push({ assetName, role: roleForAssetName(assetName), url, contentType: found?.contentType });
    return list;
  }, []);
}

function canonicalSeriesToViewer(plane: CanonicalPlaneRun): MriViewerSeries {
  const rawSeries = plane.series?.[0];
  return {
    id: plane.planeRunId ?? `${plane.plane}-series`,
    plane: plane.plane as Plane,
    selectedSliceIndex: plane.input.selectedSliceIndex ?? 0,
    sliceCount: plane.input.sliceCount ?? 1,
    imageUrl: normalizeAiAssetUrl(rawSeries?.imageUrl, API_BASE_URL),
  };
}

function canonicalMasksToViewer(masks: CanonicalPlaneMask[]): MriViewerMask[] {
  return masks.map((mask, index) => {
    const labelKey = mask.label ?? mask.role ?? mask.id ?? `mask-${index}`;
    return {
      id: mask.id ?? `mask-${index}`,
      labelKey,
      groupName: groupNameForLabel(labelKey),
    };
  });
}

function canonicalLandmarksToViewer(landmarks: CanonicalPlaneRun["landmarks"]): MriViewerLandmark[] {
  return landmarks
    .filter((landmark) => Number.isFinite(landmark.x) && Number.isFinite(landmark.y))
    .map((landmark, index) => ({
      id: landmark.id ?? landmark.labelKey ?? `landmark-${index}`,
      labelKey: landmark.labelKey ?? "",
      x: landmark.x as number,
      y: landmark.y as number,
      centroid: landmark.centroid,
      center: landmark.center,
      coordinateSpace: landmark.coordinateSpace,
      source: "ai",
    }));
}

/**
 * CanonicalPlaneRun -> MriViewerModel. No raw HTTP, no v1/v2 interpretation
 * (that lives exclusively in multiplanarRunAdapter.ts), no translation
 * (labelKey stays canonical; clinicalDisplay.ts resolves Spanish text at
 * render time).
 */
export function canonicalPlaneToMriViewerModel(plane: CanonicalPlaneRun): MriViewerModel {
  return {
    plane: plane.plane as Plane,
    planeRunId: plane.planeRunId,
    series: canonicalSeriesToViewer(plane),
    assets: assetsForCanonicalPlane(plane),
    masks: canonicalMasksToViewer(plane.masks ?? []),
    landmarks: canonicalLandmarksToViewer(plane.landmarks),
    coordinateSpace: plane.coordinateSpace,
  };
}

// --- Legacy single-plane pipeline domain (StudyReviewView) -----------------------

export type StudyRunPlaneInput = {
  plane: Plane;
  planeRunId?: string;
  series?: StudySeries;
  masks?: StudyMask[];
  landmarks?: StudyLandmark[];
};

function assetsForStudySeries(series: StudySeries | undefined, planeRunId: string | undefined, plane: Plane): MriViewerAsset[] {
  const declaredUnavailable = series?.available === false || ["missing", "rejected", "unavailable"].includes(String(series?.storageStatus ?? ""));
  return ASSET_NAMES.reduce<MriViewerAsset[]>((list, assetName) => {
    const direct = assetName === "input.png" ? series?.imageUrl : assetName === "overlay.png" ? series?.overlayUrl : undefined;
    const fromMap = series?.assets?.[assetName];
    const allowFallback = assetName !== "mask-preview.png" && !declaredUnavailable;
    const url = resolveAssetUrl(direct ?? fromMap, planeRunId, plane, assetName, allowFallback);
    if (!url) return list;
    list.push({ assetName, role: roleForAssetName(assetName), url });
    return list;
  }, []);
}

function studySeriesToViewer(series: StudySeries | undefined, plane: Plane, planeRunId: string | undefined): MriViewerSeries {
  return {
    id: series?.id ?? planeRunId ?? `${plane}-series`,
    plane,
    selectedSliceIndex: series?.selectedSlice ?? 0,
    sliceCount: series?.sliceCount ?? 1,
    imageUrl: normalizeAiAssetUrl(series?.imageUrl, API_BASE_URL),
  };
}

function studyMasksToViewer(masks: StudyMask[]): MriViewerMask[] {
  return masks.map((mask) => ({
    id: mask.id,
    labelKey: mask.label || mask.className || mask.id,
    groupName: groupNameForLabel(mask.label || mask.className),
    color: mask.color,
  }));
}

function studyLandmarksToViewer(landmarks: StudyLandmark[]): MriViewerLandmark[] {
  return landmarks
    .filter((landmark) => Number.isFinite(landmark.x) && Number.isFinite(landmark.y))
    .map((landmark) => ({
      id: landmark.id,
      labelKey: landmark.label,
      x: landmark.x,
      y: landmark.y,
      coordinateSpace: undefined,
      source: landmark.editable ? "reviewer" : "ai",
    }));
}

/**
 * Legacy single-plane pipeline (StudyReviewView, AiRunResponse-backed) ->
 * MriViewerModel. Only accepts the legacy types it has always used
 * (StudySeries/StudyMask/StudyLandmark) — never pretends AiRunResponse is
 * CanonicalMultiplanarRun. This is the only place that domain's compatibility
 * with the shared viewer is concentrated.
 */
export function studyRunToMriViewerModel(input: StudyRunPlaneInput): MriViewerModel {
  const masks = input.masks ?? [];
  const landmarks = input.landmarks ?? [];
  return {
    plane: input.plane,
    planeRunId: input.planeRunId,
    series: studySeriesToViewer(input.series, input.plane, input.planeRunId),
    assets: assetsForStudySeries(input.series, input.planeRunId, input.plane),
    masks: studyMasksToViewer(masks),
    landmarks: studyLandmarksToViewer(landmarks),
    coordinateSpace: input.series?.coordinateSpace,
  };
}
