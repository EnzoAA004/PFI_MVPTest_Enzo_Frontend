import { API_BASE_URL } from "./api";
import { authHeaders, refreshDoctorSession } from "./authClient";
import { ensureAuthSession } from "./authStorage";
import { isDurableMeshAssetUrl, parseMultiplanarRunResponse } from "./adapters/multiplanarRunAdapter";
import { toSafeFrontendError } from "./security/safeError";
import { generateTraceId } from "./security/traceId";
import type { CanonicalMultiplanarRun } from "./contracts/canonicalMultiplanarRun";
import type { InputResponse, StudyIngestionResponse } from "./contracts/inputApiTypes";
import type { RunReviewRequest, RunReviewResponse } from "./contracts/reviewApiTypes";
import type { AssetName, DiagnosticEndpointResponse, MultiplanarRunPayload } from "./contracts/multiplanarHttpTypes";
import type { MultiplanarContract } from "./multiplanarTypes";
import type { Plane } from "./appTypes";

export type ModelSyncResponse = Record<string, unknown> & {
  status?: string;
  readyForRealInference?: boolean;
  defaultInferenceMode?: string;
  proxiedByBackend?: boolean;
  humanReviewRequired?: boolean;
  notClinicalDiagnosis?: boolean;
};

export class BackendApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly traceId?: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

function responseString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function backendErrorFrom(response: Response, path: string, traceId: string) {
  let body: Record<string, unknown> | undefined;
  try {
    const parsed = await response.clone().json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    body = undefined;
  }
  const code = responseString(body?.code) ?? responseString(body?.errorCode) ?? responseString(body?.error);
  const backendMessage = responseString(body?.message) ?? responseString(body?.detail);
  const message = code === "AI_MULTIPLANAR_CONTRACT_VIOLATION" || code === "AI_CONTRACT_VIOLATION"
    ? "El modelo sagital no devolvió el contrato real esperado."
    : toSafeFrontendError(response.status, { code, traceId, candidateMessage: backendMessage }).message;
  return new BackendApiError(message, response.status, path, traceId, code);
}

