/**
 * Fixtures sanitizados basados en evidencia real de despliegue en Railway
 * (PFI_AI_SERVICE_MULTIPLANAR_CONTRACT_VERSION=v2). No contienen
 * identificadores reales, tokens, URLs de tunel ni rutas internas.
 */

const NINE_MEASUREMENT_LABEL_KEYS = [
  "vertebra_group area",
  "vertebra_group width",
  "vertebra_group height",
  "canal area",
  "canal width",
  "canal height",
  "disc_group area",
  "disc_group width",
  "disc_group height",
];

function buildMeasurements(): unknown[] {
  return NINE_MEASUREMENT_LABEL_KEYS.map((labelKey, index) => ({
    id: `m-${index + 1}`,
    labelKey,
    value: 12.4 + index,
    unit: labelKey.endsWith("area") ? "mm2" : "mm",
    confidence: 0.91,
    status: "AI",
    placeholder: false,
    plane: "sagittal",
  }));
}

/** Respuesta publica actual (pfi.multiplanar-run.v2) tal como la sirve el backend. */
export const rawMultiplanarRunV2Fixture = {
  status: "completed",
  schemaVersion: "pfi.multiplanar-run.v2",
  runId: "run-fixture-v2-0001",
  traceId: "trace-fixture-v2-0001",
  caseId: "CASE-FIXTURE-0001",
  workspaceMode: "sagittal_only",
  requestedInferenceMode: "real_baseline",
  effectiveInferenceMode: "real_baseline",
  humanReviewRequired: true,
  notClinicalDiagnosis: true,
  synthetic: false,
  fallbackReason: null,
  planes: {
    sagittal: {
      runId: "plane-run-fixture-v2-sagittal-0001",
      plane: "sagittal",
      status: "completed",
      effectiveInferenceMode: "real_baseline",
      synthetic: false,
      fallbackReason: null,
      humanReviewRequired: true,
      notClinicalDiagnosis: true,
      modelKey: "sagittal_spider",
      modelVersion: "sagittal-spider-final-v1",
      artifactHash: "cf11dcc0ad77a7c787e64a796a2fd7398ef906add461cef4b3d61f1a5238e944",
      coordinateSpace: "canonical_voxel",
      metadata: {
        inputId: "input-fixture-v2-0001",
        inputShapeNative: [320, 320, 24],
        inputShapeCanonical: [24, 320, 320],
        inputOrientationTransform: "move_axis_0_to_last",
        selectedSlice: 12,
        sliceCount: 24,
        selectedAxis: 0,
        inPlaneSpacing: [0.7, 0.7],
      },
      assets: {
        "input.png": { url: "/api/ai/assets/run-fixture-v2-0001/sagittal/input.png" },
        "overlay.png": { url: "/api/ai/assets/run-fixture-v2-0001/sagittal/overlay.png" },
      },
      masks: [
        { id: "mask-1", label: "vertebra_group", role: "segmentation", url: "/api/ai/assets/run-fixture-v2-0001/sagittal/mask-preview.png" },
        { id: "mask-2", label: "canal", role: "segmentation", url: "/api/ai/assets/run-fixture-v2-0001/sagittal/mask-preview.png" },
        { id: "mask-3", label: "disc_group", role: "segmentation", url: "/api/ai/assets/run-fixture-v2-0001/sagittal/mask-preview.png" },
      ],
      landmarks: [
        { id: "lm-1", labelKey: "vertebra_group_centroid", x: 120.4, y: 88.1, coordinateSpace: "canonical_voxel" },
        { id: "lm-2", labelKey: "canal_centroid", x: 130.2, y: 95.6, coordinateSpace: "canonical_voxel" },
        { id: "lm-3", labelKey: "disc_group_centroid", x: 118.7, y: 101.3, coordinateSpace: "canonical_voxel" },
      ],
      measurements: buildMeasurements(),
      quality: { status: "ok", warnings: [] },
    },
  },
};

/**
 * Respuesta v1 historica tal como puede reaparecer al reabrir estudios
 * persistidos antes de la migracion a pfi.multiplanar-run.v2. Mezcla
 * aliases legacy (modelArtifact, aiOutput, label en vez de labelKey).
 */
