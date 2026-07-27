import type { Plane } from "../appTypes";
import type {
  CanonicalAssetName,
  CanonicalLandmark,
  CanonicalMeasurement,
  CanonicalMultiplanarRun,
  CanonicalPlaneAsset,
  CanonicalPlaneInput,
  CanonicalPlaneMask,
  CanonicalPlaneModel,
  CanonicalPlaneRun,
  CanonicalPlaneSeriesItem,
} from "../contracts/canonicalMultiplanarRun";

/**
 * Pure selectors over CanonicalMultiplanarRun / CanonicalPlaneRun. No v1/v2
 * interpretation, no alias resolution, no invented clinical defaults — that
 * belongs exclusively to src/adapters/multiplanarRunAdapter.ts. Empty arrays
 * / undefined are structural absence, not a clinical value.
 */

export function getSagittalPlane(run: CanonicalMultiplanarRun | null | undefined): CanonicalPlaneRun | undefined {
  return run?.planes?.sagittal;
}

export function getAxialPlane(run: CanonicalMultiplanarRun | null | undefined): CanonicalPlaneRun | undefined {
  return run?.planes?.axial;
}

export function getPlane(run: CanonicalMultiplanarRun | null | undefined, plane: Plane): CanonicalPlaneRun | undefined {
  return plane === "sagittal" ? getSagittalPlane(run) : getAxialPlane(run);
}

export function getPlaneMeasurements(run: CanonicalMultiplanarRun | null | undefined, plane: Plane): CanonicalMeasurement[] {
  return getPlane(run, plane)?.measurements ?? [];
}

export function getPlaneLandmarks(run: CanonicalMultiplanarRun | null | undefined, plane: Plane): CanonicalLandmark[] {
  return getPlane(run, plane)?.landmarks ?? [];
}

export function getPlaneSeries(run: CanonicalMultiplanarRun | null | undefined, plane: Plane): CanonicalPlaneSeriesItem[] {
  return getPlane(run, plane)?.series ?? [];
}

export function getPlaneMasks(run: CanonicalMultiplanarRun | null | undefined, plane: Plane): CanonicalPlaneMask[] {
  return getPlane(run, plane)?.masks ?? [];
}

export function getPlaneAssets(run: CanonicalMultiplanarRun | null | undefined, plane: Plane): CanonicalPlaneAsset[] {
  return getPlane(run, plane)?.assets ?? [];
}

export function getPublicAssetUrl(plane: CanonicalPlaneRun | null | undefined, assetName: CanonicalAssetName): string | undefined {
  return plane?.assets.find((asset) => asset.assetName === assetName)?.url;
}

export function getPlaneModelProvenance(plane: CanonicalPlaneRun | null | undefined): CanonicalPlaneModel | undefined {
  return plane?.model;
}

export function getPlaneInputProvenance(plane: CanonicalPlaneRun | null | undefined): CanonicalPlaneInput | undefined {
  return plane?.input;
}