export async function multiplanarRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const traceId = generateTraceId("frontend-multiplanar");
  const isFormData = init?.body instanceof FormData;
  const requestInit = (): RequestInit => ({
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      "X-Trace-Id": traceId,
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  // Ver api.ts: la sesión se hidrata desde IndexedDB y el request no debe salir antes.
  await ensureAuthSession();
  let response = await fetch(`${API_BASE_URL}${path}`, requestInit());
  if (response.status === 401) {
    await refreshDoctorSession();
    response = await fetch(`${API_BASE_URL}${path}`, requestInit());
  }
  if (!response.ok) throw await backendErrorFrom(response, path, traceId);
  return await response.json() as T;
}

export async function uploadAiInput(file: File, caseId: string, plane: Plane): Promise<InputResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("caseId", caseId);
  formData.append("plane", plane);
  return multiplanarRequest<InputResponse>("/api/ai/inputs", {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
}

/**
 * Sube un estudio completo en un solo archivo y deja que el módulo separe las series.
 *
 * Es lo contrario de `uploadAiInput`, donde el médico declara a mano qué plano es cada
 * archivo. Acá el plano lo decide la metadata DICOM, que es quien lo sabe: el estudio
 * ya trae esa información y pedírsela al médico es pedirle que repita un dato que el
 * archivo contiene.
 */
export async function uploadStudyArchive(file: File, caseId: string): Promise<StudyIngestionResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("caseId", caseId);
  return multiplanarRequest<StudyIngestionResponse>("/api/ai/studies", {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
}

export async function getMultiplanarContract(): Promise<MultiplanarContract> {
  return multiplanarRequest<MultiplanarContract>("/api/ai/multiplanar/contract");
}

export async function getAiHealthStatus(): Promise<DiagnosticEndpointResponse> {
  return multiplanarRequest<DiagnosticEndpointResponse>("/api/ai/health");
}

export async function getAiReadinessStatus(): Promise<DiagnosticEndpointResponse> {
  return multiplanarRequest<DiagnosticEndpointResponse>("/api/ai/readiness");
}

export async function getAiModelsStatus(): Promise<DiagnosticEndpointResponse> {
  return multiplanarRequest<DiagnosticEndpointResponse>("/api/ai/models");
}

export async function verifyAiModelsStatus(): Promise<DiagnosticEndpointResponse> {
  return multiplanarRequest<DiagnosticEndpointResponse>("/api/ai/models/verify");
}

export async function getAiRuntimeStatus(): Promise<DiagnosticEndpointResponse> {
  return multiplanarRequest<DiagnosticEndpointResponse>("/api/ai/models/runtime");
}

export async function getSystemDiagnosticsStatus(): Promise<DiagnosticEndpointResponse> {
  return multiplanarRequest<DiagnosticEndpointResponse>("/api/system/diagnostics");
}

export async function syncRealModelArtifacts(force = false): Promise<ModelSyncResponse> {
  return multiplanarRequest<ModelSyncResponse>(`/api/ai/models/sync?force=${force}`, { method: "POST" });
}

export async function runMultiplanarAnalysis(payload: MultiplanarRunPayload): Promise<CanonicalMultiplanarRun> {
  const raw = await multiplanarRequest<unknown>("/api/ai/multiplanar/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parseMultiplanarRunResponse(raw);
}

/**
 * Los resultados de una corrida en formato DICOM: la segmentación como SEG, las mediciones
 * como SR.
 *
 * Es lo que permite abrirlos en 3D Slicer, OHIF o un PACS de hospital sin este software en
 * el medio. Las otras exportaciones —HTML, CSV, JSON— solo las entiende este producto.
 *
 * Devuelve el binario tal cual. No se parsea nada acá: un DICOM es un formato que el
 * navegador no tiene por qué entender, y lo único que hace falta es guardarlo.
 */
export async function fetchRunDicomExport(
  planeRunId: string,
  plane: Plane,
  kind: "segmentation" | "measurements",
): Promise<Blob> {
  const file = kind === "segmentation" ? "segmentation.dcm" : "measurements.sr.dcm";
  const path = `/api/ai/runs/${encodeURIComponent(planeRunId)}/${plane}/${file}`;
  const traceId = generateTraceId("frontend-dicom-export");
  await ensureAuthSession();
  const init = (): RequestInit => ({ headers: { "X-Trace-Id": traceId, ...authHeaders() } });
  let response = await fetch(`${API_BASE_URL}${path}`, init());
  if (response.status === 401) {
    await refreshDoctorSession();
    response = await fetch(`${API_BASE_URL}${path}`, init());
  }
  if (!response.ok) throw await backendErrorFrom(response, path, traceId);
  return await response.blob();
}

/**
 * Clasificación subarticular sobre un punto marcado por el profesional.
 *
 * El modelo no localiza el receso por su cuenta, así que la coordenada la pone el médico
 * y el hallazgo que vuelve es de alcance de investigación. Va por el Backend, nunca
 * directo a FastAPI: la arquitectura es Frontend -> Backend -> AI Module.
 *
 * La coordenada viaja en **píxeles del DICOM**, no en la base del visor. La conversión la
 * hace `viewerPointToImagePixels`; mandar la coordenada sin convertir devuelve un
 * resultado de otra parte de la anatomía, con la misma pinta de ser correcto.
 *
 * No se parsea acá: el llamador lo pasa por `parseDegenerativeFindings`, que es el
 * parseo estricto del contrato y descarta un hallazgo mal formado en vez de mostrarlo a
 * medias.
 */
export async function requestSubarticularClassification(payload: {
  inputId: string;
  instanceNumber: number;
  x: number;
  y: number;
  side: "left" | "right";
  level: string;
}): Promise<unknown> {
  return multiplanarRequest<unknown>("/api/ai/degenerative-findings/subarticular", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/*
 * getRunReview/submitRunReview vivían acá con estados accepted/observed/rejected/
 * edited, en paralelo al pendiente/observado/aceptado/descartado de updateReview.
 * Eran dos contratos de API para el mismo acto profesional; quedó el de api.ts,
 * que es el que usa la sala de lectura.
 */
export function aiAssetUrl(runId: string, plane: Plane, assetName: AssetName): string {
  return `${API_BASE_URL}/api/ai/assets/${encodeURIComponent(runId)}/${plane}/${assetName}`;
}

/**
 * Fetches the raw 3D proxy mesh JSON from a URL already sanitized by
 * multiplanarRunAdapter.ts (parseThreeD/isDurableMeshAssetUrl never let an
 * internal path or arbitrary host through `threeD.assets[].url`). This does
 * not build or guess any backend route — it only follows whatever URL the
 * canonical run already carries. Callers must run the result through
 * parseThreeDProxyMeshAsset before trusting its shape.
 *
 * Defense in depth: the origin is re-validated here, independently of the
 * adapter, before any network call — a malicious/mismatched origin is
 * rejected outright and the doctor's JWT (authHeaders()) is never attached
 * to it, not even a request without credentials is attempted.
 */
export async function fetchThreeDProxyAsset(url: string): Promise<unknown> {
  const sanitizedUrl = isDurableMeshAssetUrl(url);
  if (!sanitizedUrl) throw new BackendApiError("URL del asset 3D no autorizada.", 0, url);
  const traceId = generateTraceId("frontend-threed-asset");
  const target = sanitizedUrl.startsWith("/api/") ? `${API_BASE_URL}${sanitizedUrl}` : sanitizedUrl;
  let response = await fetch(target, { headers: { "X-Trace-Id": traceId, ...authHeaders() } });
  if (response.status === 401) {
    await refreshDoctorSession();
    response = await fetch(target, { headers: { "X-Trace-Id": traceId, ...authHeaders() } });
  }
  if (!response.ok) throw await backendErrorFrom(response, sanitizedUrl, traceId);
  return await response.json();
}
