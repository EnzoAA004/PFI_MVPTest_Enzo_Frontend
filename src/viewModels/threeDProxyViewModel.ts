import type { CanonicalThreeD } from "../contracts/canonicalMultiplanarRun";
import type { ThreeDProxyMeshAsset } from "../adapters/threeDProxyAssetParser";

/**
 * Pure conversion from canonical `threeD` + an already-fetched/validated mesh
 * asset into the shape the Three.js component consumes. No fetching, no HTTP,
 * no schemaVersion interpretation happens here or downstream in the
 * component — that belongs to the adapter/asset parser exclusively.
 */

export type ThreeDProxyVisualState =
  | "loading"
  | "available"
  | "blocked_missing_sagittal"
  | "blocked_missing_axial"
  | "blocked_missing_mapping"
  | "blocked_insufficient_geometry"
  | "asset_invalid"
  | "asset_error"
  | "unavailable";

export type ThreeDProxyAssetFetchState = {
  status: "idle" | "loading" | "loaded" | "invalid" | "error";
  asset?: ThreeDProxyMeshAsset;
  traceId?: string;
};

export type ThreeDProxyGeometry = {
  vertices: [number, number, number][];
  faces: [number, number, number][];
  structures: { label: string; vertexStart: number; vertexCount: number; faceStart: number; faceCount: number }[];
};

export type ThreeDProxyViewModel = {
  state: ThreeDProxyVisualState;
  title: string;
  description: string;
  warnings: string[];
  geometry?: ThreeDProxyGeometry;
  traceSummary: {
    mappingSource?: string;
    mappingValidated?: boolean;
    sagittalRunId: string | null;
    axialRunId: string | null;
  };
  flags: {
    experimental: true;
    anatomicalReconstruction: false;
    volumetricReconstruction: false;
    humanReviewRequired: boolean | null;
  };
  controlsEnabled: boolean;
  traceId?: string;
  retryable: boolean;
};

const TITLES: Record<ThreeDProxyVisualState, string> = {
  loading: "Cargando proxy geométrico experimental",
  available: "Proxy geométrico experimental",
  blocked_missing_sagittal: "Proxy no disponible",
  blocked_missing_axial: "Proxy no disponible",
  blocked_missing_mapping: "Proxy no disponible",
  blocked_insufficient_geometry: "Proxy no disponible",
  asset_invalid: "Proxy no disponible",
  asset_error: "Error al cargar el proxy 3D",
  unavailable: "Proxy no disponible",
};

const DESCRIPTIONS: Record<ThreeDProxyVisualState, string> = {
  loading: "Recuperando el asset geométrico experimental del backend.",
  available: "No representa una reconstrucción anatómica ni volumétrica. Revisión profesional obligatoria.",
  blocked_missing_sagittal: "Falta el plano sagital para generar el proxy geométrico.",
  blocked_missing_axial: "Falta el plano axial para generar el proxy geométrico.",
  blocked_missing_mapping: "No existe una correspondencia anatómica validada entre las clases sagitales y axiales.",
  blocked_insufficient_geometry: "Los resultados actuales no contienen la geometría necesaria.",
  asset_invalid: "El asset recibido no cumple el contrato esperado del proxy experimental.",
  asset_error: "No se pudo descargar el asset del proxy 3D.",
  unavailable: "El proxy geométrico experimental no está disponible para esta corrida.",
};

function stateFromStatus(status: string | undefined): ThreeDProxyVisualState {
  switch (status) {
    case "experimental_ready": return "available";
    case "blocked_missing_sagittal": return "blocked_missing_sagittal";
    case "blocked_missing_axial": return "blocked_missing_axial";
    case "experimental_blocked_missing_anatomical_mapping": return "blocked_missing_mapping";
    case "experimental_blocked_insufficient_geometry": return "blocked_insufficient_geometry";
    default: return "unavailable";
  }
}

function baseTraceSummary(threeD: CanonicalThreeD | undefined) {
  return {
    mappingSource: threeD?.reconstruction?.mappingSource,
    mappingValidated: threeD?.reconstruction?.mappingValidated,
    sagittalRunId: threeD?.sourcePlaneRunIds.sagittal ?? null,
    axialRunId: threeD?.sourcePlaneRunIds.axial ?? null,
  };
}

function baseFlags(humanReviewRequired: boolean | null) {
  return { experimental: true as const, anatomicalReconstruction: false as const, volumetricReconstruction: false as const, humanReviewRequired };
}

export function canonicalThreeDToProxyViewModel(
  threeD: CanonicalThreeD | undefined,
  assetState: ThreeDProxyAssetFetchState,
  humanReviewRequired: boolean | null = null,
): ThreeDProxyViewModel {
  const flags = baseFlags(humanReviewRequired);
  const traceSummary = baseTraceSummary(threeD);

  if (!threeD || !threeD.enabled) {
    const state = stateFromStatus(threeD?.status);
    return {
      state,
      title: TITLES[state],
      description: DESCRIPTIONS[state],
      warnings: threeD?.warnings ?? [],
      traceSummary,
      flags,
      controlsEnabled: false,
      traceId: assetState.traceId,
      retryable: false,
    };
  }

  // threeD.enabled=true but no usable asset survived sanitization/parsing
  // (e.g. a rejected host, or the AI Module declaring the mesh without an
  // asset entry) — there is nothing to fetch, so this must resolve
  // immediately instead of leaving the caller stuck in "loading" forever.
  if (threeD.assets.length === 0) {
    return {
      state: "asset_invalid",
      title: TITLES.asset_invalid,
      description: DESCRIPTIONS.asset_invalid,
      warnings: threeD.warnings,
      traceSummary,
      flags,
      controlsEnabled: false,
      traceId: assetState.traceId,
      retryable: false,
    };
  }

  if (assetState.status === "idle" || assetState.status === "loading") {
    return {
      state: "loading",
      title: TITLES.loading,
      description: DESCRIPTIONS.loading,
      warnings: threeD.warnings,
      traceSummary,
      flags,
      controlsEnabled: false,
      traceId: assetState.traceId,
      retryable: false,
    };
  }

  if (assetState.status === "error") {
    return {
      state: "asset_error",
      title: TITLES.asset_error,
      description: DESCRIPTIONS.asset_error,
      warnings: threeD.warnings,
      traceSummary,
      flags,
      controlsEnabled: false,
      traceId: assetState.traceId,
      retryable: true,
    };
  }

  if (assetState.status === "invalid" || !assetState.asset) {
    return {
      state: "asset_invalid",
      title: TITLES.asset_invalid,
      description: DESCRIPTIONS.asset_invalid,
      warnings: threeD.warnings,
      traceSummary,
      flags,
      controlsEnabled: false,
      traceId: assetState.traceId,
      retryable: false,
    };
  }

  const asset = assetState.asset;
  return {
    state: "available",
    title: TITLES.available,
    description: DESCRIPTIONS.available,
    warnings: [...threeD.warnings, ...asset.limitations],
    geometry: { vertices: asset.vertices, faces: asset.faces, structures: asset.structures },
    traceSummary: {
      mappingSource: asset.mappingSource ?? traceSummary.mappingSource,
      mappingValidated: asset.mappingValidated ?? traceSummary.mappingValidated,
      sagittalRunId: asset.sourcePlaneRunIds.sagittal ?? traceSummary.sagittalRunId,
      axialRunId: asset.sourcePlaneRunIds.axial ?? traceSummary.axialRunId,
    },
    flags,
    controlsEnabled: true,
    traceId: assetState.traceId,
    retryable: false,
  };
}
