/**
 * Strict parser/validator for the `pfi.lumbar-geometric-proxy.v1` mesh asset
 * (AI Module P9-A.3.1.1). This is untrusted JSON fetched from a URL — never
 * assume shape, never let it reach the Three.js component unvalidated.
 */

export type ThreeDProxyAssetErrorCode =
  | "EMPTY_ASSET"
  | "UNKNOWN_SCHEMA"
  | "UNEXPECTED_KIND"
  | "UNEXPECTED_METHOD"
  | "UNSAFE_ANATOMICAL_CLAIM"
  | "UNSAFE_VOLUMETRIC_CLAIM"
  | "UNKNOWN_COORDINATE_SYSTEM"
  | "UNKNOWN_UNITS"
  | "EMPTY_VERTICES"
  | "VERTICES_TOO_LARGE"
  | "INVALID_VERTEX"
  | "NON_FINITE_VERTEX"
  | "EMPTY_FACES"
  | "FACES_TOO_LARGE"
  | "INVALID_FACE"
  | "FACE_OUT_OF_RANGE"
  | "STRUCTURES_TOO_LARGE"
  | "INVALID_STRUCTURE"
  | "INVALID_STRUCTURE_RANGE"
  | "STRUCTURE_OUT_OF_RANGE"
  | "LIMITATIONS_TOO_LARGE"
  | "UNSAFE_STRING";

export class ThreeDProxyAssetError extends Error {
  readonly code: ThreeDProxyAssetErrorCode;

  constructor(message: string, code: ThreeDProxyAssetErrorCode) {
    super(message);
    this.name = "ThreeDProxyAssetError";
    this.code = code;
  }
}

export type ThreeDProxyVertex = [number, number, number];
export type ThreeDProxyFace = [number, number, number];

export type ThreeDProxyStructure = {
  label: string;
  vertexStart: number;
  vertexCount: number;
  faceStart: number;
  faceCount: number;
};

export type ThreeDProxyMeshAsset = {
  schemaVersion: string;
  kind: string;
  method: string;
  anatomicalReconstruction: false;
  volumetricReconstruction: false;
  coordinateSystem: string;
  units: string;
  vertices: ThreeDProxyVertex[];
  faces: ThreeDProxyFace[];
  structures: ThreeDProxyStructure[];
  mappingSource?: string;
  mappingValidated?: boolean;
  limitations: string[];
  sourcePlaneRunIds: { sagittal: string | null; axial: string | null };
};

const EXPECTED_SCHEMA_VERSION = "pfi.lumbar-geometric-proxy.v1";
const EXPECTED_KIND = "experimental_geometric_proxy";
const EXPECTED_METHOD = "dual_plane_bbox_proxy";
const EXPECTED_COORDINATE_SYSTEM = "local_proxy_space";
const EXPECTED_UNITS = "normalized";

const MAX_VERTICES = 20000;
const MAX_FACES = 20000;
const MAX_STRUCTURES = 200;
const MAX_LIMITATIONS = 50;

// No URLs, no Windows/Unix internal paths, no HTML/script content in any
// asset-provided text field (labels, limitations).
const UNSAFE_STRING_PATTERN = /<script|<\/script|javascript:|^[a-zA-Z]:\\|\\\\|\/etc\/|\/tmp\/|\/app\/|127\.0\.0\.1|localhost|\.internal\b|https?:\/\//i;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function fail(message: string, code: ThreeDProxyAssetErrorCode): never {
  throw new ThreeDProxyAssetError(message, code);
}

function assertSafeString(value: string, context: string) {
  if (UNSAFE_STRING_PATTERN.test(value)) fail(`Contenido inseguro detectado en ${context}.`, "UNSAFE_STRING");
}

function parseVertex(raw: unknown, index: number): ThreeDProxyVertex {
  if (!Array.isArray(raw) || raw.length !== 3) fail(`Vértice ${index} con forma inválida.`, "INVALID_VERTEX");
  const [x, y, z] = raw;
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") fail(`Vértice ${index} no numérico.`, "INVALID_VERTEX");
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) fail(`Vértice ${index} no finito.`, "NON_FINITE_VERTEX");
  return [x, y, z];
}

function parseFace(raw: unknown, index: number, vertexCount: number): ThreeDProxyFace {
  if (!Array.isArray(raw) || raw.length !== 3) fail(`Cara ${index} con forma inválida.`, "INVALID_FACE");
  const [a, b, c] = raw;
  for (const value of [a, b, c]) {
    if (typeof value !== "number" || !Number.isInteger(value)) fail(`Cara ${index} con índice no entero.`, "INVALID_FACE");
    if (value < 0 || value >= vertexCount) fail(`Cara ${index} fuera de rango de vértices.`, "FACE_OUT_OF_RANGE");
  }
  return [a as number, b as number, c as number];
}

