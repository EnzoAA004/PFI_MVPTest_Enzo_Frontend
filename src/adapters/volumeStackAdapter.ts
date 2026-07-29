import { API_BASE_URL } from "../api";
import type { Plane } from "../appTypes";
import type { CanonicalMultiplanarRun, CanonicalPlaneRun } from "../contracts/canonicalMultiplanarRun";
import type { VolumeSlice, VolumeStack, VolumeWorkspace } from "../contracts/volumeStack";
import { resolvePlaneAssetUrls } from "../inferenceReadiness";
import { aiAssetUrl } from "../multiplanarApi";

/**
 * P10.5-D.0 — builds the viewer-shell VolumeStack from the P10.5-A canonical run.
 * Pure: asset-URL resolution is injected so navigation/slice logic can be tested
 * without React or network. Only the AI-selected slice gets a real image/overlay;
 * the rest are navigable placeholders until P10.5-B/C expose the slice catalogue.
 */
export type PlaneSliceAssets = { image?: string; overlay?: string };
export type PlaneAssetResolver = (planeRun: CanonicalPlaneRun, plane: Plane) => PlaneSliceAssets;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

export function buildVolumeStack(
  planeRun: CanonicalPlaneRun | undefined | null,
  resolveAssets: PlaneAssetResolver,
): VolumeStack | null {
  if (!planeRun) return null;
  const plane = planeRun.plane as Plane;
  const input = planeRun.input ?? {};
  const sliceCount = Number.isInteger(input.sliceCount) && (input.sliceCount as number) > 0 ? (input.sliceCount as number) : 1;
  const selectedSliceIndex = clampInt(Number.isInteger(input.selectedSliceIndex) ? (input.selectedSliceIndex as number) : 0, 0, sliceCount - 1);
  const assets = resolveAssets(planeRun, plane);
  const slices: VolumeSlice[] = Array.from({ length: sliceCount }, (_unused, index) => {
    const isSelected = index === selectedSliceIndex;
    return {
      index,
      isSelected,
      hasResult: isSelected,
      imageUrl: isSelected ? assets.image : undefined,
      overlayUrl: isSelected ? assets.overlay : undefined,
    };
  });
  return {
    plane,
    seriesId: planeRun.planeRunId ?? `${plane}-series`,
    sliceCount,
    selectedSliceIndex,
    dimensions: Array.isArray(input.canonicalShape) ? input.canonicalShape : undefined,
    inPlaneSpacingMm: Array.isArray(input.inPlaneSpacingMm) ? input.inPlaneSpacingMm : undefined,
    slices,
  };
}

export function buildVolumeWorkspace(
  run: CanonicalMultiplanarRun | null | undefined,
  resolveAssets: PlaneAssetResolver = defaultPlaneAssetResolver,
): VolumeWorkspace {
  if (!run?.planes) return {};
  return {
    sagittal: buildVolumeStack(run.planes.sagittal, resolveAssets) ?? undefined,
    axial: buildVolumeStack(run.planes.axial, resolveAssets) ?? undefined,
  };
}

/** Default resolver used by the app; reuses the existing sanitized asset URLs. */
export const defaultPlaneAssetResolver: PlaneAssetResolver = (planeRun, plane) => {
  const urls = resolvePlaneAssetUrls(planeRun, plane, aiAssetUrl, API_BASE_URL);
  return { image: urls["input.png"], overlay: urls["overlay.png"] };
};