export const rawMultiplanarRunV1Fixture = {
  status: "completed",
  runId: "run-fixture-v1-0001",
  traceId: "trace-fixture-v1-0001",
  caseId: "CASE-FIXTURE-0001",
  workspaceMode: "sagittal_only",
  requestedInferenceMode: "real_baseline",
  effectiveInferenceMode: "real_baseline",
  humanReviewRequired: true,
  notClinicalDiagnosis: true,
  planes: {
    sagittal: {
      runId: "plane-run-fixture-v1-sagittal-0001",
      plane: "sagittal",
      status: "completed",
      inferenceMode: "real_baseline",
      humanReviewRequired: true,
      notClinicalDiagnosis: true,
      modelArtifact: {
        key: "sagittal_spider",
        version: "sagittal-spider-final-v1",
        baselineReady: true,
        availableForRealInference: true,
      },
      aiOutput: {
        artifactHash: "cf11dcc0ad77a7c787e64a796a2fd7398ef906add461cef4b3d61f1a5238e944",
        realInferenceAvailable: true,
        humanReviewRequired: true,
        notClinicalDiagnosis: true,
      },
      metadata: {
        inputId: "input-fixture-v1-0001",
        nativeShape: [320, 320, 24],
        canonicalShape: [24, 320, 320],
        orientationTransform: "move_axis_0_to_last",
        selectedSliceIndex: 12,
        sliceCount: 24,
        selectedAxis: 0,
        inPlaneSpacingMm: [0.7, 0.7],
      },
      assets: {
        "input.png": "/api/ai/assets/run-fixture-v1-0001/sagittal/input.png",
        "overlay.png": "/api/ai/assets/run-fixture-v1-0001/sagittal/overlay.png",
        "mask.npy": "C:\\ai-module\\tmp\\run-fixture-v1-0001\\mask.npy",
      },
      landmarks: [
        { id: "lm-1", label: "vertebra_group_centroid", x: 120.4, y: 88.1 },
        { id: "lm-2", label: "canal_centroid", x: 130.2, y: 95.6 },
        { id: "lm-3", label: "disc_group_centroid", x: 118.7, y: 101.3 },
      ],
      measurements: {
        values: NINE_MEASUREMENT_LABEL_KEYS.map((label, index) => ({
          id: `m-${index + 1}`,
          label,
          value: 12.4 + index,
          unit: label.endsWith("area") ? "mm2" : "mm",
          confidence: 0.91,
          placeholder: false,
        })),
      },
    },
  },
};

export const SAGITTAL_FIXTURE_ARTIFACT_HASH = "cf11dcc0ad77a7c787e64a796a2fd7398ef906add461cef4b3d61f1a5238e944";
export const SAGITTAL_FIXTURE_MEASUREMENT_LABEL_KEYS = NINE_MEASUREMENT_LABEL_KEYS;

/**
 * Respuesta publica REAL de POST /api/ai/multiplanar/run tal como la produce
 * CanonicalMultiplanarRunLegacyPresenter (P8) para un contrato v2. No es el
 * wire directo del AI Module: el presenter todavia no expone root.synthetic
 * ni plane.synthetic de forma directa, sino a traves de degradedMode /
 * aiOutput.synthetic / metadata.synthetic (ver P9-C.1.1 en la documentacion).
 * Corrida limpia real_baseline, sin fallback.
 */