function parseStructure(raw: unknown, index: number, vertexCount: number, faceCount: number): ThreeDProxyStructure {
  const record = asRecord(raw);
  if (!record) fail(`Estructura ${index} inválida.`, "INVALID_STRUCTURE");
  const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : undefined;
  if (!label) fail(`Estructura ${index} sin label.`, "INVALID_STRUCTURE");
  assertSafeString(label, `structures[${index}].label`);

  const { vertexStart, vertexCount: structureVertexCount, faceStart, faceCount: structureFaceCount } = record;
  const ranges = [vertexStart, structureVertexCount, faceStart, structureFaceCount];
  if (!ranges.every((value) => typeof value === "number" && Number.isInteger(value))) {
    fail(`Estructura ${index} con rangos inválidos.`, "INVALID_STRUCTURE_RANGE");
  }
  const vStart = vertexStart as number;
  const vCount = structureVertexCount as number;
  const fStart = faceStart as number;
  const fCount = structureFaceCount as number;
  if (vStart < 0 || vCount < 0 || vStart + vCount > vertexCount) fail(`Estructura ${index} fuera de rango de vértices.`, "STRUCTURE_OUT_OF_RANGE");
  if (fStart < 0 || fCount < 0 || fStart + fCount > faceCount) fail(`Estructura ${index} fuera de rango de caras.`, "STRUCTURE_OUT_OF_RANGE");

  return { label, vertexStart: vStart, vertexCount: vCount, faceStart: fStart, faceCount: fCount };
}

export function parseThreeDProxyMeshAsset(raw: unknown): ThreeDProxyMeshAsset {
  const record = asRecord(raw);
  if (!record) fail("Respuesta del asset 3D vacía o inválida.", "EMPTY_ASSET");

  if (record.schemaVersion !== EXPECTED_SCHEMA_VERSION) fail(`Schema de asset 3D no reconocido: ${String(record.schemaVersion)}.`, "UNKNOWN_SCHEMA");
  if (record.kind !== EXPECTED_KIND) fail("El asset 3D no declara kind=experimental_geometric_proxy.", "UNEXPECTED_KIND");
  if (record.method !== EXPECTED_METHOD) fail("El asset 3D no declara method=dual_plane_bbox_proxy.", "UNEXPECTED_METHOD");
  if (record.anatomicalReconstruction !== false) fail("El asset 3D debe declarar anatomicalReconstruction=false.", "UNSAFE_ANATOMICAL_CLAIM");
  if (record.volumetricReconstruction !== false) fail("El asset 3D debe declarar volumetricReconstruction=false.", "UNSAFE_VOLUMETRIC_CLAIM");
  if (record.coordinateSystem !== EXPECTED_COORDINATE_SYSTEM) fail("Sistema de coordenadas del asset 3D no reconocido.", "UNKNOWN_COORDINATE_SYSTEM");
  if (record.units !== EXPECTED_UNITS) fail("Unidades del asset 3D no reconocidas.", "UNKNOWN_UNITS");

  const rawVertices = record.vertices;
  if (!Array.isArray(rawVertices) || rawVertices.length === 0) fail("El asset 3D no contiene vértices.", "EMPTY_VERTICES");
  if (rawVertices.length > MAX_VERTICES) fail("El asset 3D excede el límite de vértices permitido.", "VERTICES_TOO_LARGE");
  const vertices = rawVertices.map((item, index) => parseVertex(item, index));

  const rawFaces = record.faces;
  if (!Array.isArray(rawFaces) || rawFaces.length === 0) fail("El asset 3D no contiene caras.", "EMPTY_FACES");
  if (rawFaces.length > MAX_FACES) fail("El asset 3D excede el límite de caras permitido.", "FACES_TOO_LARGE");
  const faces = rawFaces.map((item, index) => parseFace(item, index, vertices.length));

  const rawStructures = Array.isArray(record.structures) ? record.structures : [];
  if (rawStructures.length > MAX_STRUCTURES) fail("El asset 3D excede el límite de estructuras permitido.", "STRUCTURES_TOO_LARGE");
  const structures = rawStructures.map((item, index) => parseStructure(item, index, vertices.length, faces.length));

  const rawLimitations = Array.isArray(record.limitations) ? record.limitations : [];
  if (rawLimitations.length > MAX_LIMITATIONS) fail("El asset 3D excede el límite de limitaciones permitido.", "LIMITATIONS_TOO_LARGE");
  const limitations = rawLimitations.filter((item): item is string => typeof item === "string");
  limitations.forEach((item, index) => assertSafeString(item, `limitations[${index}]`));

  const traceability = asRecord(record.traceability);
  const parameters = asRecord(traceability?.parameters);
  const mappingSource = typeof record.mappingSource === "string"
    ? record.mappingSource
    : typeof parameters?.mappingSource === "string" ? parameters.mappingSource : undefined;
  const mappingValidated = typeof record.mappingValidated === "boolean"
    ? record.mappingValidated
    : typeof parameters?.mappingValidated === "boolean" ? parameters.mappingValidated : undefined;

  const models = asRecord(traceability?.models);
  const sagittalTrace = asRecord(models?.sagittal);
  const axialTrace = asRecord(models?.axial);

  return {
    schemaVersion: record.schemaVersion,
    kind: record.kind,
    method: record.method,
    anatomicalReconstruction: false,
    volumetricReconstruction: false,
    coordinateSystem: record.coordinateSystem,
    units: record.units,
    vertices,
    faces,
    structures,
    mappingSource,
    mappingValidated,
    limitations,
    sourcePlaneRunIds: {
      sagittal: typeof sagittalTrace?.runId === "string" ? sagittalTrace.runId : null,
      axial: typeof axialTrace?.runId === "string" ? axialTrace.runId : null,
    },
  };
}