export const rawMultiplanarRunV2PublicPresenterFixture = {
  status: "completed",
  schemaVersion: "pfi.multiplanar-run.v2",
  runId: "run-fixture-v2-presenter-0001",
  traceId: "trace-fixture-v2-presenter-0001",
  caseId: "CASE-FIXTURE-PRESENTER-0001",
  workspaceMode: "sagittal_only",
  requestedInferenceMode: "real_baseline",
  effectiveInferenceMode: "real_baseline",
  humanReviewRequired: true,
  notClinicalDiagnosis: true,
  degradedMode: false,
  planes: {
    sagittal: {
      runId: "plane-run-fixture-v2-presenter-sagittal-0001",
      plane: "sagittal",
      status: "completed",
      effectiveInferenceMode: "real_baseline",
      degradedMode: false,
      allowContractFallback: false,
      humanReviewRequired: true,
      notClinicalDiagnosis: true,
      modelKey: "sagittal_spider",
      modelVersion: "sagittal-spider-final-v1",
      artifactHash: "cf11dcc0ad77a7c787e64a796a2fd7398ef906add461cef4b3d61f1a5238e944",
      coordinateSpace: "canonical_voxel",
      modelArtifact: {
        baselineReady: true,
        availableForRealInference: true,
      },
      aiOutput: {
        synthetic: false,
        fallbackReason: null,
        realInferenceAvailable: true,
      },
      metadata: {
        synthetic: false,
        fallbackReason: null,
        inputId: "input-fixture-v2-presenter-0001",
        inputShapeNative: [320, 320, 24],
        inputShapeCanonical: [24, 320, 320],
        inputOrientationTransform: "move_axis_0_to_last",
        selectedSlice: 12,
        sliceCount: 24,
        selectedAxis: 0,
        inPlaneSpacing: [0.7, 0.7],
      },
      assets: {
        "input.png": { url: "/api/ai/assets/run-fixture-v2-presenter-0001/sagittal/input.png" },
        "overlay.png": { url: "/api/ai/assets/run-fixture-v2-presenter-0001/sagittal/overlay.png" },
      },
      masks: [
        { id: "mask-1", label: "vertebra_group", role: "segmentation", url: "/api/ai/assets/run-fixture-v2-presenter-0001/sagittal/mask-preview.png" },
        { id: "mask-2", label: "canal", role: "segmentation", url: "/api/ai/assets/run-fixture-v2-presenter-0001/sagittal/mask-preview.png" },
        { id: "mask-3", label: "disc_group", role: "segmentation", url: "/api/ai/assets/run-fixture-v2-presenter-0001/sagittal/mask-preview.png" },
      ],
      landmarks: [
        { id: "lm-1", labelKey: "vertebra_group_centroid", x: 120.4, y: 88.1, coordinateSpace: "canonical_voxel" },
        { id: "lm-2", labelKey: "canal_centroid", x: 130.2, y: 95.6, coordinateSpace: "canonical_voxel" },
        { id: "lm-3", labelKey: "disc_group_centroid", x: 118.7, y: 101.3, coordinateSpace: "canonical_voxel" },
      ],
      measurements: buildMeasurements(),
      quality: { status: "ok", warnings: [] },
    },
  },
};

/**
 * Variante de la respuesta publica v2 sin ninguna fuente de synthetic ni de
 * degradedMode (ni root, ni plano, ni aiOutput, ni metadata). Debe producir
 * ContractError al parsear, identificando "synthetic" como campo faltante.
 */
export const rawMultiplanarRunV2MissingGovernanceFixture = (() => {
  const clone = JSON.parse(JSON.stringify(rawMultiplanarRunV2PublicPresenterFixture));
  delete clone.degradedMode;
  delete clone.planes.sagittal.degradedMode;
  delete clone.planes.sagittal.aiOutput.synthetic;
  delete clone.planes.sagittal.metadata.synthetic;
  return clone;
})();

/**
 * Variante de la respuesta publica v2 en modo fallback: el backend no pudo
 * completar inferencia real y degrado la corrida, informando sintetismo y
 * motivo de fallback a traves de los mismos alias del presenter P8.
 */
export const rawMultiplanarRunV2FallbackPresenterFixture = (() => {
  const clone = JSON.parse(JSON.stringify(rawMultiplanarRunV2PublicPresenterFixture));
  clone.degradedMode = true;
  clone.planes.sagittal.degradedMode = true;
  clone.planes.sagittal.allowContractFallback = true;
  clone.planes.sagittal.aiOutput.synthetic = true;
  clone.planes.sagittal.aiOutput.fallbackReason = "sagittal_model_unavailable_switched_to_synthetic";
  clone.planes.sagittal.aiOutput.realInferenceAvailable = false;
  clone.planes.sagittal.metadata.synthetic = true;
  clone.planes.sagittal.metadata.fallbackReason = "sagittal_model_unavailable_switched_to_synthetic";
  return clone;
})();
